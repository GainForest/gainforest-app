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
import { BrushedText } from "./BrushedText";
import { formatRelative, formatNumber, countryFlag, shortDid } from "../_lib/format";

// Single-stream record explorer. One of the three GainForest record types
// (Darwin Core occurrences, project sites, Bumicerts) paged straight from
// Hyperindex in the browser (CORS-open), each card opening a detail drawer.
// A search box filters the records already loaded; "Load more" walks the
// indexer cursor. This is the per-page form of the old combined tab view —
// the tab strip was replaced by top-nav routes so each stream is its own page.

type KindMeta = {
  eyebrow: string;
  /** `{word}` marks the brushed word. */
  titleBefore: string;
  titleItalic: string;
  lede: string;
  search: string;
  grid: "square" | "card";
};

const KIND_META: Record<RecordKind, KindMeta> = {
  occurrence: {
    eyebrow: "app.gainforest.dwc.occurrence",
    titleBefore: "Species {observations}",
    titleItalic: "",
    lede: "Darwin Core occurrence records from Hyperindex, newest first. Image and audio evidence blobs are resolved per record from each owner's PDS.",
    search: "Filter by species, family, or country…",
    grid: "square",
  },
  site: {
    eyebrow: "app.gainforest.organization.info",
    titleBefore: "Project {sites}",
    titleItalic: "",
    lede: "Registered organization records: display name, country, and cover/logo blobs resolved from each org's PDS.",
    search: "Filter by organization or country…",
    grid: "card",
  },
  bumicert: {
    eyebrow: "org.hypercerts.claim.activity",
    titleBefore: "",
    titleItalic: "Bumicerts",
    lede: "Hypercert impact claim records: title, short description, contributors, certified locations, and cover image.",
    search: "Filter Bumicerts by title or description…",
    grid: "card",
  },
};

type Phase = "idle" | "loading" | "ready" | "error" | "more";

const PAGE_SIZE = 24;

export function RecordExplorer({ kind }: { kind: RecordKind }) {
  const meta = KIND_META[kind];

  const [records, setRecords] = useState<ExplorerRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [query, setQuery] = useState("");
  const [occMedia, setOccMedia] = useState<OccurrenceFilter>("image");
  const [walking, setWalking] = useState(false);
  const [drawer, setDrawer] = useState<ExplorerRecord | null>(null);

  const controller = useRef<AbortController | null>(null);
  // Latest values for the load closure without re-creating it each render.
  const stateRef = useRef({ records, cursor, hasMore, phase });
  stateRef.current = { records, cursor, hasMore, phase };

  const load = useCallback(
    (mode: "first" | "more") => {
      const s = stateRef.current;
      if (mode === "first" && s.phase !== "idle") return;
      if (mode === "more" && (s.phase === "loading" || s.phase === "more" || !s.hasMore))
        return;

      const ctrl = new AbortController();
      controller.current?.abort();
      controller.current = ctrl;
      const after = mode === "more" ? s.cursor : null;
      const base = mode === "more" ? s.records : [];
      setPhase(mode === "first" ? "loading" : "more");

      const merge = (incoming: ExplorerRecord[]): ExplorerRecord[] => {
        const seen = new Set(base.map((r) => r.id));
        return [...base, ...incoming.filter((r) => !seen.has(r.id))];
      };

      if (kind === "occurrence") {
        setWalking(true);
        walkOccurrences({
          media: occMedia,
          target: PAGE_SIZE,
          after,
          signal: ctrl.signal,
          onProgress: (running) => {
            setRecords(merge(running));
            setPhase("ready");
          },
        })
          .then((res) => {
            setRecords(merge(res.records));
            setCursor(res.cursor);
            setHasMore(res.hasMore);
            setPhase("ready");
          })
          .catch((err) => {
            if ((err as Error).name === "AbortError") return;
            console.warn("[explorer] occurrence walk failed", err);
            setPhase(stateRef.current.records.length ? "ready" : "error");
          })
          .finally(() => {
            if (!ctrl.signal.aborted) setWalking(false);
          });
        return;
      }

      const request: Promise<Page<ExplorerRecord>> =
        kind === "site"
          ? fetchSites(PAGE_SIZE, after, ctrl.signal)
          : fetchBumicerts(PAGE_SIZE, after, ctrl.signal);

      request
        .then((page) => {
          setRecords(merge(page.records));
          setCursor(page.cursor);
          setHasMore(page.hasMore);
          setPhase("ready");
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          console.warn(`[explorer] ${kind} fetch failed`, err);
          setPhase(stateRef.current.records.length ? "ready" : "error");
        });
    },
    [kind, occMedia],
  );

  // Load the first page on mount.
  useEffect(() => {
    load("first");
    return () => controller.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changing the occurrence media filter resets and re-walks.
  function changeMedia(next: OccurrenceFilter) {
    if (next === occMedia) return;
    controller.current?.abort();
    setOccMedia(next);
    setQuery("");
    setRecords([]);
    setCursor(null);
    setHasMore(true);
    setPhase("idle");
  }

  // After a media reset drops us back to idle, kick off the new walk.
  useEffect(() => {
    if (phase === "idle" && records.length === 0) load("first");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occMedia, phase]);

  const filtered = filterRecords(records, query);

  return (
    <section className="bg-background">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-10 pb-16 sm:px-10 lg:px-16 lg:pt-16 lg:pb-24">
        {/* Header */}
        <div className="max-w-[760px]">
          <span className="font-instrument text-[13px] uppercase tracking-[0.22em] text-foreground/55">
            {meta.eyebrow}
          </span>
          <h1 className="mt-3 font-garamond text-[40px] font-normal leading-[1.04] tracking-[-0.015em] text-foreground sm:text-[52px] lg:text-[64px]">
            {meta.titleBefore ? (
              <BrushedText text={meta.titleBefore} />
            ) : (
              <span className="font-instrument italic">{meta.titleItalic}</span>
            )}
          </h1>
          <p className="mt-5 text-[16px] leading-[1.55] text-foreground/75 lg:text-[17.5px]">
            {meta.lede}
          </p>
        </div>

        {/* Toolbar */}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-y border-border-soft py-3.5">
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
              placeholder={meta.search}
              aria-label="Filter loaded records"
              className="w-full rounded-full border border-border-soft bg-surface py-2 pl-9 pr-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-primary/40"
            />
          </div>

          {kind === "occurrence" && (
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
            <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand text-brand" />
            {query
              ? `${formatNumber(filtered.length)} of ${formatNumber(records.length)} loaded`
              : `${formatNumber(records.length)} loaded`}
          </div>
        </div>

        {/* Grid */}
        <div className="mt-6">
          {phase === "loading" && records.length === 0 ? (
            <SkeletonGrid grid={meta.grid} />
          ) : phase === "error" && records.length === 0 ? (
            <EmptyState
              title="Could not reach the indexer"
              body="The GainForest indexer did not respond. It may be momentarily degraded; check the status page and try again."
              onRetry={() => {
                setPhase("idle");
                setRecords([]);
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
            ) : kind === "occurrence" && occMedia !== "all" ? (
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
                meta.grid === "square"
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
        {kind === "occurrence" && walking && records.length > 0 && (
          <p className="mt-6 flex items-center justify-center gap-2 text-[13px] italic text-foreground/55">
            <Spinner /> Scanning the indexer for more{" "}
            {occMedia === "audio" ? "audio" : occMedia === "image" ? "photos" : "records"}…
          </p>
        )}

        {/* Load more */}
        {records.length > 0 && !query && (
          <div className="mt-10 flex justify-center">
            {hasMore ? (
              <button
                type="button"
                onClick={() => load("more")}
                disabled={phase === "more" || (kind === "occurrence" && walking)}
                className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-6 py-3 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken disabled:opacity-60"
              >
                {phase === "more" || (kind === "occurrence" && walking) ? (
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
      {record.media.length > 0 && (
        <div className="absolute right-1.5 top-1.5 z-20 flex gap-1">
          {record.media.map((m) => (
            <span key={m} title={m} className="grid h-5 w-5 place-items-center rounded-full bg-background/90 text-foreground/70">
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
            style={{ background: "linear-gradient(180deg, transparent 0%, rgba(20,20,18,0.5) 45%, rgba(20,20,18,0.86) 100%)" }}
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
        <div
          className="flex h-full w-full flex-col justify-between p-3"
          style={{ background: "radial-gradient(120% 90% at 80% 0%, color-mix(in srgb, var(--primary) 9%, transparent), transparent), var(--surface)" }}
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
            {formatNumber(record.contributorCount)} contributor{record.contributorCount === 1 ? "" : "s"}
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
    return [r.scientificName, r.vernacularName, r.family, r.genus, r.kingdom, r.country, r.countryCode, r.locality, r.recordedBy]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  if (r.kind === "site") {
    return [r.name, r.country, r.did].filter(Boolean).join(" ").toLowerCase();
  }
  return [r.title, r.shortDescription, r.did].filter(Boolean).join(" ").toLowerCase();
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

function LeafGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 19c0-7 5-13 14-14 0 9-5 14-14 14zM5 19c3-3 6-5 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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

function SkeletonGrid({ grid }: { grid: "square" | "card" }) {
  const count = grid === "square" ? 15 : 8;
  const cls =
    grid === "square"
      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  return (
    <div className={cls} aria-hidden>
      {Array.from({ length: count }).map((_, i) =>
        grid === "square" ? (
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
