"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { OwnerBadge } from "./AuthorChip";
import { formatNumber, countryFlag, shortDid, formatDate } from "../_lib/format";

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
};

const KIND_META: Record<RecordKind, KindMeta> = {
  occurrence: {
    eyebrow: "app.gainforest.dwc.occurrence",
    titleBefore: "Species {observations}",
    titleItalic: "",
    lede: "Darwin Core occurrence records from Hyperindex, newest first. Image and audio evidence blobs are resolved per record from each owner's PDS.",
    search: "Filter by species, family, or country…",
  },
  site: {
    eyebrow: "app.gainforest.organization.info",
    titleBefore: "Project {sites}",
    titleItalic: "",
    lede: "Registered organization records: display name, country, and cover/logo blobs resolved from each org's PDS.",
    search: "Filter by organization or country…",
  },
  bumicert: {
    eyebrow: "org.hypercerts.claim.activity",
    titleBefore: "",
    titleItalic: "Bumicerts",
    lede: "Hypercert impact claim records: title, short description, contributors, certified locations, and cover image.",
    search: "Filter Bumicerts by title or description…",
  },
};

// One dense grid for all three streams so the explorer reads as a compact
// catalog (≈5 per row on a laptop, 6 on wide screens). Every card still
// carries an owner (did:plc → handle/avatar) + created date.
const GRID_CLS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6";

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
            <SkeletonGrid />
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
            <ul role="list" className={GRID_CLS}>
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

// ── Card (Bumicerts-style, compact) ─────────────────────────────────────────
//
// Mirrors the marketplace BumicertCard: a 4:3 cover with a subtle reverse-zoom
// on hover, the content overlapping the image bottom behind a gradient fade, an
// Instrument-Serif italic title, a floating owner badge (avatar + @handle), and
// small pill tags. The did:plc + created date sit in the footer so the owner is
// always identifiable. Kept compact so many records fit on screen.

const clamp = (n: number) =>
  ({
    display: "-webkit-box",
    WebkitBoxOrient: "vertical" as const,
    WebkitLineClamp: n,
    overflow: "hidden",
  }) as const;

type CardView = {
  alt: string;
  title: ReactNode;
  subtitle?: ReactNode;
  pills?: ReactNode;
  /** Floating type badge for the top-right of the cover. */
  badge?: ReactNode;
  placeholder: ReactNode;
  /** A better avatar the card already has (e.g. an org logo). */
  avatarOverride?: string | null;
};

function RecordCard({ record, onOpen }: { record: ExplorerRecord; onOpen: () => void }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;
  const v = cardView(record);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border-soft bg-surface text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_18px_40px_-24px_rgba(20,30,15,0.45)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-sunken">
        {hasImage ? (
          <Image
            src={record.imageUrl!}
            alt={v.alt}
            fill
            sizes="(max-width:640px) 50vw, (max-width:1280px) 25vw, 240px"
            unoptimized={record.imageUrl!.startsWith("/")}
            onError={() => setImgError(true)}
            className="scale-[1.08] object-cover transition-transform duration-500 group-hover:scale-100"
          />
        ) : (
          v.placeholder
        )}

        {/* Owner badge: avatar always, @handle once resolved. */}
        <div className="absolute left-1.5 top-1.5 z-10 inline-flex max-w-[calc(100%-0.75rem)] items-center rounded-full bg-background/75 py-0.5 pl-0.5 pr-2 shadow-sm backdrop-blur-md">
          <OwnerBadge did={record.did} avatarOverride={v.avatarOverride} />
        </div>

        {v.badge ? <div className="absolute right-1.5 top-1.5 z-10">{v.badge}</div> : null}
      </div>

      {/* Content on the solid card surface for legibility. */}
      <div className="flex flex-1 flex-col px-3 pb-2.5 pt-2.5">
        <div>
          <h3
            className="font-instrument text-[16.5px] italic leading-tight text-foreground"
            style={clamp(2)}
          >
            {v.title}
          </h3>
          {v.subtitle ? (
            <p className="mt-0.5 text-[12px] leading-snug text-foreground/65" style={clamp(1)}>
              {v.subtitle}
            </p>
          ) : null}
          {v.pills ? (
            <div className="mt-2 flex flex-wrap items-center gap-1">{v.pills}</div>
          ) : null}
        </div>

        {/* did:plc + created date — always shown. */}
        <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-border-soft pt-2 font-mono text-[10px] text-foreground/50">
          <span className="truncate" title={record.did}>
            {shortDid(record.did)}
          </span>
          {record.createdAt ? <span className="shrink-0">{formatDate(record.createdAt)}</span> : null}
        </div>
      </div>
    </button>
  );
}

function Pill({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        accent ? "bg-brand/12 text-brand-dark" : "bg-surface-sunken text-foreground/65"
      }`}
    >
      {children}
    </span>
  );
}

function cardView(record: ExplorerRecord): CardView {
  if (record.kind === "occurrence") {
    const name = record.scientificName || record.vernacularName || "Unidentified";
    const cc =
      record.countryCode || (record.country ? record.country.slice(0, 2).toUpperCase() : "");
    const taxon = record.family || record.genus || record.kingdom || null;
    return {
      alt: name,
      title: name,
      subtitle:
        record.scientificName && record.vernacularName ? record.vernacularName : undefined,
      pills: (
        <>
          {taxon ? <Pill>{taxon}</Pill> : null}
          {cc ? (
            <Pill>
              {countryFlag(record.countryCode)} {cc}
            </Pill>
          ) : null}
        </>
      ),
      badge:
        record.media.length > 0 ? (
          <div className="flex gap-1">
            {record.media.map((m) => (
              <span
                key={m}
                title={m}
                className="grid h-5 w-5 place-items-center rounded-full bg-background/85 text-foreground/70 backdrop-blur-md"
              >
                <MediaIcon kind={m} />
              </span>
            ))}
          </div>
        ) : null,
      placeholder: (
        <div
          className="flex h-full w-full items-end p-3"
          style={{
            background:
              "radial-gradient(120% 90% at 80% 0%, color-mix(in srgb, var(--primary) 10%, transparent), transparent), var(--surface)",
          }}
        >
          <span
            className="font-garamond text-[15px] italic leading-tight text-foreground/45"
            style={clamp(3)}
          >
            {name}
          </span>
        </div>
      ),
    };
  }

  if (record.kind === "site") {
    return {
      alt: record.name,
      title: record.name,
      pills: record.country ? (
        <Pill>
          {countryFlag(record.country)} {record.country}
        </Pill>
      ) : undefined,
      placeholder: (
        <div className="flex h-full w-full items-center justify-center font-garamond text-[34px] text-foreground/15">
          {countryFlag(record.country) || "\u25F0"}
        </div>
      ),
      // The org's own cover/logo is the most meaningful avatar for its row.
      avatarOverride: record.imageUrl,
    };
  }

  // bumicert
  return {
    alt: record.title,
    title: record.title,
    subtitle: record.shortDescription ?? undefined,
    pills: (
      <>
        <Pill accent>
          {formatNumber(record.contributorCount)} contributor
          {record.contributorCount === 1 ? "" : "s"}
        </Pill>
        {record.locationCount > 0 ? (
          <Pill>
            {formatNumber(record.locationCount)} site{record.locationCount === 1 ? "" : "s"}
          </Pill>
        ) : null}
      </>
    ),
    badge: (
      <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.1em] text-brand-dark backdrop-blur-md">
        <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand text-brand" />
        Bumicert
      </span>
    ),
    placeholder: (
      <div className="flex h-full w-full items-center justify-center font-garamond text-[14px] italic text-foreground/30">
        No cover image
      </div>
    ),
  };
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


function Spinner() {
  return (
    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SkeletonGrid() {
  return (
    <div className={GRID_CLS} aria-hidden>
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border-soft">
          <div className="skeleton aspect-[4/3]" />
          <div className="space-y-2 px-3 pb-2.5 pt-2.5">
            <div className="skeleton h-3.5 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
            <div className="mt-2 flex items-center justify-between border-t border-border-soft pt-2">
              <div className="skeleton h-2.5 w-1/3 rounded" />
              <div className="skeleton h-2.5 w-1/4 rounded" />
            </div>
          </div>
        </div>
      ))}
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
