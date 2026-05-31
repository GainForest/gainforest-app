"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  walkOccurrences,
  fetchSites,
  fetchBumicerts,
  type ExplorerRecord,
  type OccurrenceRecord,
  type BumicertRecord,
  type SiteRecord,
  type Page,
  type RecordKind,
  type OccurrenceFilter,
} from "../_lib/indexer";
import { RecordDrawer } from "./RecordDrawer";
import {
  formatRelative,
  formatNumber,
  countryFlag,
  shortDid,
} from "../_lib/format";

// The tabbed record explorer — three GainForest streams paged straight from
// Hyperindex in the browser (CORS-open), each opening a detail drawer. A
// search box filters the records already loaded; "Load more" walks the
// indexer cursor. Ported in spirit from GainForest/hyperscan's feed + data
// explorer, narrowed to the GainForest-relevant collections and re-skinned in
// the gainforest.earth editorial system.

type TabId = RecordKind;

const TABS: Array<{
  id: TabId;
  label: string;
  blurb: string;
  collection: string;
  pageSize: number;
}> = [
  {
    id: "occurrence",
    label: "Species observations",
    blurb: "Darwin Core occurrence records; photos, audio, and field data signed by communities and sensors.",
    collection: "app.gainforest.dwc.occurrence",
    pageSize: 24,
  },
  {
    id: "site",
    label: "Project sites",
    blurb: "Organizations stewarding land in the data commons, with their cover imagery and country.",
    collection: "app.gainforest.organization.info",
    pageSize: 24,
  },
  {
    id: "bumicert",
    label: "Bumicerts",
    blurb: "Hypercert impact claim activities; the verifiable proof-of-impact certificates communities mint.",
    collection: "org.hypercerts.claim.activity",
    pageSize: 24,
  },
];

type Phase = "idle" | "loading" | "ready" | "error" | "more";

type Stream = {
  records: ExplorerRecord[];
  cursor: string | null;
  hasMore: boolean;
  phase: Phase;
};

const EMPTY: Stream = { records: [], cursor: null, hasMore: true, phase: "idle" };

export function ExplorerTabs() {
  const [active, setActive] = useState<TabId>("occurrence");
  const [streams, setStreams] = useState<Record<TabId, Stream>>({
    occurrence: { ...EMPTY },
    site: { ...EMPTY },
    bumicert: { ...EMPTY },
  });
  const [query, setQuery] = useState("");
  const [occMedia, setOccMedia] = useState<OccurrenceFilter>("image");
  const [walking, setWalking] = useState(false);
  const [drawer, setDrawer] = useState<ExplorerRecord | null>(null);

  // One AbortController per tab so switching tabs cancels an in-flight walk.
  const controllers = useRef<Record<TabId, AbortController | null>>({
    occurrence: null,
    site: null,
    bumicert: null,
  });

  const load = useCallback(
    (tab: TabId, mode: "first" | "more") => {
      setStreams((prev) => {
        const s = prev[tab];
        if (mode === "first" && s.phase !== "idle") return prev;
        if (mode === "more" && (s.phase === "loading" || s.phase === "more" || !s.hasMore))
          return prev;
        return {
          ...prev,
          [tab]: { ...s, phase: mode === "first" ? "loading" : "more" },
        };
      });

      const current = streams[tab];
      if (mode === "first" && current.phase !== "idle") return;
      if (mode === "more" && (current.phase === "loading" || current.phase === "more" || !current.hasMore))
        return;

      const controller = new AbortController();
      controllers.current[tab]?.abort();
      controllers.current[tab] = controller;

      const after = mode === "more" ? current.cursor : null;
      const tabConfig = TABS.find((t) => t.id === tab)!;
      const base = mode === "more" ? current.records : [];

      const merge = (incoming: ExplorerRecord[]): ExplorerRecord[] => {
        const seen = new Set(base.map((r) => r.id));
        return [...base, ...incoming.filter((r) => !seen.has(r.id))];
      };

      // Occurrences walk the indexer progressively (media-bearing records are
      // sparse), streaming cards in as they're found. Sites + bumicerts are a
      // single dense page each.
      if (tab === "occurrence") {
        setWalking(true);
        walkOccurrences({
          media: occMedia,
          target: tabConfig.pageSize,
          after,
          signal: controller.signal,
          onProgress: (running) => {
            setStreams((prev) => ({
              ...prev,
              occurrence: { ...prev.occurrence, records: merge(running), phase: "ready" },
            }));
          },
        })
          .then((res) => {
            setStreams((prev) => ({
              ...prev,
              occurrence: {
                records: merge(res.records),
                cursor: res.cursor,
                hasMore: res.hasMore,
                phase: "ready",
              },
            }));
          })
          .catch((err) => {
            if ((err as Error).name === "AbortError") return;
            console.warn("[explorer] occurrence walk failed", err);
            setStreams((prev) => ({
              ...prev,
              occurrence: {
                ...prev.occurrence,
                phase: prev.occurrence.records.length ? "ready" : "error",
              },
            }));
          })
          .finally(() => {
            if (!controller.signal.aborted) setWalking(false);
          });
        return;
      }

      const request: Promise<Page<ExplorerRecord>> =
        tab === "site"
          ? fetchSites(tabConfig.pageSize, after, controller.signal)
          : fetchBumicerts(tabConfig.pageSize, after, controller.signal);

      request
        .then((page) => {
          setStreams((prev) => ({
            ...prev,
            [tab]: {
              records: merge(page.records),
              cursor: page.cursor,
              hasMore: page.hasMore,
              phase: "ready",
            },
          }));
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          console.warn(`[explorer] ${tab} fetch failed`, err);
          setStreams((prev) => ({
            ...prev,
            [tab]: { ...prev[tab], phase: prev[tab].records.length ? "ready" : "error" },
          }));
        });
    },
    [streams, occMedia],
  );

  // Load the active stream's first page whenever it's idle. This fires on tab
  // switch and after a media-filter reset drops the occurrence stream back to
  // idle. The phase guard makes it a no-op once a stream is loading/ready, so
  // it never loops on its own state changes.
  useEffect(() => {
    if (streams[active].phase === "idle") load(active, "first");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, streams]);

  // Reset the search when switching tabs so a query from one stream doesn't
  // hide everything in the next.
  useEffect(() => {
    setQuery("");
  }, [active]);

  // Changing the occurrence media filter resets that stream so it re-walks the
  // indexer with the new predicate.
  function changeMedia(next: OccurrenceFilter) {
    if (next === occMedia) return;
    setOccMedia(next);
    setQuery("");
    controllers.current.occurrence?.abort();
    setStreams((p) => ({ ...p, occurrence: { ...EMPTY } }));
  }

  const stream = streams[active];
  const filtered = filterRecords(stream.records, query);

  return (
    <section id="explore" className="scroll-mt-20 bg-background">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-6 pb-16 sm:px-10 lg:px-16 lg:pb-24">
        {/* Tab strip — compact pills, always visible; the active tab's blurb
            renders on the line below so the pills never overflow off-screen. */}
        <div className="flex flex-col gap-3.5 pt-2">
          <div
            className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1"
            role="tablist"
            aria-label="Record streams"
          >
            {TABS.map((t) => {
              const isActive = t.id === active;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(t.id)}
                  className={`group inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-[14px] font-medium transition-colors ${
                    isActive
                      ? "border-primary/35 bg-surface text-foreground"
                      : "border-border-soft bg-background text-foreground/60 hover:border-foreground/20 hover:text-foreground"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      isActive ? "pulse-dot bg-brand text-brand" : "bg-foreground/25"
                    }`}
                  />
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="max-w-[680px] text-[14px] leading-[1.5] text-foreground/60">
            {TABS.find((t) => t.id === active)?.blurb}
          </p>
        </div>

        {/* Toolbar */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-y border-border-soft py-3.5">
          <div className="relative flex-1" style={{ minWidth: "220px" }}>
            <svg
              aria-hidden
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder(active)}
              aria-label="Filter loaded records"
              className="w-full rounded-full border border-border-soft bg-surface py-2 pl-9 pr-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-primary/40"
            />
          </div>
          {active === "occurrence" && (
            <div className="inline-flex rounded-full border border-border-soft bg-surface p-0.5">
              {(
                [
                  { id: "image", label: "Photos" },
                  { id: "audio", label: "Audio" },
                  { id: "all", label: "All" },
                ] as Array<{ id: OccurrenceFilter; label: string }>
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => changeMedia(o.id)}
                  aria-pressed={occMedia === o.id}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                    occMedia === o.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[12.5px] text-foreground/55">
            <span
              aria-hidden
              className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand text-brand"
            />
            {query
              ? `${formatNumber(filtered.length)} of ${formatNumber(stream.records.length)} loaded`
              : `${formatNumber(stream.records.length)} loaded`}
          </div>
        </div>

        {/* Grid */}
        <div className="mt-6">
          {stream.phase === "loading" && stream.records.length === 0 ? (
            <SkeletonGrid kind={active} />
          ) : stream.phase === "error" && stream.records.length === 0 ? (
            <EmptyState
              title="Could not reach the indexer"
              body="The GainForest indexer did not respond. It may be momentarily degraded; check the status board below and try again."
              onRetry={() => {
                setStreams((p) => ({ ...p, [active]: { ...EMPTY } }));
              }}
            />
          ) : filtered.length === 0 ? (
            query ? (
              <EmptyState
                title="No matches in the loaded records"
                body="Try a different name, family, or country; or load more records to widen the search."
                onRetry={() => setQuery("")}
                retryLabel="Clear search"
              />
            ) : active === "occurrence" && occMedia !== "all" ? (
              <EmptyState
                title={`No ${occMedia === "image" ? "photo" : "audio"} records found nearby`}
                body="Media-bearing observations are sparse in the newest uploads. Switch to All records to browse the full live stream."
                onRetry={() => changeMedia("all")}
                retryLabel="Show all records"
              />
            ) : (
              <EmptyState title="No records yet" body="This stream is empty right now." />
            )
          ) : (
            <ul
              role="list"
              className={
                active === "occurrence"
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                  : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              }
            >
              {filtered.map((r, i) => (
                <li key={r.id} className="animate-in" style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}>
                  <RecordCard record={r} onOpen={() => setDrawer(r)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Walking hint (occurrence only) */}
        {active === "occurrence" && walking && stream.records.length > 0 && (
          <p className="mt-6 flex items-center justify-center gap-2 text-[13px] italic text-foreground/55">
            <Spinner /> Scanning the indexer for more{" "}
            {occMedia === "audio" ? "audio" : occMedia === "image" ? "photos" : "records"}…
          </p>
        )}

        {/* Load more */}
        {stream.records.length > 0 && !query && (
          <div className="mt-10 flex justify-center">
            {stream.hasMore ? (
              <button
                type="button"
                onClick={() => load(active, "more")}
                disabled={stream.phase === "more" || (active === "occurrence" && walking)}
                className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-6 py-3 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken disabled:opacity-60"
              >
                {stream.phase === "more" || (active === "occurrence" && walking) ? (
                  <>
                    <Spinner /> Loading more
                  </>
                ) : (
                  <>Load more records</>
                )}
              </button>
            ) : (
              <span className="text-[13px] italic text-foreground/50">
                You have reached the end of this stream.
              </span>
            )}
          </div>
        )}
      </div>

      <RecordDrawer record={drawer} onClose={() => setDrawer(null)} />
    </section>
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────

function RecordCard({ record, onOpen }: { record: ExplorerRecord; onOpen: () => void }) {
  if (record.kind === "occurrence") return <OccurrenceCard record={record} onOpen={onOpen} />;
  if (record.kind === "site") return <SiteCard record={record} onOpen={onOpen} />;
  return <BumicertCard record={record} onOpen={onOpen} />;
}

function OccurrenceCard({ record, onOpen }: { record: OccurrenceRecord; onOpen: () => void }) {
  const name = record.scientificName || record.vernacularName || "Unidentified";
  const cc = record.countryCode || (record.country ? record.country.slice(0, 2).toUpperCase() : "");
  const taxon = record.family || record.genus || record.kingdom || null;
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block aspect-square w-full overflow-hidden rounded-xl border border-border-soft bg-surface-sunken text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-18px_rgba(20,30,15,0.45)]"
    >
      {/* media badges (always top-right) */}
      {record.media.length > 0 && (
        <div className="absolute right-1.5 top-1.5 z-20 flex gap-1">
          {record.media.map((m) => (
            <span
              key={m}
              title={m}
              className="grid h-5 w-5 place-items-center rounded-full bg-background/90 text-foreground/70"
            >
              <MediaIcon kind={m} />
            </span>
          ))}
        </div>
      )}

      {hasImage ? (
        <>
          <Image
            src={record.imageUrl!}
            alt={name}
            fill
            sizes="(max-width:640px) 50vw, (max-width:1280px) 20vw, 280px"
            unoptimized={record.imageUrl!.startsWith("/")}
            onError={() => setImgError(true)}
            className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
          />
          <div
            className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-0.5 px-2.5 pb-2 pt-6"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, rgba(20,20,18,0.5) 45%, rgba(20,20,18,0.86) 100%)",
            }}
          >
            <div
              className="font-instrument text-[13px] italic leading-[1.15] text-[#f4efe4]"
              style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}
            >
              {name}
            </div>
            <div className="flex items-baseline justify-between font-mono text-[10px] text-[#f4efe4]/75">
              <span>{taxon || "—"}</span>
              {cc && <span className="text-brand">{countryFlag(record.countryCode)} {cc}</span>}
            </div>
          </div>
        </>
      ) : (
        // Editorial tile for imageless records (the common case in the "All"
        // and "Audio" streams). Subtle sage wash + serif species name reads as
        // a deliberate specimen card rather than an empty box.
        <div
          className="flex h-full w-full flex-col justify-between p-3"
          style={{
            background:
              "radial-gradient(120% 90% at 80% 0%, color-mix(in srgb, var(--primary) 9%, transparent), transparent), var(--surface)",
          }}
        >
          <div className="flex items-center gap-1.5 text-[9.5px] font-medium uppercase tracking-[0.12em] text-foreground/40">
            <LeafGlyph />
            {record.basisOfRecord ? record.basisOfRecord.replace(/_/g, " ") : "Observation"}
          </div>
          <div>
            <div
              className="font-garamond text-[17px] italic leading-[1.12] text-foreground"
              style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden" }}
            >
              {name}
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono text-[9.5px] text-foreground/50">
              <span>{taxon || formatRelative(record.createdAt)}</span>
              {cc && <span className="text-primary-dark">{countryFlag(record.countryCode)} {cc}</span>}
            </div>
          </div>
        </div>
      )}
    </button>
  );
}

function LeafGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 19c0-7 5-13 14-14 0 9-5 14-14 14zM5 19c3-3 6-5 9-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SiteCard({ record, onOpen }: { record: SiteRecord; onOpen: () => void }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface text-left shadow-[0_8px_26px_-20px_rgba(20,30,15,0.3)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-22px_rgba(20,30,15,0.4)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-sunken">
        {hasImage ? (
          <Image
            src={record.imageUrl!}
            alt={record.name}
            fill
            sizes="(max-width:640px) 100vw, (max-width:1280px) 33vw, 360px"
            unoptimized={record.imageUrl!.startsWith("/")}
            onError={() => setImgError(true)}
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-garamond text-[40px] text-foreground/15">
            {countryFlag(record.country) || "◰"}
          </div>
        )}
        {record.country && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-foreground/70">
            {countryFlag(record.country)} {record.country}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-4 pb-4 pt-3.5">
        <div className="font-garamond text-[18px] leading-[1.2] text-foreground">{record.name}</div>
        <div className="mt-auto flex items-center justify-between border-t border-border-soft pt-2.5 text-[11px] text-foreground/50">
          <span className="font-mono">{shortDid(record.did)}</span>
          <span>{record.createdAt ? formatRelative(record.createdAt) : "Organization"}</span>
        </div>
      </div>
    </button>
  );
}

function BumicertCard({ record, onOpen }: { record: BumicertRecord; onOpen: () => void }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface text-left shadow-[0_8px_26px_-20px_rgba(20,30,15,0.3)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-22px_rgba(20,30,15,0.4)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-sunken">
        {hasImage ? (
          <Image
            src={record.imageUrl!}
            alt=""
            fill
            sizes="(max-width:640px) 100vw, (max-width:1280px) 33vw, 360px"
            unoptimized={record.imageUrl!.startsWith("/")}
            onError={() => setImgError(true)}
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-garamond text-[15px] italic text-foreground/35">
            No cover image
          </div>
        )}
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-background/92 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-brand-dark">
          <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand text-brand" />
          Bumicert
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-4 pb-4 pt-3.5">
        <div
          className="font-garamond text-[17px] leading-[1.2] text-foreground"
          style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}
        >
          {record.title}
        </div>
        {record.shortDescription && (
          <div
            className="font-instrument text-[12.5px] italic leading-[1.4] text-foreground/65"
            style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}
          >
            {record.shortDescription}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between border-t border-border-soft pt-2.5 text-[11px] text-foreground/50">
          <span>
            {formatNumber(record.contributorCount)} contributor
            {record.contributorCount === 1 ? "" : "s"}
          </span>
          <span>{formatRelative(record.createdAt)}</span>
        </div>
      </div>
    </button>
  );
}

// ── Filtering ──────────────────────────────────────────────────────────────

function filterRecords(records: ExplorerRecord[], query: string): ExplorerRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  return records.filter((r) => haystack(r).includes(q));
}

function haystack(r: ExplorerRecord): string {
  if (r.kind === "occurrence") {
    return [
      r.scientificName,
      r.vernacularName,
      r.family,
      r.genus,
      r.kingdom,
      r.country,
      r.countryCode,
      r.locality,
      r.recordedBy,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  if (r.kind === "site") {
    return [r.name, r.country, r.did].filter(Boolean).join(" ").toLowerCase();
  }
  return [r.title, r.shortDescription, r.did].filter(Boolean).join(" ").toLowerCase();
}

function searchPlaceholder(tab: TabId): string {
  if (tab === "occurrence") return "Filter by species, family, or country…";
  if (tab === "site") return "Filter by organization or country…";
  return "Filter Bumicerts by title or description…";
}

// ── Bits ───────────────────────────────────────────────────────────────────

function MediaIcon({ kind }: { kind: OccurrenceRecord["media"][number] }) {
  if (kind === "audio" || kind === "spectrogram") {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "video") {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M8 5l11 7-11 7V5z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path d="M5 18l5-5 4 3 3-2 3 3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SkeletonGrid({ kind }: { kind: TabId }) {
  const count = kind === "occurrence" ? 15 : 8;
  const cls =
    kind === "occurrence"
      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  return (
    <div className={cls} aria-hidden>
      {Array.from({ length: count }).map((_, i) =>
        kind === "occurrence" ? (
          <div key={i} className="skeleton aspect-square rounded-xl" />
        ) : (
          <div key={i} className="overflow-hidden rounded-2xl border border-border-soft">
            <div className="skeleton aspect-[16/9]" />
            <div className="space-y-2 p-4">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function EmptyState({
  title,
  body,
  onRetry,
  retryLabel = "Try again",
}: {
  title: string;
  body: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <div className="font-garamond text-[22px] text-foreground">{title}</div>
      <p className="mt-2 max-w-[420px] text-[14px] leading-[1.5] text-foreground/60">{body}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-full border border-border-soft bg-surface px-5 py-2.5 text-[13.5px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
