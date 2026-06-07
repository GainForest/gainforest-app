"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Image from "next/image";
import {
  AudioLinesIcon,
  ChevronDownIcon,
  ImageIcon,
  LayoutGridIcon,
  LeafIcon,
  Loader2Icon,
  MapIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
} from "lucide-react";
import {
  walkOccurrences,
  fetchOccurrenceStats,
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
  type OccurrenceStats,
  type SiteSourceFilter,
} from "../_lib/indexer";
import { RecordDrawer } from "./RecordDrawer";
import { RecordMap } from "./RecordMap";
import { StatsTileGrid } from "./StatsTile";
import { isPdsBlobUrl, resolveBlobUrl } from "../_lib/pds";
import { pauseOtherAudio, playExclusiveAudio, registerAudioElement } from "../_lib/audio-coordinator";
import { resolveDidProfile, getCachedProfile } from "../_lib/did-profile";
import { formatCompact, countryFlag, formatDate } from "../_lib/format";
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
    search: "Filter by species, family, or country",
    heroLight: "/assets/media/images/observations/observations-hero-light@2x.webp",
    heroDark: "/assets/media/images/observations/observations-hero-dark@2x.webp",
  },
  site: {
    eyebrow: "Project Sites",
    title: "Project",
    accent: "sites",
    lede: "Explore nature stewardship groups, where they work, and the stories they share.",
    search: "Filter by organization or country",
    heroLight: "/assets/organizations/organizations-hero-light@2x.webp",
    heroDark: "/assets/organizations/organizations-hero-dark@2x.webp",
  },
  bumicert: {
    eyebrow: "Explore Projects",
    title: "Discover",
    accent: "Regenerative Impact",
    lede: "Browse projects from communities and organizations restoring ecosystems, strengthening livelihoods, and building a more resilient future.",
    search: "Filter Bumicerts by title or description",
    heroLight: "/images/explore/explore-hero-light@2x.webp",
    heroDark: "/images/explore/explore-hero-dark@2x.webp",
  },
};

// One dense grid for all three streams so the explorer reads as a compact
// catalog (≈5 per row on a laptop, 6 on wide screens). Every card still
// carries an owner (did:plc → handle/avatar) + created date.
const GRID_CLS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6";
// Observations read as a photo gallery: square tiles packed tight, more per
// row, minimal seams between them. The other streams keep the airier card grid.
const GALLERY_GRID_CLS =
  "grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6";

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

type InitialExplorerPage = {
  records: ExplorerRecord[];
  cursor: string | null;
  hasMore: boolean;
};

// Load a deep first page across every stream so the grid, map, and stats
// reflect a real slice of the data. The indexer caps each request at 1000, so
// a single page now reaches this for the media-filtered views (which push the
// filter down server-side) and the cursor pages it for the rest.
const LOAD_TARGET = 48;
const OCCURRENCE_LOAD_TARGET = 24;
const INITIAL_CARD_LIMIT = 96;
const CARD_BATCH_SIZE = 96;
const DEFAULT_OCCURRENCE_MEDIA: OccurrenceFilter = "image";

export function RecordExplorer({
  kind,
  initialPage,
  showHero = true,
  ownerDid,
}: {
  kind: RecordKind;
  initialPage?: InitialExplorerPage;
  showHero?: boolean;
  ownerDid?: string;
}) {
  const meta = KIND_META[kind];
  const initialRecords = initialPage?.records ?? [];

  const [records, setRecords] = useState<ExplorerRecord[]>(initialRecords);
  const [cursor, setCursor] = useState<string | null>(initialPage?.cursor ?? null);
  const [hasMore, setHasMore] = useState(initialPage?.hasMore ?? true);
  const [phase, setPhase] = useState<Phase>(initialPage ? "ready" : "idle");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortMode>("newest");
  const [occMedia, setOccMedia] = useState<OccurrenceFilter>(DEFAULT_OCCURRENCE_MEDIA);
  const [siteSource, setSiteSource] = useState<SiteSourceFilter>("both");
  const [view, setView] = useState<"cards" | "map">("cards");
  const [walking, setWalking] = useState(false);
  const [occurrenceStats, setOccurrenceStats] = useState<OccurrenceStats | null>(null);
  const [occurrenceStatsLoading, setOccurrenceStatsLoading] = useState(kind === "occurrence" && !ownerDid);
  // Gate the first load until the URL has been read, so a shared link's filter
  // params (media/source) are applied before the initial fetch.
  const [hydrated, setHydrated] = useState(false);
  const [drawer, setDrawer] = useState<ExplorerRecord | null>(null);
  const [cardLimit, setCardLimit] = useState(INITIAL_CARD_LIMIT);
  // `?record=` value awaiting resolution, so the URL keeps it while we fetch.
  const [pendingRecord, setPendingRecord] = useState<string | null>(null);
  // Skip the very first URL write so we don't strip params we just read in.
  const firstUrlSyncRef = useRef(true);
  // Server-rendered first pages should stay visible after the URL hydrate pass.
  const firstResetAfterHydrateRef = useRef(true);

  const controller = useRef<AbortController | null>(null);
  const loadSeqRef = useRef(0);
  const occurrenceStatsStartedRef = useRef(false);
  const hasLoadedRecords = records.length > 0;

  useEffect(() => {
    if (kind !== "occurrence" || ownerDid || !hasLoadedRecords || occurrenceStatsStartedRef.current) return;
    occurrenceStatsStartedRef.current = true;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      setOccurrenceStatsLoading(true);
      fetchOccurrenceStats(ctrl.signal)
        .then((nextStats) => setOccurrenceStats(nextStats))
        .catch((error) => {
          if ((error as Error).name !== "AbortError") setOccurrenceStats(null);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setOccurrenceStatsLoading(false);
        });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [hasLoadedRecords, kind, ownerDid]);
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
      const loadSeq = ++loadSeqRef.current;
      const target = kind === "occurrence" ? OCCURRENCE_LOAD_TARGET : LOAD_TARGET;
      const isCurrent = () => loadSeqRef.current === loadSeq && !ctrl.signal.aborted;
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
          target,
          after,
          query: deferredQuery,
          ownerDid,
          signal: ctrl.signal,
          resolveMedia: false,
          onProgress: (progressRecords) => {
            if (!isCurrent()) return;
            setRecords(merge(progressRecords));
          },
        })
          .then((res) => {
            if (!isCurrent()) return;
            setRecords(merge(res.records));
            setCursor(res.cursor);
            setHasMore(res.hasMore);
            setPhase("ready");
          })
          .catch((err) => {
            if ((err as Error).name === "AbortError") return;
            console.warn("[explorer] occurrence walk failed", err);
            if (isCurrent()) setPhase(stateRef.current.records.length ? "ready" : "error");
          })
          .finally(() => {
            if (isCurrent()) setWalking(false);
          });
        return;
      }

      const request: Promise<Page<ExplorerRecord>> =
        kind === "site"
          ? fetchSites(target, after, ctrl.signal, undefined, siteSource, { query: deferredQuery, sort })
          : fetchBumicerts(target, after, ctrl.signal, undefined, { query: deferredQuery, sort });

      request
        .then((page) => {
          if (!isCurrent()) return;
          setRecords(merge(page.records));
          setCursor(page.cursor);
          setHasMore(page.hasMore);
          setPhase("ready");
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          console.warn(`[explorer] ${kind} fetch failed`, err);
          if (isCurrent()) setPhase(stateRef.current.records.length ? "ready" : "error");
        })
        .finally(() => {
          if (isCurrent()) setWalking(false);
        });
    },
    [deferredQuery, kind, occMedia, ownerDid, siteSource, sort],
  );

  // Hydrate all shareable state from the URL once, before the first load, so a
  // shared link restores the exact view: search (`q`), card/map view (`view`),
  // sort (`sort`), the occurrence media filter (`media`) or site source
  // (`source`), and an open record (`record`). Filter params must land before
  // the first fetch — the load effect below is gated on `hydrated`.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    let shouldClientLoad = false;
    const q = sp.get("q");
    if (q) {
      setQuery(q);
      shouldClientLoad = true;
    }
    if (sp.get("view") === "map") setView("map");
    const s = sp.get("sort");
    if (s === "oldest" || s === "az" || s === "za") {
      setSort(s);
      shouldClientLoad = true;
    }
    if (kind === "occurrence") {
      const m = sp.get("media");
      if (m === "audio" || m === "all") {
        setOccMedia(m);
        shouldClientLoad = true;
      }
    }
    if (kind === "site") {
      const src = sp.get("source");
      if (src === "gainforest" || src === "certified") {
        setSiteSource(src);
        shouldClientLoad = true;
      }
    }
    if (shouldClientLoad) {
      setRecords([]);
      setCursor(null);
      setHasMore(true);
      setPhase("idle");
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

  useEffect(() => {
    if (!hydrated) return;
    if (firstResetAfterHydrateRef.current) {
      firstResetAfterHydrateRef.current = false;
      return;
    }
    controller.current?.abort();
    setRecords([]);
    setCursor(null);
    setHasMore(true);
    setPhase("idle");
  }, [deferredQuery, hydrated, sort]);

  // First load (once hydrated) and any time a filter reset drops us back to
  // idle, kick off a walk. Gated on `hydrated` so the URL's filter params are
  // applied to the initial fetch.
  useEffect(() => {
    if (hydrated && phase === "idle" && records.length === 0) load("first");
  }, [hydrated, load, occMedia, phase, records.length, siteSource]);

  const filtered = useMemo(
    () => sortRecords(filterRecords(records, deferredQuery), sort),
    [deferredQuery, records, sort],
  );
  const renderedRecords = useMemo(
    () => (view === "cards" ? filtered.slice(0, cardLimit) : filtered),
    [cardLimit, filtered, view],
  );
  const hasMoreCardsToShow = view === "cards" && renderedRecords.length < filtered.length;

  useEffect(() => {
    setCardLimit(INITIAL_CARD_LIMIT);
  }, [deferredQuery, kind, occMedia, siteSource, sort, view]);
  // Observations use fast total counters from the index, matching the dedicated
  // Bumicerts and organizations pages. Other embedded explorer uses still fall
  // back to loaded-record summaries.
  const stats = useMemo(
    () => (kind === "occurrence" && !ownerDid && occurrenceStats ? computeOccurrenceTotalStats(occurrenceStats) : computeStats(records, kind)),
    [kind, occurrenceStats, ownerDid, records],
  );
  const showStats = kind === "occurrence" ? ownerDid ? records.length > 0 : Boolean(occurrenceStats) || (!occurrenceStatsLoading && records.length > 0) : records.length > 0;
  const gridCls = kind === "occurrence" ? GALLERY_GRID_CLS : GRID_CLS;

  return (
    <section className={`${showHero ? "-mt-14 " : ""}bg-background pb-20 md:pb-28`}>
      {showHero && (
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
      )}

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        {/* Stats overview — observations use total counters, while older embedded views keep loaded summaries. */}
        {showStats && (
          <div className={`relative z-20 ${showHero ? "-mt-10" : "mt-6"}`}>
            <StatBand stats={stats.slice(0, 4)} />
          </div>
        )}

        {/* Toolbar */}
        <div className="relative z-20 mt-5 flex flex-wrap items-center gap-3">
          <div className="relative flex-1" style={{ minWidth: "220px" }}>
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-foreground/40"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={meta.search}
              aria-label="Search nature sightings"
              className="h-10 w-full truncate rounded-full border border-border-soft bg-surface py-0 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-primary/40"
            />
          </div>

          {/* Cards / Map view toggle */}
          <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background/50 p-0.5 backdrop-blur">
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
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors ${
                  view === o.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
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
              className="h-10 appearance-none rounded-full border border-border-soft bg-surface py-0 pl-3.5 pr-8 text-sm font-medium text-foreground/70 outline-none transition-colors hover:text-foreground focus:border-primary/40"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
            <ChevronDownIcon
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40"
            />
          </div>

          {kind === "site" && (
            <div className="inline-flex h-10 items-center rounded-full border border-border-soft bg-surface p-0.5">
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
                  className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-medium transition-colors ${
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
            <div className="inline-flex h-10 items-center rounded-full border border-border-soft bg-surface p-0.5">
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
                  className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-medium transition-colors ${
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

        </div>

        {/* Grid / Map */}
        <div className="mt-6">
          {view === "map" ? (
            <RecordMap records={filtered} kind={kind} onOpen={setDrawer} />
          ) : (phase === "idle" || phase === "loading") && records.length === 0 ? (
            <SkeletonGrid kind={kind} />
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
            <ul role="list" className={gridCls}>
              {renderedRecords.map((r, i) => (
                <li key={r.id} className="animate-in" style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}>
                  <RecordCard record={r} onOpen={setDrawer} />
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
        {records.length > 0 && (
          <div className="mt-10 flex flex-col items-center gap-3">
            {hasMoreCardsToShow ? (
              <button
                type="button"
                onClick={() => setCardLimit((current) => current + CARD_BATCH_SIZE)}
                className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-6 py-3 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken"
              >
                Show more
              </button>
            ) : hasMore ? (
              <button
                type="button"
                onClick={() => load("more")}
                disabled={phase === "more" || walking}
                aria-busy={phase === "more" || walking}
                className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-6 py-3 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken disabled:opacity-60"
              >
                {phase === "more" || walking ? "Loading" : "Load more"}
              </button>
            ) : (
              <span className="text-[13px] italic text-foreground/50">You have reached the end.</span>
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
};

const RecordCard = memo(function RecordCard({ record, onOpen }: { record: ExplorerRecord; onOpen: (record: ExplorerRecord) => void }) {
  if (record.kind === "occurrence") {
    return <OccurrenceCard record={record} onOpen={onOpen} />;
  }
  return <GenericCard record={record} onOpen={onOpen} />;
});

// ── Occurrence card (full-bleed) ─────────────────────────────────────────────
//
// A sighting reads as the media itself: a photo fills the whole tile, or — for
// a sound recording — a soft gradient panel with an inline play/pause control.
// Only the essentials sit over a bottom scrim: the owner's handle, the species
// name, and the date. No media-type icons, no surface chrome.

const OccurrenceCard = memo(function OccurrenceCard({
  record,
  onOpen,
}: {
  record: OccurrenceRecord;
  onOpen: (record: ExplorerRecord) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [resolvedImageUrl, setResolvedImageUrl] = useState(record.imageUrl);
  const [profile, setProfile] = useState(() => getCachedProfile(record.did) ?? null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unregisterAudioRef = useRef<(() => void) | null>(null);
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing" | "paused">("idle");

  const imageUrl = resolvedImageUrl ?? record.imageUrl;
  const hasImage = Boolean(imageUrl) && !imgError;
  const hasAudio = Boolean(record.audioRef || record.audioUrl);
  const name = record.scientificName || record.vernacularName || "Unidentified";
  const subtitle =
    record.scientificName && record.vernacularName ? record.vernacularName : null;
  const creatorLabel = record.creatorName ?? profile?.handle ?? profile?.displayName ?? null;
  const date = record.eventDate || record.createdAt;

  useEffect(() => {
    setImgError(false);
    setResolvedImageUrl(record.imageUrl);
    if (record.imageUrl || !record.imageRef) return;

    const controller = new AbortController();
    resolveBlobUrl(record.did, record.imageRef, controller.signal)
      .then((url) => setResolvedImageUrl(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolvedImageUrl(null);
      });
    return () => controller.abort();
  }, [record.did, record.imageRef, record.imageUrl]);

  useEffect(() => {
    if (record.creatorName || profile) return;
    let active = true;
    resolveDidProfile(record.did).then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, [profile, record.creatorName, record.did]);

  // Pause and release the sound element on unmount.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      unregisterAudioRef.current?.();
      audioRef.current = null;
      unregisterAudioRef.current = null;
    },
    [],
  );

  async function toggleAudio(e: ReactMouseEvent) {
    e.stopPropagation();
    let el = audioRef.current;
    if (!el) {
      pauseOtherAudio();
      setAudioState("loading");
      const url = record.audioUrl ?? (await resolveBlobUrl(record.did, record.audioRef));
      if (!url) {
        setAudioState("idle");
        return;
      }
      el = new Audio(url);
      el.addEventListener("ended", () => setAudioState("paused"));
      el.addEventListener("pause", () => setAudioState("paused"));
      el.addEventListener("play", () => setAudioState("playing"));
      unregisterAudioRef.current?.();
      unregisterAudioRef.current = registerAudioElement(el);
      audioRef.current = el;
    }
    if (el.paused) {
      playExclusiveAudio(el).catch(() => setAudioState("paused"));
    } else {
      el.pause();
    }
  }

  function open() {
    if (hasAudio) pauseOtherAudio();
    onOpen(record);
  }

  const audioOnly = hasAudio && !hasImage;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      aria-label={`Open ${name}`}
      className="group relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg bg-surface-sunken text-left outline-none transition-all duration-300 hover:z-10 hover:shadow-[0_18px_40px_-22px_rgba(20,30,15,0.55)] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {hasImage ? (
        <Image
          src={imageUrl!}
          alt={name}
          fill
          sizes="(max-width:640px) 50vw, (max-width:1280px) 25vw, 240px"
          unoptimized={!isPdsBlobUrl(imageUrl)}
          onError={() => setImgError(true)}
          className="scale-[1.05] object-cover transition-transform duration-[600ms] ease-out group-hover:scale-110"
        />
      ) : (
        // Sound-only (and empty) tiles get a deep forest panel so the white
        // label and the play control read with strong contrast — the old light
        // surface left both washed out.
        <div
          className="absolute inset-0"
          style={{
            background: audioOnly
              ? "radial-gradient(125% 110% at 50% 18%, color-mix(in srgb, var(--primary) 60%, #0b2015), #081a10)"
              : "radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--primary) 16%, transparent), transparent), var(--surface)",
          }}
        >
          {audioOnly ? (
            <AudioLinesIcon
              aria-hidden
              className="absolute left-1/2 top-[38%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 text-white/10"
            />
          ) : null}
        </div>
      )}

      {/* Inline audio control — centered on sound-only tiles, tucked top-right
          when a photo is also present. High-contrast in both cases. */}
      {hasAudio ? (
        <button
          type="button"
          onClick={toggleAudio}
          aria-label={audioState === "playing" ? "Pause sound" : "Play sound"}
          className={
            hasImage
              ? "absolute right-2 top-2 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white shadow-md ring-1 ring-white/25 backdrop-blur-md transition hover:bg-black/70"
              : "absolute left-1/2 top-[38%] z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0b2015] shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)] transition hover:scale-105"
          }
        >
          {audioState === "loading" ? (
            <Loader2Icon className="h-5 w-5 animate-spin" aria-hidden />
          ) : audioState === "playing" ? (
            <PauseIcon className="h-5 w-5" aria-hidden />
          ) : (
            <PlayIcon className="h-5 w-5 translate-x-[1px]" aria-hidden />
          )}
        </button>
      ) : null}

      {/* Bottom scrim — darker than before so labels stay legible over any
          media, and always present (not hover-gated). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 z-10 p-2.5">
        {creatorLabel ? (
          <p className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-white/85">
            {creatorLabel}
          </p>
        ) : null}
        <h3
          className="font-instrument text-[16px] italic leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
          style={clamp(2)}
        >
          {name}
        </h3>

        {/* Secondary details slide open only on hover/focus, keeping the resting
            tile to just the species + creator. */}
        {subtitle || date ? (
          <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-out group-hover:grid-rows-[1fr] group-hover:opacity-100 group-focus-visible:grid-rows-[1fr] group-focus-visible:opacity-100">
            <div className="overflow-hidden">
              {subtitle ? (
                <p className="mt-0.5 truncate text-[12px] leading-snug text-white/80">{subtitle}</p>
              ) : null}
              {date ? (
                <p className="mt-0.5 text-[10.5px] text-white/65">{formatDate(date)}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

const GenericCard = memo(function GenericCard({ record, onOpen }: { record: ExplorerRecord; onOpen: (record: ExplorerRecord) => void }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;
  const v = cardView(record);

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
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

        <div className="absolute left-1.5 top-1.5 z-10 inline-flex max-w-[calc(100%-0.75rem)] items-center rounded-full bg-background/75 px-2 py-1 text-[10px] font-medium text-foreground/65 shadow-sm backdrop-blur-md">
          <span className="truncate">{record.kind === "bumicert" ? record.creatorName ?? "Project steward" : record.kind === "site" ? record.name : "Shared profile"}</span>
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
});

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
          {formatCompact(record.contributorCount)} contributor
          {record.contributorCount === 1 ? "" : "s"}
        </Pill>
        {record.locationCount > 0 ? (
          <Pill>
            {formatCompact(record.locationCount)} site{record.locationCount === 1 ? "" : "s"}
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
    return [r.scientificName, r.vernacularName, r.family, r.genus, r.kingdom, r.country, r.countryCode, r.locality, r.recordedBy, r.creatorName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  if (r.kind === "site") {
    return [r.name, r.country, r.did].filter(Boolean).join(" ").toLowerCase();
  }
  return [r.title, r.shortDescription, r.creatorName, r.did].filter(Boolean).join(" ").toLowerCase();
}

// ── Stats overview ───────────────────────────────────────────────────────
//
// A donations-style KPI band, but derived from whatever records are currently
// loaded in the browser (the streams page in, so this grows as you "Load
// more"). Time windows key off each record's createdAt.

type Stat = {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  accent?: boolean;
};

function within(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= Date.now() - days * 86_400_000;
}

function computeOccurrenceTotalStats(stats: OccurrenceStats): Stat[] {
  const n = (v: number | null) => (v == null ? "—" : formatCompact(v));
  return [
    {
      label: "Nature sightings",
      value: n(stats.totalSightings),
      detail: "sightings shared",
      icon: <LayoutGridIcon />,
      accent: true,
    },
    {
      label: "Photo sightings",
      value: n(stats.photoSightings),
      detail: "with photos",
      icon: <ImageIcon />,
    },
    {
      label: "New sightings",
      value: n(stats.recentSightings),
      detail: "shared in the last 30 days",
      icon: <LeafIcon />,
      accent: true,
    },
    {
      label: "Mapped sightings",
      value: n(stats.mappedSightings),
      detail: "with map locations",
      icon: <MapIcon />,
    },
  ];
}

function computeStats(records: ExplorerRecord[], kind: RecordKind): Stat[] {
  const last30 = records.filter((r) => within(r.createdAt, 30)).length;
  const last7 = records.filter((r) => within(r.createdAt, 7)).length;
  const n = (v: number) => formatCompact(v);

  if (kind === "occurrence") {
    const occ = records as OccurrenceRecord[];
    const species = new Set(occ.map((r) => r.scientificName).filter(Boolean)).size;
    const countries = new Set(occ.map((r) => r.countryCode || r.country).filter(Boolean)).size;
    const withMedia = occ.filter((r) => r.media.length > 0).length;
    return [
      {
        label: "Nature sightings",
        value: n(occ.length),
        detail: "loaded from recent field reports",
        icon: <LayoutGridIcon />,
        accent: true,
      },
      {
        label: "New in 30 days",
        value: n(last30),
        detail: "recent sightings in this view",
        icon: <LeafIcon />,
      },
      {
        label: "Species",
        value: n(species),
        detail: "different kinds found",
        icon: <LeafIcon />,
        accent: true,
      },
      {
        label: "With photos or sounds",
        value: n(withMedia),
        detail: "media-rich sightings",
        icon: <ImageIcon />,
      },
      {
        label: "Countries",
        value: n(countries),
        detail: "places reached",
        icon: <MapIcon />,
      },
      {
        label: "New this week",
        value: n(last7),
        detail: "latest activity",
        icon: <AudioLinesIcon />,
      },
    ];
  }

  if (kind === "bumicert") {
    const b = records as BumicertRecord[];
    const contributors = b.reduce((s, r) => s + r.contributorCount, 0);
    const sites = b.reduce((s, r) => s + r.locationCount, 0);
    const withCover = b.filter((r) => r.imageUrl).length;
    return [
      { label: "Bumicerts", value: n(b.length), detail: "loaded project stories", icon: <LayoutGridIcon />, accent: true },
      { label: "New in 30 days", value: n(last30), detail: "recent stories", icon: <LeafIcon /> },
      { label: "Contributors", value: n(contributors), detail: "across stories", icon: <LeafIcon />, accent: true },
      { label: "Project places", value: n(sites), detail: "linked places", icon: <MapIcon /> },
      { label: "With pictures", value: n(withCover), detail: "cover pictures", icon: <ImageIcon /> },
      { label: "New this week", value: n(last7), detail: "latest activity", icon: <AudioLinesIcon /> },
    ];
  }

  const s = records as SiteRecord[];
  const countries = new Set(s.map((r) => r.country).filter(Boolean)).size;
  const withImg = s.filter((r) => r.imageUrl).length;
  return [
    { label: "Organizations", value: n(s.length), detail: "loaded profiles", icon: <LayoutGridIcon />, accent: true },
    { label: "New in 30 days", value: n(last30), detail: "recent profiles", icon: <LeafIcon /> },
    { label: "Countries", value: n(countries), detail: "places reached", icon: <MapIcon />, accent: true },
    { label: "With pictures", value: n(withImg), detail: "cover or logo pictures", icon: <ImageIcon /> },
    { label: "New this week", value: n(last7), detail: "latest activity", icon: <AudioLinesIcon /> },
  ];
}

function StatBand({ stats }: { stats: Stat[] }) {
  return (
    <StatsTileGrid
      columns={stats.length === 4 ? 4 : 6}
      items={stats.map((stat) => ({
        label: stat.label,
        value: stat.value,
        detail: stat.detail,
        icon: stat.icon,
        accent: stat.accent,
      }))}
    />
  );
}

// ── Bits ───────────────────────────────────────────────────────────────────

function LeafGlyph() {
  return <LeafIcon width={16} height={16} aria-hidden />;
}

function MediaIcon({ kind }: { kind: OccurrenceRecord["media"][number] }) {
  if (kind === "audio" || kind === "spectrogram") {
    return <AudioLinesIcon width={11} height={11} aria-hidden />;
  }
  if (kind === "video") {
    return <PlayIcon width={11} height={11} aria-hidden />;
  }
  return <ImageIcon width={11} height={11} aria-hidden />;
}


function CardsGlyph() {
  return <LayoutGridIcon width={13} height={13} aria-hidden />;
}

function MapGlyph() {
  return <MapIcon width={13} height={13} aria-hidden />;
}

function Spinner() {
  return <Loader2Icon className="h-[15px] w-[15px] animate-spin" aria-hidden />;
}

function SkeletonGrid({ kind }: { kind?: RecordKind }) {
  // Observations skeletons mirror the gallery: bare square tiles, tight gaps.
  if (kind === "occurrence") {
    return (
      <div className={GALLERY_GRID_CLS} aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <div className={GRID_CLS} aria-hidden>
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-border-soft bg-surface">
          <div className="skeleton aspect-[4/3]" />
          {/* Mirrors GenericCard content: title, subtitle, a row of pills, then a
              right-aligned "Shared …" footer separated by a hairline border. */}
          <div className="flex flex-1 flex-col px-3 pb-2.5 pt-2.5">
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton mt-1 h-3 w-1/2 rounded" />
            <div className="mt-2 flex gap-1">
              <div className="skeleton h-4 w-12 rounded-full" />
              <div className="skeleton h-4 w-10 rounded-full" />
            </div>
            <div className="mt-2.5 flex justify-end border-t border-border-soft pt-2">
              <div className="skeleton h-2.5 w-1/3 rounded" />
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
