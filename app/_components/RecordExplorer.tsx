"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  walkOccurrences,
  fetchSites,
  fetchBumicerts,
  fetchRecordByUri,
  type ExplorerRecord,
  type OccurrenceRecord,
  type BumicertRecord,
  type SiteRecord,
  type Page,
  type RecordKind,
  type OccurrenceFilter,
  type SiteSourceFilter,
} from "../_lib/indexer";
import { RecordDrawer } from "./RecordDrawer";
import { RecordMap } from "./RecordMap";
import { OwnerBadge } from "./AuthorChip";
import { StatCard, type FormatKey } from "./MetricTrend";
import { isPdsBlobUrl } from "../_lib/pds";
import {
  ms,
  seriesFromIncrements,
  seriesFromDistinct,
  dailyCountSeries,
  type MetricSeries,
} from "../_lib/series";
import { formatNumber, countryFlag, formatDate } from "../_lib/format";
import { AutoLoadMoreButton } from "./AutoLoadMoreButton";
import { PictureHero } from "./PictureHero";

// Single-stream record explorer. One of the three GainForest record types
// (Darwin Core occurrences, project sites, Bumicerts) paged straight from
// Hyperindex in the browser (CORS-open), each card opening a detail drawer.
// A search box filters the records already loaded; "Load more" walks the
// indexer cursor. This is the per-page form of the old combined tab view —
// the tab strip was replaced by top-nav routes so each stream is its own page.

type KindMeta = {
  eyebrow: string;
  /** Plain (Cormorant) lead word; empty renders the accent alone. */
  title: string;
  /** Instrument-Serif italic accent word, matching the donations header. */
  accent: string;
  lede: string;
  search: string;
  heroLight: string;
  heroDark: string;
};

const KIND_META: Record<RecordKind, KindMeta> = {
  occurrence: {
    eyebrow: "Observations",
    title: "Species",
    accent: "observations",
    lede: "Browse nature sightings from GainForest: photos, sounds, species names, and map locations.",
    search: "Filter by species, family, or country…",
    heroLight: "/assets/media/images/observations/observations-hero-light.png",
    heroDark: "/assets/media/images/observations/observations-hero-dark.png",
  },
  site: {
    eyebrow: "Project Sites",
    title: "Project",
    accent: "sites",
    lede: "Explore nature stewardship groups, where they work, and the stories they share.",
    search: "Filter by organization or country…",
    heroLight: "/assets/organizations/organizations-hero-light.png",
    heroDark: "/assets/organizations/organizations-hero-dark.png",
  },
  bumicert: {
    eyebrow: "Explore Projects",
    title: "Discover",
    accent: "Regenerative Impact",
    lede: "Browse projects from communities and organizations restoring ecosystems, strengthening livelihoods, and building a more resilient future.",
    search: "Filter Bumicerts by title or description…",
    heroLight: "/images/explore/explore-hero-light.png",
    heroDark: "/images/explore/explore-hero-dark.png",
  },
};

// One dense grid for all three streams so the explorer reads as a compact
// catalog (≈5 per row on a laptop, 6 on wide screens). Every card still
// carries an owner (did:plc → handle/avatar) + created date.
const GRID_CLS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6";

// AT-URI collection per page kind, so a shareable `?record=did/rkey` value can
// be expanded back into a full at:// URI (the collection is implied by route).
const COLLECTION: Record<RecordKind, string> = {
  occurrence: "app.gainforest.dwc.occurrence",
  site: "app.gainforest.organization.info",
  bumicert: "org.hypercerts.claim.activity",
};

/** Compact, shareable key for a record: `did/collection/rkey` (no segment ever
 *  contains "/"). The collection is encoded so a page that mixes lexicons
 *  (e.g. Sites = GainForest org + certified actor org) round-trips correctly. */
function recordParam(r: ExplorerRecord): string {
  const m = r.atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : r.id;
}
function paramToUri(value: string, kind: RecordKind): string | null {
  const parts = value.split("/");
  // New form: did/collection/rkey.
  if (parts.length >= 3) {
    const [did, collection, ...rest] = parts;
    const rkey = rest.join("/");
    return did && collection && rkey ? `at://${did}/${collection}/${rkey}` : null;
  }
  // Back-compat: old did/rkey links imply the route's default collection.
  const slash = value.indexOf("/");
  if (slash < 1) return null;
  const did = value.slice(0, slash);
  const rkey = value.slice(slash + 1);
  return rkey ? `at://${did}/${COLLECTION[kind]}/${rkey}` : null;
}

type Phase = "idle" | "loading" | "ready" | "error" | "more";

// Load a deep first page across every stream so the grid, map, and stats
// reflect a real slice of the data. The indexer caps each request at 1000, so
// a single page now reaches this for the media-filtered views (which push the
// filter down server-side) and the cursor pages it for the rest.
const LOAD_TARGET = 1000;
const DEFAULT_OCCURRENCE_MEDIA: OccurrenceFilter = "image";

export function RecordExplorer({ kind }: { kind: RecordKind }) {
  const meta = KIND_META[kind];

  const [records, setRecords] = useState<ExplorerRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [occMedia, setOccMedia] = useState<OccurrenceFilter>(DEFAULT_OCCURRENCE_MEDIA);
  const [siteSource, setSiteSource] = useState<SiteSourceFilter>("both");
  const [view, setView] = useState<"cards" | "map">("cards");
  const [walking, setWalking] = useState(false);
  // Gate the first load until the URL has been read, so a shared link's filter
  // params (media/source) are applied before the initial fetch.
  const [hydrated, setHydrated] = useState(false);
  const [drawer, setDrawer] = useState<ExplorerRecord | null>(null);
  // `?record=` value awaiting resolution, so the URL keeps it while we fetch.
  const [pendingRecord, setPendingRecord] = useState<string | null>(null);
  // Skip the very first URL write so we don't strip params we just read in.
  const firstUrlSyncRef = useRef(true);

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

      setWalking(true);

      if (kind === "occurrence") {
        walkOccurrences({
          media: occMedia,
          target: LOAD_TARGET,
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

      // Sites + Bumicerts page the cursor to the same target, emitting each
      // page (up to 1000 records) so the grid fills progressively.
      const onProgress = (running: ExplorerRecord[]) => {
        setRecords(merge(running));
        setPhase("ready");
      };
      const request: Promise<Page<ExplorerRecord>> =
        kind === "site"
          ? fetchSites(LOAD_TARGET, after, ctrl.signal, onProgress, siteSource)
          : fetchBumicerts(LOAD_TARGET, after, ctrl.signal, onProgress);

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
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setWalking(false);
        });
    },
    [kind, occMedia, siteSource],
  );

  // Hydrate all shareable state from the URL once, before the first load, so a
  // shared link restores the exact view: search (`q`), card/map view (`view`),
  // sort (`sort`), the occurrence media filter (`media`) or site source
  // (`source`), and an open record (`record`). Filter params must land before
  // the first fetch — the load effect below is gated on `hydrated`.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q");
    if (q) setQuery(q);
    if (sp.get("view") === "map") setView("map");
    const s = sp.get("sort");
    if (s === "oldest" || s === "az" || s === "za") setSort(s);
    if (kind === "occurrence") {
      const m = sp.get("media");
      if (m === "image" || m === "audio" || m === "all") setOccMedia(m);
    }
    if (kind === "site") {
      const src = sp.get("source");
      if (src === "gainforest" || src === "certified") setSiteSource(src);
    }
    setHydrated(true);

    const rec = sp.get("record");
    if (!rec) return;
    const uri = paramToUri(rec, kind);
    if (!uri) return;
    setPendingRecord(rec);
    const ctrl = new AbortController();
    fetchRecordByUri(uri, ctrl.signal)
      .then((r) => {
        // Don't clobber a record the visitor opened while we were fetching.
        if (r) setDrawer((prev) => prev ?? r);
      })
      .catch(() => {})
      .finally(() => setPendingRecord(null));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abort any in-flight load on unmount.
  useEffect(() => () => controller.current?.abort(), []);

  // Keep the URL in sync with every shareable control (search, view, sort,
  // media/source filter, open record) so it can be shared/bookmarked.
  // replaceState (not the router) avoids history spam and re-renders; debounced
  // so typing doesn't thrash the address bar.
  useEffect(() => {
    if (firstUrlSyncRef.current) {
      firstUrlSyncRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      const q = query.trim();
      if (q) params.set("q", q);
      if (view === "map") params.set("view", "map");
      if (sort !== "newest") params.set("sort", sort);
      if (kind === "occurrence" && occMedia !== DEFAULT_OCCURRENCE_MEDIA) params.set("media", occMedia);
      if (kind === "site" && siteSource !== "both") params.set("source", siteSource);
      if (drawer) params.set("record", recordParam(drawer));
      else if (pendingRecord) params.set("record", pendingRecord);
      const qs = params.toString();
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, "", url);
    }, 200);
    return () => clearTimeout(t);
  }, [query, view, sort, occMedia, siteSource, drawer, pendingRecord, kind]);

  // Changing the occurrence media filter resets and re-walks.
  function changeMedia(next: OccurrenceFilter) {
    if (next === occMedia) return;
    controller.current?.abort();
    setOccMedia(next);
    resetStream();
  }

  // Changing the site source (GainForest / Certified / Both) resets + re-walks.
  function changeSource(next: SiteSourceFilter) {
    if (next === siteSource) return;
    controller.current?.abort();
    setSiteSource(next);
    resetStream();
  }

  function resetStream() {
    setQuery("");
    setRecords([]);
    setCursor(null);
    setHasMore(true);
    setPhase("idle");
  }

  // First load (once hydrated) and any time a filter reset drops us back to
  // idle, kick off a walk. Gated on `hydrated` so the URL's filter params are
  // applied to the initial fetch.
  useEffect(() => {
    if (hydrated && phase === "idle" && records.length === 0) load("first");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, occMedia, siteSource, phase]);

  const filtered = sortRecords(filterRecords(records, query), sort);
  // Stats + their trend series are derived from the full loaded set (not the
  // search-filtered view), so memoize on `records` to avoid rebuilding the
  // cumulative series on every keystroke.
  const stats = useMemo(() => computeStats(records, kind), [records, kind]);

  return (
    <section className="-mt-14 bg-background pb-20 md:pb-28">
      <PictureHero
        lightSrc={meta.heroLight}
        darkSrc={meta.heroDark}
        eyebrow={meta.eyebrow}
        icon={<LeafGlyph />}
        title={meta.title}
        accent={meta.accent}
        lede={meta.lede}
        imageAlt={`${meta.eyebrow} nature landscape`}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        {/* Stats overview — computed live from the loaded records, matching the marketplace hero rhythm. */}
        {records.length > 0 && (
          <div className="relative z-20 -mt-10 px-3">
            <StatBand stats={stats.slice(0, 4)} />
          </div>
        )}

        {/* Toolbar */}
        <div className="relative z-20 mt-5 flex flex-wrap items-center gap-3 px-3">
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
              aria-label="Search what is shown"
              className="w-full rounded-full border border-border-soft bg-surface py-2 pl-9 pr-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-primary/40"
            />
          </div>

          {/* Cards / Map view toggle */}
          <div className="inline-flex rounded-full border border-border-soft bg-surface p-0.5">
            {(
              [
                { id: "cards", label: "Cards" },
                { id: "map", label: "Map" },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setView(o.id)}
                aria-pressed={view === o.id}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  view === o.id
                    ? "bg-foreground/[0.08] text-foreground"
                    : "text-foreground/55 hover:text-foreground"
                }`}
              >
                {o.id === "map" ? <MapGlyph /> : <CardsGlyph />}
                {o.label}
              </button>
            ))}
          </div>

          {/* Sort: timestamp (newest/oldest) or alphabetical (A–Z / Z–A) */}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              aria-label="Choose display order"
              className="appearance-none rounded-full border border-border-soft bg-surface py-2 pl-3.5 pr-8 text-[12.5px] font-medium text-foreground/70 outline-none transition-colors hover:text-foreground focus:border-primary/40"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
            <svg
              aria-hidden
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/40"
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {kind === "site" && (
            <div className="inline-flex rounded-full border border-border-soft bg-surface p-0.5">
              {(
                [
                  { id: "both", label: "All" },
                  { id: "gainforest", label: "GainForest" },
                  { id: "certified", label: "Reviewed" },
                ] as Array<{ id: SiteSourceFilter; label: string }>
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => changeSource(o.id)}
                  aria-pressed={siteSource === o.id}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                    siteSource === o.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

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
            {phase === "loading" && records.length === 0 ? (
              <span className="h-4 w-20 animate-pulse rounded-full bg-muted" aria-label="Loading" />
            ) : (
              <>
                <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand text-brand" />
                {query
                  ? `${formatNumber(filtered.length)} of ${formatNumber(records.length)} shown`
                  : `${formatNumber(records.length)} shown`}
              </>
            )}
          </div>
        </div>

        {/* Grid / Map */}
        <div className="mt-6">
          {view === "map" ? (
            <RecordMap records={filtered} kind={kind} onOpen={setDrawer} />
          ) : phase === "loading" && records.length === 0 ? (
            <SkeletonGrid />
          ) : phase === "error" && records.length === 0 ? (
            <EmptyState
              title="Could not load this page"
              body="GainForest did not respond. It may be a temporary issue; visit the status page and try again."
              onRetry={() => {
                setPhase("idle");
                setRecords([]);
              }}
            />
          ) : filtered.length === 0 ? (
            query ? (
              <EmptyState
                title="No matches here"
                body="Try a different name, family, or country; or show more to widen the search."
                onRetry={() => setQuery("")}
                retryLabel="Clear search"
              />
            ) : kind === "occurrence" && occMedia !== "all" ? (
              <EmptyState
                title={`No ${occMedia === "image" ? "photo" : "audio"} sightings found nearby`}
                body="The newest sightings do not always include photos or sounds. Switch to All to browse everything."
                onRetry={() => changeMedia("all")}
                retryLabel="Show all"
              />
            ) : (
              <EmptyState title="Nothing here yet" body="There is nothing to show right now." />
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

        {/* Loading hint while pages stream in */}
        {walking && records.length > 0 && (
          <p className="mt-6 flex items-center justify-center gap-2 text-[13px] italic text-foreground/55">
            <Spinner /> Loading more…
          </p>
        )}

        {/* Load more */}
        {records.length > 0 && !query && (
          <div className="mt-10 flex justify-center">
            <AutoLoadMoreButton
              hasMore={hasMore}
              loading={phase === "more" || walking}
              onLoadMore={() => load("more")}
              className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-6 py-3 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken disabled:opacity-60"
              endClassName="text-[13px] italic text-foreground/50"
            />
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
            unoptimized={!isPdsBlobUrl(record.imageUrl)}
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

        {record.createdAt ? (
          <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-border-soft pt-2 text-[10px] text-foreground/50">
            <span className="shrink-0">Shared {formatDate(record.createdAt)}</span>
          </div>
        ) : null}
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
    const certified = record.source === "certified";
    return {
      alt: record.name,
      title: record.name,
      pills:
        record.country || record.orgType ? (
          <>
            {record.country ? (
              <Pill>
                {countryFlag(record.country)} {record.country}
              </Pill>
            ) : null}
            {record.orgType ? <Pill>{record.orgType}</Pill> : null}
          </>
        ) : undefined,
      badge: (
        <span className="inline-flex items-center rounded-full bg-background/85 px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.1em] text-foreground/70 backdrop-blur-md">
          {certified ? "Reviewed" : "GainForest"}
        </span>
      ),
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

// ── Sorting ──────────────────────────────────────────────────────────────
//
// Records arrive newest-first (createdAt DESC) from the indexer; this lets the
// visitor re-sort the already-loaded slice by timestamp or alphabetically.

type SortMode = "newest" | "oldest" | "az" | "za";

function sortTimestamp(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Title used for alphabetical sort, per record kind. */
function sortKey(r: ExplorerRecord): string {
  if (r.kind === "occurrence") return (r.scientificName || r.vernacularName || "").toLowerCase();
  if (r.kind === "site") return (r.name || "").toLowerCase();
  return (r.title || "").toLowerCase();
}

function sortRecords(records: ExplorerRecord[], mode: SortMode): ExplorerRecord[] {
  const arr = [...records];
  switch (mode) {
    case "oldest":
      arr.sort((a, b) => sortTimestamp(a.createdAt) - sortTimestamp(b.createdAt));
      break;
    case "az":
      arr.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      break;
    case "za":
      arr.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
      break;
    case "newest":
    default:
      arr.sort((a, b) => sortTimestamp(b.createdAt) - sortTimestamp(a.createdAt));
      break;
  }
  return arr;
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

// ── Stats overview ───────────────────────────────────────────────────────
//
// A donations-style KPI band, but derived from whatever records are currently
// loaded in the browser (the streams page in, so this grows as you "Load
// more"). Time windows key off each record's createdAt.

type Stat = {
  label: string;
  value: string;
  sub: string;
  series?: MetricSeries | null;
  format?: FormatKey;
};

function within(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= Date.now() - days * 86_400_000;
}

function computeStats(records: ExplorerRecord[], kind: RecordKind): Stat[] {
  const last30 = records.filter((r) => within(r.createdAt, 30)).length;
  const last7 = records.filter((r) => within(r.createdAt, 7)).length;
  const n = (v: number) => formatNumber(v);
  const times = records.map((r) => ms(r.createdAt));
  // Cumulative count of all loaded records over their createdAt span.
  const totalSeries = seriesFromIncrements(times.map((t) => ({ t, inc: 1 })));
  // Daily-new activity lines for the rolling windows.
  const win30 = dailyCountSeries(times, 30);
  const win7 = dailyCountSeries(times, 7);
  // Cumulative count of the subset matching `pred`.
  const countWhere = (pred: (r: ExplorerRecord) => boolean) =>
    seriesFromIncrements(records.map((r) => ({ t: ms(r.createdAt), inc: pred(r) ? 1 : 0 })));

  if (kind === "occurrence") {
    const occ = records as OccurrenceRecord[];
    const species = new Set(occ.map((r) => r.scientificName).filter(Boolean)).size;
    const countries = new Set(
      occ.map((r) => r.countryCode || r.country).filter(Boolean),
    ).size;
    const withMedia = occ.filter((r) => r.media.length > 0).length;
    return [
      { label: "Items shown", value: n(occ.length), sub: "Sightings", series: totalSeries },
      { label: "Last 30 days", value: n(last30), sub: "New sightings", series: win30 },
      { label: "Last 7 days", value: n(last7), sub: "This week", series: win7 },
      {
        label: "Species",
        value: n(species),
        sub: "Different kinds found",
        series: seriesFromDistinct(occ.map((r) => ({ t: ms(r.createdAt), key: r.scientificName }))),
      },
      {
        label: "Countries",
        value: n(countries),
        sub: "Places reached",
        series: seriesFromDistinct(
          occ.map((r) => ({ t: ms(r.createdAt), key: r.countryCode || r.country })),
        ),
      },
      {
        label: "With photos or sounds",
        value: n(withMedia),
        sub: "Photos or sounds",
        series: countWhere((r) => (r as OccurrenceRecord).media.length > 0),
      },
    ];
  }

  if (kind === "bumicert") {
    const b = records as BumicertRecord[];
    const contributors = b.reduce((s, r) => s + r.contributorCount, 0);
    const sites = b.reduce((s, r) => s + r.locationCount, 0);
    const withCover = b.filter((r) => r.imageUrl).length;
    return [
      { label: "Items shown", value: n(b.length), sub: "Bumicerts", series: totalSeries },
      { label: "Last 30 days", value: n(last30), sub: "New stories", series: win30 },
      { label: "Last 7 days", value: n(last7), sub: "This week", series: win7 },
      {
        label: "Contributors",
        value: n(contributors),
        sub: "Across stories",
        series: seriesFromIncrements(b.map((r) => ({ t: ms(r.createdAt), inc: r.contributorCount }))),
      },
      {
        label: "Project places",
        value: n(sites),
        sub: "Places",
        series: seriesFromIncrements(b.map((r) => ({ t: ms(r.createdAt), inc: r.locationCount }))),
      },
      {
        label: "With pictures",
        value: n(withCover),
        sub: "Has cover picture",
        series: countWhere((r) => Boolean((r as BumicertRecord).imageUrl)),
      },
    ];
  }

  const s = records as SiteRecord[];
  const countries = new Set(s.map((r) => r.country).filter(Boolean)).size;
  const withImg = s.filter((r) => r.imageUrl).length;
  return [
    { label: "Items shown", value: n(s.length), sub: "Organizations", series: totalSeries },
    { label: "Last 30 days", value: n(last30), sub: "New places", series: win30 },
    { label: "Last 7 days", value: n(last7), sub: "This week", series: win7 },
    {
      label: "Countries",
      value: n(countries),
      sub: "Places reached",
      series: seriesFromDistinct(s.map((r) => ({ t: ms(r.createdAt), key: r.country }))),
    },
    {
      label: "With pictures",
      value: n(withImg),
      sub: "Cover or logo",
      series: countWhere((r) => Boolean((r as SiteRecord).imageUrl)),
    },
  ];
}

const STAT_COLS: Record<number, string> = {
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

function StatBand({ stats }: { stats: Stat[] }) {
  const lg = STAT_COLS[stats.length] ?? "lg:grid-cols-6";
  return (
    <ul
      role="list"
      className={`grid grid-cols-2 gap-3 sm:gap-4 ${lg}`}
    >
      {stats.map((s) => (
        <StatCard
          key={s.label}
          value={s.value}
          label={s.label}
          sub={s.sub}
          series={s.series}
          format={s.format}
        />
      ))}
    </ul>
  );
}

// ── Bits ───────────────────────────────────────────────────────────────────

function LeafGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 19c0-7 5-13 14-14 0 9-5 14-14 14zM5 19c3-3 6-5 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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


function CardsGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function MapGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
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
