"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import {
  AudioLinesIcon,
  ArrowUpDownIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ImageIcon,
  LayoutGridIcon,
  LeafIcon,
  ListIcon,
  Loader2Icon,
  MapIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
} from "lucide-react";
import {
  walkOccurrences,
  fetchOccurrenceStats,
  fetchOccurrenceTotalCount,
  fetchSites,
  fetchBumicerts,
  fetchRecordByUri,
  type BumicertBadgeFilter,
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
import { ObservationGrid } from "./ObservationGrid";
import { RecordMap } from "./RecordMap";
import { StatsTileGrid } from "./StatsTile";
import { isPdsBlobUrl, resolveBlobUrl } from "../_lib/pds";
import { pauseOtherAudio, playExclusiveAudio, registerAudioElement } from "../_lib/audio-coordinator";
import { resolveDidProfile, getCachedProfile } from "../_lib/did-profile";
import { formatCompact, countryFlag, formatCountry, formatDate } from "../_lib/format";
import { AutoLoadMoreButton } from "./AutoLoadMoreButton";
import { OwnerFilterBanner, OwnerFilterButton, useOwnerFilter } from "./OwnerFilter";
import { AllFiltersPopover, SortSection, SourceFilterChips } from "./AllFiltersPopover";
import { PictureHero } from "./PictureHero";
import { TrustedByBadges } from "./TrustedByBadges";
import { useStableQueryView } from "../_lib/use-stable-query-view";

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
    eyebrow: "Nature sightings",
    title: "Browse",
    accent: "nature sightings",
    lede: "Explore plants, animals, photos, and field sound recordings shared from project places.",
    search: "Search by common name, place, or plant/animal",
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
    search: "Filter Certs by title or description",
    heroLight: "/images/explore/explore-hero-light@2x.webp",
    heroDark: "/images/explore/explore-hero-dark@2x.webp",
  },
  project: {
    eyebrow: "Projects",
    title: "Browse",
    accent: "project collections",
    lede: "Explore project collections and the Certs they group together.",
    search: "Filter projects by title or description",
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
  site: "app.certified.actor.organization",
  bumicert: "org.hypercerts.claim.activity",
  project: "org.hypercerts.collection",
};

/** Compact, shareable key for a record: `did/collection/rkey` (no segment ever
 *  contains "/"). The collection is encoded so records round-trip correctly. */
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
type OccurrenceCategory = "all" | "plants" | "trees" | "birds" | "flowers";
type SortMode = "newest" | "oldest" | "az" | "za";
type ViewMode = "cards" | "list" | "map";
type CardDensity = "comfortable" | "compact";

const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;
const SEARCH_QUERY_STATE_OPTIONS = { ...QUERY_STATE_OPTIONS, throttleMs: 200 } as const;
const SORT_MODES: SortMode[] = ["newest", "oldest", "az", "za"];
const VIEW_MODES: ViewMode[] = ["cards", "list", "map"];
const CARD_DENSITIES: CardDensity[] = ["comfortable", "compact"];
const OCCURRENCE_MEDIA_FILTERS: OccurrenceFilter[] = ["image", "audio", "all"];
const OCCURRENCE_CATEGORIES: OccurrenceCategory[] = ["all", "plants", "trees", "birds", "flowers"];
const BADGE_FILTER_KEYS: BumicertBadgeFilter[] = ["gainforest", "maearth"];
const SITE_SOURCE_FILTERS: SiteSourceFilter[] = ["both", "certified"];

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
const OCCURRENCE_CATEGORY_OPTIONS: Array<{ id: OccurrenceCategory; label: string }> = [
  { id: "all", label: "All nature" },
  { id: "plants", label: "Plants" },
  { id: "trees", label: "Trees" },
  { id: "birds", label: "Birds" },
  { id: "flowers", label: "Flowers" },
];
type BadgeFilterOption = {
  key: BumicertBadgeFilter;
  label: string;
  logoSrc: string;
};

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "A → Z" },
  { value: "za", label: "Z → A" },
];

export function RecordExplorer({
  kind,
  initialPage,
  extraInitialRecords,
  showHero = true,
  ownerDid: ownerDidProp,
  enableOwnerFilter = false,
  defaultOccurrenceMedia = DEFAULT_OCCURRENCE_MEDIA,
  leadingCard,
  compactLeadingCard,
  emptyState,
  showStatsOverview = true,
  hiddenRecordIds,
  observationSelection,
  onObservationVisibleRecordsChange,
  filterUris = null,
  emptyFilteredTitle,
  emptyFilteredBody,
  hideToolbarWhenEmpty = false,
  hideOccurrenceFilters = false,
  toolbarAfterSearchRow,
  enableCompactObservationCards = false,
  defaultCardDensity = "comfortable",
  onEmptyStateChange,
}: {
  kind: RecordKind;
  initialPage?: InitialExplorerPage;
  /** Records to surface ahead of the server page — e.g. just-uploaded items that
   *  the indexer has not picked up yet. Deduped against the server page by id. */
  extraInitialRecords?: ExplorerRecord[];
  showHero?: boolean;
  ownerDid?: string;
  /** When true (and no explicit ownerDid prop), the explorer reads the shareable
   *  `?by=<did>` owner filter and shows the owner picker + chip. */
  enableOwnerFilter?: boolean;
  defaultOccurrenceMedia?: OccurrenceFilter;
  leadingCard?: ReactNode;
  /** Optional replacement for the leading card when observation cards are compact. */
  compactLeadingCard?: ReactNode;
  emptyState?: ReactNode;
  showStatsOverview?: boolean;
  hiddenRecordIds?: ReadonlySet<string>;
  observationSelection?: {
    selectedIds: ReadonlySet<string>;
    onToggle: (record: OccurrenceRecord, selected: boolean) => void;
    getDisabledReason?: (record: OccurrenceRecord) => string | null;
  };
  onObservationVisibleRecordsChange?: (records: OccurrenceRecord[]) => void;
  /** When set, only records whose at:// URI is in this set are shown, and the
   *  stream auto-walks to completion so every match is found. */
  filterUris?: ReadonlySet<string> | null;
  emptyFilteredTitle?: string;
  emptyFilteredBody?: string;
  /** Hide the search/sort/view + filter-pill toolbar when there are no records
   *  at all (so a bare empty state can stand on its own). */
  hideToolbarWhenEmpty?: boolean;
  /** Hide the occurrence badge/media/category filter-pill row. Used by profile
   *  and manage views, where a single person's small set of sightings doesn't
   *  warrant the global explore page's filters — keeps the surface minimal. */
  hideOccurrenceFilters?: boolean;
  /** Extra controls rendered directly below the search/view row. */
  toolbarAfterSearchRow?: ReactNode;
  /** Enables a small cards-only density toggle for observation tiles. */
  enableCompactObservationCards?: boolean;
  /** Initial density for cards; pages can opt into compact without changing global defaults. */
  defaultCardDensity?: CardDensity;
  /** Fires with true once the explorer has loaded and holds zero records (no
   *  data at all), false otherwise. Lets a parent collapse its own chrome. */
  onEmptyStateChange?: (isEmpty: boolean) => void;
}) {
  const meta = KIND_META[kind];
  const exploreT = useTranslations("marketplace.explore");
  const observationsT = useTranslations("marketplace.observations");
  // An explicit ownerDid prop (account pages) wins; otherwise the explore page
  // can opt into the shareable `?by=` owner filter.
  const { ownerDid: ownerFilterDid, setOwnerDid } = useOwnerFilter();
  const ownerFilterActive = enableOwnerFilter && !ownerDidProp;
  const ownerDid = ownerDidProp ?? (ownerFilterActive ? ownerFilterDid ?? undefined : undefined);
  // Stats band is for embedded account/manage views (explicit ownerDid prop),
  // not the explore owner filter — keep explore consistent across kinds.
  const shouldShowStatsOverview = showStatsOverview && (!showHero || Boolean(ownerDidProp));
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions(SEARCH_QUERY_STATE_OPTIONS),
  );
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringEnum<SortMode>(SORT_MODES).withDefault("newest").withOptions(QUERY_STATE_OPTIONS),
  );
  const [occMedia, setOccMedia] = useQueryState(
    "media",
    parseAsStringEnum<OccurrenceFilter>(OCCURRENCE_MEDIA_FILTERS).withDefault(defaultOccurrenceMedia).withOptions(QUERY_STATE_OPTIONS),
  );
  const [occCategory, setOccCategory] = useQueryState(
    "category",
    parseAsStringEnum<OccurrenceCategory>(OCCURRENCE_CATEGORIES).withDefault("all").withOptions(QUERY_STATE_OPTIONS),
  );
  const [siteSource, setSiteSource] = useQueryState(
    "source",
    parseAsStringEnum<SiteSourceFilter>(SITE_SOURCE_FILTERS).withDefault("both").withOptions(QUERY_STATE_OPTIONS),
  );
  const [badgesParam, setBadgesParam] = useQueryState(
    "badges",
    parseAsString.withOptions(QUERY_STATE_OPTIONS),
  );
  const badgeFilters = useMemo(() => parseBadgeFilterParam(badgesParam), [badgesParam]);
  const [queryView, setQueryView] = useQueryState(
    "view",
    parseAsStringEnum<ViewMode>(VIEW_MODES).withDefault("cards").withOptions(QUERY_STATE_OPTIONS),
  );
  const [view, setView] = useStableQueryView({
    queryValue: queryView,
    setQueryValue: setQueryView,
    values: VIEW_MODES,
    defaultValue: "cards",
  });
  const [cardDensity, setCardDensity] = useQueryState(
    "density",
    parseAsStringEnum<CardDensity>(CARD_DENSITIES).withDefault(defaultCardDensity).withOptions(QUERY_STATE_OPTIONS),
  );
  const [recordParamValue, setRecordParamValue] = useQueryState(
    "record",
    parseAsString.withOptions(QUERY_STATE_OPTIONS),
  );
  const initialRecords = useMemo(() => {
    const base = initialPage?.records ?? [];
    if (!extraInitialRecords?.length) return base;
    const seen = new Set(extraInitialRecords.map((record) => record.id));
    return [...extraInitialRecords, ...base.filter((record) => !seen.has(record.id))];
    // Seeded once at mount (useState initializer below); the panel remounts when
    // returning from add mode, so a changing `extraInitialRecords` is picked up then.
  }, [initialPage, extraInitialRecords]);
  const shouldLoadFromUrl = Boolean(query.trim()) || sort !== "newest" || (kind === "occurrence" && occMedia !== defaultOccurrenceMedia) || (kind === "site" && siteSource !== "both");

  const [records, setRecords] = useState<ExplorerRecord[]>(shouldLoadFromUrl ? [] : initialRecords);
  const [cursor, setCursor] = useState<string | null>(shouldLoadFromUrl ? null : initialPage?.cursor ?? null);
  const [hasMore, setHasMore] = useState(shouldLoadFromUrl ? true : initialPage?.hasMore ?? true);
  const [phase, setPhase] = useState<Phase>(initialPage && !shouldLoadFromUrl ? "ready" : "idle");
  const [sortOpen, setSortOpen] = useState(false);
  const [walking, setWalking] = useState(false);
  const [occurrenceStats, setOccurrenceStats] = useState<OccurrenceStats | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [occurrenceStatsLoading, setOccurrenceStatsLoading] = useState(showStatsOverview && kind === "occurrence" && !ownerDid);
  // Gate the first load until the URL has been read, so a shared link's filter
  // params (media/source) are applied before the initial fetch.
  const [hydrated, setHydrated] = useState(false);
  const [drawer, setDrawer] = useState<ExplorerRecord | null>(null);
  const [cardLimit, setCardLimit] = useState(INITIAL_CARD_LIMIT);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  // `?record=` value awaiting resolution, so the URL keeps it while we fetch.
  const [pendingRecord, setPendingRecord] = useState<string | null>(null);
  // Server-rendered first pages should stay visible after the URL hydrate pass.
  const firstResetAfterHydrateRef = useRef(true);
  const lastDrawerParamRef = useRef<string | null>(null);

  const controller = useRef<AbortController | null>(null);
  const loadSeqRef = useRef(0);
  const totalCountSeqRef = useRef(0);
  const occurrenceStatsStartedRef = useRef(false);
  const hasLoadedRecords = records.length > 0;
  const badgeFilterOptions = useMemo<BadgeFilterOption[]>(() => [
    { key: "gainforest", label: exploreT("filters.badges.gainforest"), logoSrc: "/assets/media/images/gainforest-logo.svg" },
    { key: "maearth", label: exploreT("filters.badges.maearth"), logoSrc: "/assets/media/images/badges/ma-earth-logo.webp" },
  ], [exploreT]);

  useEffect(() => {
    if (!showStatsOverview || kind !== "occurrence" || ownerDid || !hasLoadedRecords || occurrenceStatsStartedRef.current) return;
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
  }, [hasLoadedRecords, kind, ownerDid, showStatsOverview]);
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
          // No badge pill selected → show every sighting; selecting GainForest
          // and/or Ma Earth narrows to those featured badges.
          featuredBadgesOnly: !ownerDid && badgeFilters.length > 0,
          badgeFilters,
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
          ? fetchSites(target, after, ctrl.signal, undefined, siteSource, { query: deferredQuery, sort, featuredBadgesOnly: !ownerDid, badgeFilters })
          : fetchBumicerts(target, after, ctrl.signal, undefined, { query: deferredQuery, sort, featuredBadgesOnly: !ownerDid, badgeFilters });

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
    [deferredQuery, kind, occMedia, ownerDid, siteSource, sort, badgeFilters],
  );

  // Once nuqs has read the URL, allow the first load and resolve any shared
  // record link.
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!recordParamValue) return;
    const uri = paramToUri(recordParamValue, kind);
    if (!uri) return;
    setPendingRecord(recordParamValue);
    const ctrl = new AbortController();
    fetchRecordByUri(uri, ctrl.signal)
      .then((r) => {
        // Don't clobber a record the visitor opened while we were fetching.
        if (r) setDrawer((prev) => prev ?? r);
      })
      .catch(() => {})
      .finally(() => setPendingRecord(null));
    return () => ctrl.abort();
  }, [kind, recordParamValue]);

  // Abort any in-flight load on unmount.
  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (pendingRecord) return;
    const nextRecordParam = drawer ? recordParam(drawer) : null;
    if (nextRecordParam === lastDrawerParamRef.current) return;
    lastDrawerParamRef.current = nextRecordParam;
    if (nextRecordParam !== recordParamValue) void setRecordParamValue(nextRecordParam);
  }, [drawer, pendingRecord, recordParamValue, setRecordParamValue]);

  // Changing the occurrence media filter resets and re-walks.
  function changeMedia(next: OccurrenceFilter) {
    if (next === occMedia) return;
    controller.current?.abort();
    void setOccMedia(next);
    resetStream();
  }

  function changeCategory(next: OccurrenceCategory) {
    if (next === occCategory) return;
    void setOccCategory(next);
  }

  function updateBadgeFilters(nextFilters: BumicertBadgeFilter[]) {
    void setBadgesParam(serializeBadgeFilterParam(nextFilters));
  }

  function toggleBadgeFilter(filter: BumicertBadgeFilter) {
    updateBadgeFilters(badgeFilters.includes(filter) ? badgeFilters.filter((value) => value !== filter) : [...badgeFilters, filter]);
  }

  function handleDrawerRecordUpdated(nextRecord: ExplorerRecord) {
    setDrawer(nextRecord);
    setRecords((current) => current.map((record) => (record.atUri === nextRecord.atUri ? nextRecord : record)));
  }

  function handleDrawerRecordDeleted(deletedRecord: ExplorerRecord) {
    setDrawer(null);
    setRecords((current) => current.filter((record) => record.atUri !== deletedRecord.atUri));
  }

  // Changing the organization source resets + re-walks.
  function changeSource(next: SiteSourceFilter) {
    if (next === siteSource) return;
    controller.current?.abort();
    void setSiteSource(next);
    resetStream();
  }

  function resetStream() {
    void setQuery("");
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
  }, [deferredQuery, hydrated, occMedia, siteSource, sort, badgeFilters]);

  // First load (once hydrated) and any time a filter reset drops us back to
  // idle, kick off a walk. Gated on `hydrated` so the URL's filter params are
  // applied to the initial fetch.
  useEffect(() => {
    if (hydrated && phase === "idle" && records.length === 0) load("first");
  }, [hydrated, load, occMedia, phase, records.length, siteSource, badgeFilters]);

  // When constrained to a project (URI allowlist), walk the whole stream so
  // every matching record is found instead of relying on manual "Load more".
  useEffect(() => {
    if (!filterUris) return;
    if (phase === "ready" && hasMore && !walking) load("more");
  }, [filterUris, hasMore, load, phase, walking]);

  const canShowTotalCount = kind === "occurrence" && !ownerDid && occCategory === "all";
  useEffect(() => {
    const requestSeq = ++totalCountSeqRef.current;
    if (!canShowTotalCount) {
      setTotalCount(null);
      return;
    }
    const controller = new AbortController();
    const isCurrent = () => totalCountSeqRef.current === requestSeq && !controller.signal.aborted;
    setTotalCount(null);
    fetchOccurrenceTotalCount({
      media: occMedia,
      query: deferredQuery,
      ownerDid,
      featuredBadgesOnly: !ownerDid && badgeFilters.length > 0,
      badgeFilters,
      signal: controller.signal,
    })
      .then((count) => {
        if (isCurrent()) setTotalCount(count);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[explorer] occurrence count failed", error);
      });
    return () => controller.abort();
  }, [badgeFilters, canShowTotalCount, deferredQuery, occMedia, ownerDid]);

  const filtered = useMemo(() => {
    const visibleRecords = hiddenRecordIds?.size
      ? records.filter((record) => !hiddenRecordIds.has(record.id))
      : records;
    const allowed = filterUris ? visibleRecords.filter((record) => filterUris.has(record.atUri)) : visibleRecords;
    const searched = filterRecords(allowed, deferredQuery);
    const categorized = kind === "occurrence"
      ? filterOccurrenceCategory(searched as OccurrenceRecord[], occCategory)
      : searched;
    return sortRecords(categorized, sort);
  }, [deferredQuery, filterUris, hiddenRecordIds, kind, occCategory, records, sort]);
  const renderedRecords = useMemo(
    () => (view === "map" ? filtered : filtered.slice(0, cardLimit)),
    [cardLimit, filtered, view],
  );
  const hasMoreCardsToShow = view !== "map" && renderedRecords.length < filtered.length;

  useEffect(() => {
    if (kind !== "occurrence" || !onObservationVisibleRecordsChange) return;
    onObservationVisibleRecordsChange(renderedRecords as OccurrenceRecord[]);
  }, [kind, onObservationVisibleRecordsChange, renderedRecords]);

  useEffect(() => {
    setCardLimit(INITIAL_CARD_LIMIT);
  }, [deferredQuery, kind, occCategory, occMedia, siteSource, sort, badgeFilters, view, cardDensity]);
  // Embedded account/manage explorers keep compact loaded-record summaries.
  const stats = useMemo(
    () => shouldShowStatsOverview ? (kind === "occurrence" && !ownerDid && occurrenceStats ? computeOccurrenceTotalStats(occurrenceStats, records) : computeStats(records, kind)) : [],
    [kind, occurrenceStats, ownerDid, records, shouldShowStatsOverview],
  );
  const showStats = shouldShowStatsOverview && (kind === "occurrence" ? ownerDid ? records.length > 0 : Boolean(occurrenceStats) || (!occurrenceStatsLoading && records.length > 0) : records.length > 0);
  const compactObservationCards = enableCompactObservationCards && kind === "occurrence" && view === "cards" && cardDensity === "compact";
  const activeLeadingCard = compactObservationCards && compactLeadingCard ? compactLeadingCard : leadingCard;
  const gridCls = kind === "occurrence"
    ? compactObservationCards
      ? "grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-10"
      : GALLERY_GRID_CLS
    : GRID_CLS;
  // While a project filter is active and the stream is still walking, keep the
  // skeleton up so a partial page does not briefly read as empty.
  const showSkeleton = ((phase === "idle" || phase === "loading") && records.length === 0) || Boolean(filterUris && filtered.length === 0 && (walking || hasMore));

  // "No data at all" — loaded (or idle) and holding zero records. Distinct from a
  // filter/search that simply matched nothing. Used to optionally hide the
  // toolbar and to let a parent collapse its own chrome down to a bare banner.
  const noData = !showSkeleton && phase !== "error" && records.length === 0 && !query;
  useEffect(() => {
    onEmptyStateChange?.(noData);
  }, [noData, onEmptyStateChange]);

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
          compact
        />
      )}

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        {/* Stats overview — only embedded account/manage views show summaries here. */}
        {showStats && (
          <div className={`relative z-20 ${showHero ? "-mt-10" : "mt-6"}`}>
            <StatBand stats={stats.slice(0, 4)} />
          </div>
        )}

        {/* Toolbar — hidden when there is no data and the caller opted in, so a
            standalone empty state can carry the view on its own. */}
        {hideToolbarWhenEmpty && noData ? null : (
        <div className="relative z-20 mt-5 space-y-2.5">
          {/* z-30 keeps the sort popover above the filter-pill row below it: both
              rows freeze a `transform` once `animate-in` settles, so each becomes
              its own stacking context. Without this the filter row's z-20 would
              paint over the popover regardless of its own high z-index. */}
          <div className="relative z-30 flex items-center gap-2 animate-in" style={{ animationDelay: "80ms" }}>
            <div className="group/input-group relative flex h-10 min-w-0 flex-1 items-center rounded-full border border-border-soft bg-surface shadow-xs backdrop-blur transition-colors focus-within:border-primary/40">
              <SearchIcon
                aria-hidden
                className="ml-3.5 h-[15px] w-[15px] shrink-0 text-foreground/40"
              />
              <input
                value={query}
                onChange={(e) => void setQuery(e.target.value)}
                placeholder={meta.search}
                aria-label="Search nature sightings"
                className="min-w-0 flex-1 truncate border-0 bg-transparent px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-foreground/40"
              />
            </div>

            {ownerFilterActive ? <OwnerFilterButton ownerDid={ownerDid ?? null} onChange={setOwnerDid} /> : null}

            {/* Occurrence explore folds sort into its "Sort and Filter" popover
                below; other kinds keep the standalone sort control. */}
            {kind === "occurrence" && !hideOccurrenceFilters ? null : (
              <SortControl sort={sort} setSort={(nextSort) => void setSort(nextSort)} open={sortOpen} setOpen={setSortOpen} />
            )}

            {/* Cards / List / Map view toggle */}
            <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background/50 p-0.5 backdrop-blur">
              {(
                [
                  { id: "cards", label: "Cards" },
                  { id: "list", label: "List" },
                  { id: "map", label: "Map" },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => void setView(o.id)}
                  aria-pressed={view === o.id}
                  aria-label={o.label}
                  title={o.label}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full p-0 text-sm font-medium transition-colors sm:w-auto sm:px-3 ${
                    view === o.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o.id === "map" ? <MapGlyph /> : o.id === "list" ? <ListGlyph /> : <CardsGlyph />}
                  <span className="hidden sm:inline">{o.label}</span>
                </button>
              ))}
            </div>

            {enableCompactObservationCards && kind === "occurrence" && view === "cards" ? (
              <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background/50 p-0.5 backdrop-blur" aria-label={observationsT("view.density")}> 
                {([
                  { id: "compact", label: observationsT("view.compact"), icon: <CompactCardsGlyph /> },
                  { id: "comfortable", label: observationsT("view.comfortable"), icon: <CardsGlyph /> },
                ] as const).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => void setCardDensity(option.id)}
                    aria-pressed={cardDensity === option.id}
                    aria-label={option.label}
                    title={option.label}
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
                      cardDensity === option.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option.icon}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {toolbarAfterSearchRow ? <div className="animate-in" style={{ animationDelay: "100ms" }}>{toolbarAfterSearchRow}</div> : null}

          {ownerFilterActive && ownerDid ? (
            <OwnerFilterBanner ownerDid={ownerDid} onClear={() => setOwnerDid(null)} />
          ) : null}

          {kind === "occurrence" && !hideOccurrenceFilters && (
            <div
              className="relative z-20 flex justify-end animate-in"
              style={{ animationDelay: "120ms" }}
            >
              <AllFiltersPopover
                activeCount={
                  badgeFilters.length +
                  (occMedia !== defaultOccurrenceMedia ? 1 : 0) +
                  (occCategory !== "all" ? 1 : 0)
                }
                description={exploreT("filters.sightingsDescription")}
                onClear={() => {
                  updateBadgeFilters([]);
                  changeMedia(defaultOccurrenceMedia);
                  changeCategory("all");
                }}
              >
                <div className="mb-3">
                  <SortSection
                    label={exploreT("filters.sortLabel")}
                    options={SORT_OPTIONS}
                    value={sort}
                    onChange={(value) => void setSort(value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                  <SourceFilterChips
                    options={badgeFilterOptions}
                    selected={badgeFilters}
                    onToggle={toggleBadgeFilter}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                  {(
                    [
                      { id: "image", label: "Photos" },
                      { id: "audio", label: "Field sounds" },
                      { id: "all", label: "All media" },
                    ] as Array<{ id: OccurrenceFilter; label: string }>
                  ).map((o) => (
                    <FilterPill
                      key={o.id}
                      selected={occMedia === o.id}
                      onClick={() => changeMedia(o.id)}
                    >
                      {o.label}
                    </FilterPill>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                  {OCCURRENCE_CATEGORY_OPTIONS.map((o) => (
                    <FilterPill
                      key={o.id}
                      selected={occCategory === o.id}
                      onClick={() => changeCategory(o.id)}
                    >
                      {o.label}
                    </FilterPill>
                  ))}
                </div>
              </AllFiltersPopover>
            </div>
          )}
        </div>
        )}

        {/* Grid / Map */}
        <div className="mt-6">
          {view === "map" ? (
            <RecordMap records={filtered} kind={kind} onOpen={setDrawer} />
          ) : showSkeleton ? (
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
                body="Try a different name, place, or country; or show more to widen the search."
                onRetry={() => void setQuery("")}
                retryLabel="Clear search"
              />
            ) : emptyState ? (
              emptyState
            ) : kind === "occurrence" && occCategory !== "all" ? (
              <EmptyState
                title={`No ${occurrenceCategoryLabel(occCategory).toLowerCase()} sightings in this view`}
                body="Try all nature sightings or show more results to widen the view."
                onRetry={() => changeCategory("all")}
                retryLabel="Show all nature"
              />
            ) : kind === "occurrence" && occMedia !== "all" ? (
              <EmptyState
                title={`No ${occMedia === "image" ? "photo" : "field sound"} sightings found nearby`}
                body="The newest sightings do not always include photos or field sound recordings. Remove filters to browse everything."
                onRetry={() => changeMedia("all")}
                retryLabel="Remove filters"
              />
            ) : filterUris ? (
              <EmptyState
                title={emptyFilteredTitle ?? "Nothing here yet"}
                body={emptyFilteredBody ?? "There is nothing to show right now."}
              />
            ) : (
              <EmptyState title="Nothing here yet" body="There is nothing to show right now." />
            )
          ) : view === "list" ? (
            <RecordList records={renderedRecords} onOpen={setDrawer} />
          ) : kind === "occurrence" ? (
            <ObservationGrid
              records={renderedRecords as OccurrenceRecord[]}
              onOpen={setDrawer}
              onFilterOwner={ownerFilterActive ? setOwnerDid : undefined}
              className={gridCls}
              leadingCard={activeLeadingCard}
              leadingCardClassName={enableCompactObservationCards ? "col-span-2" : undefined}
              selection={observationSelection}
              compact={compactObservationCards}
            />
          ) : (
            <ul role="list" className={gridCls}>
              {activeLeadingCard ? (
                <li className="animate-in" style={{ animationDelay: "0ms" }}>
                  {activeLeadingCard}
                </li>
              ) : null}
              {renderedRecords.map((r, i) => (
                <li key={r.id} className="animate-in" style={{ animationDelay: `${Math.min(i + (activeLeadingCard ? 1 : 0), 12) * 18}ms` }}>
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
            {totalCount !== null && (
              <p className="text-sm text-muted-foreground">
                {observationsT("footer.showing", { shown: filtered.length, total: totalCount })}
              </p>
            )}
            {hasMoreCardsToShow ? (
              <button
                type="button"
                onClick={() => setCardLimit((current) => current + CARD_BATCH_SIZE)}
                className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-6 py-3 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken"
              >
                Show more
              </button>
            ) : hasMore ? (
              <AutoLoadMoreButton
                hasMore={hasMore}
                loading={phase === "more" || walking}
                onLoadMore={() => load("more")}
                autoLoad={autoLoadMore}
                onAutoLoadChange={setAutoLoadMore}
                className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-6 py-3 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken disabled:opacity-60"
              />
            ) : (
              <span className="text-[13px] italic text-foreground/50">You have reached the end.</span>
            )}
          </div>
        )}
      </div>

      <RecordDrawer
        record={drawer}
        onClose={() => setDrawer(null)}
        onRecordUpdated={handleDrawerRecordUpdated}
        onRecordDeleted={handleDrawerRecordDeleted}
      />
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
  const name = occurrenceDisplayName(record);
  const subtitle = occurrenceSecondaryName(record);
  const place = occurrencePlace(record);
  const creatorLabel = record.creatorName ?? profile?.displayName ?? profile?.handle ?? null;
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
      aria-label={`Open nature sighting: ${name}`}
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

        {place ? (
          <p className="mt-0.5 truncate text-[11.5px] leading-snug text-white/80">{place}</p>
        ) : null}

        {/* Secondary details slide open only on hover/focus, keeping the resting
            tile to the name, place, and creator. */}
        {subtitle || date ? (
          <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-out group-hover:grid-rows-[1fr] group-hover:opacity-100 group-focus-visible:grid-rows-[1fr] group-focus-visible:opacity-100">
            <div className="overflow-hidden">
              {subtitle ? (
                <p className="mt-0.5 truncate text-[12px] italic leading-snug text-white/78">{subtitle}</p>
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

        {record.kind === "site" ? (
          <TrustedByBadges did={record.did} className="absolute left-1.5 top-1.5 z-10 max-w-[70%]" variant="compact" />
        ) : (
          <div className="absolute left-1.5 top-1.5 z-10 inline-flex max-w-[calc(100%-0.75rem)] items-center rounded-full bg-background/75 px-2 py-1 text-[10px] font-medium text-foreground/65 shadow-sm backdrop-blur-md">
            <span className="truncate">{record.kind === "bumicert" || record.kind === "project" ? record.creatorName ?? "Project steward" : "Shared profile"}</span>
          </div>
        )}

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

// Shared track template for the compact observation list. The header and every
// row use the same definition so columns line up. Hidden columns must be
// matched by the track count at each breakpoint:
//   base : thumb | sighting | chevron
//   sm   : thumb | sighting | observer | date | chevron
const RECORD_LIST_GRID =
  "grid-cols-[2.75rem_minmax(0,1fr)_1rem] " +
  "sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,10rem)_minmax(0,7rem)_1rem]";

function RecordListHeader() {
  const t = useTranslations("marketplace.observations.list");
  return (
    <div className={`hidden items-center gap-3 px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45 sm:grid sm:gap-4 sm:px-3 ${RECORD_LIST_GRID}`}>
      <span aria-hidden />
      <span>{t("colSighting")}</span>
      <span>{t("colObserver")}</span>
      <span>{t("colDate")}</span>
      <span aria-hidden />
    </div>
  );
}

const RecordList = memo(function RecordList({ records, onOpen }: { records: ExplorerRecord[]; onOpen: (record: ExplorerRecord) => void }) {
  return (
    <div>
      <RecordListHeader />
      <ul role="list" className="border-t border-border-soft">
        {records.map((record, index) => (
          <li key={record.id} className="relative animate-in after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-border-soft last:after:hidden sm:after:inset-x-3" style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}>
            <RecordListItem record={record} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
});

const RecordListItem = memo(function RecordListItem({ record, onOpen }: { record: ExplorerRecord; onOpen: (record: ExplorerRecord) => void }) {
  const [imgError, setImgError] = useState(false);
  const v = cardView(record);
  const occurrenceRecord = record.kind === "occurrence" ? record : null;
  // Sightings store their photo as a blob ref, so resolve it client-side (the
  // card does the same) — otherwise the list shows a placeholder for photos
  // that the card view displays just fine.
  const [resolvedImageUrl, setResolvedImageUrl] = useState(record.imageUrl);
  const imageUrl = resolvedImageUrl ?? record.imageUrl;
  const hasImage = Boolean(imageUrl) && !imgError;
  const hasAudio = Boolean(occurrenceRecord?.audioRef || occurrenceRecord?.audioUrl);
  const ownerLabel = record.kind === "bumicert" || record.kind === "project" ? record.creatorName ?? "Project steward" : record.kind === "site" ? record.name : record.creatorName ?? "Shared profile";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unregisterAudioRef = useRef<(() => void) | null>(null);
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing" | "paused">("idle");

  const occurrenceImageRef = occurrenceRecord?.imageRef ?? null;
  useEffect(() => {
    setImgError(false);
    setResolvedImageUrl(record.imageUrl);
    if (record.imageUrl || !occurrenceImageRef) return;

    const controller = new AbortController();
    resolveBlobUrl(record.did, occurrenceImageRef, controller.signal)
      .then((url) => setResolvedImageUrl(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolvedImageUrl(null);
      });
    return () => controller.abort();
  }, [record.did, record.imageUrl, occurrenceImageRef]);

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
    if (!occurrenceRecord) return;
    let el = audioRef.current;
    if (!el) {
      pauseOtherAudio();
      setAudioState("loading");
      const url = occurrenceRecord.audioUrl ?? (occurrenceRecord.audioRef ? await resolveBlobUrl(occurrenceRecord.did, occurrenceRecord.audioRef) : null);
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
      className={`group grid w-full cursor-pointer items-center gap-3 px-2 py-2 text-left outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 sm:gap-4 sm:px-3 ${RECORD_LIST_GRID}`}
    >
      {/* Thumbnail (with audio toggle for sightings) */}
      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-surface-sunken">
        {hasImage ? (
          <Image
            src={imageUrl!}
            alt={v.alt}
            fill
            sizes="44px"
            unoptimized={!isPdsBlobUrl(imageUrl)}
            onError={() => setImgError(true)}
            className="object-cover"
          />
        ) : (
          v.placeholder
        )}
        {hasAudio ? (
          <button
            type="button"
            onClick={toggleAudio}
            aria-label={audioState === "playing" ? "Pause sound" : "Play sound"}
            className="absolute left-1/2 top-1/2 z-10 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0b2015] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)] transition hover:scale-105"
          >
            {audioState === "loading" ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : audioState === "playing" ? (
              <PauseIcon className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <PlayIcon className="h-3.5 w-3.5 translate-x-[1px]" aria-hidden />
            )}
          </button>
        ) : null}
      </span>

      {/* Sighting: title + secondary meta */}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium leading-snug text-foreground group-hover:underline">{v.title}</span>
        {/* Mobile: observer · place. Desktop: place/subtitle. */}
        <span className="mt-0.5 truncate text-xs leading-snug text-foreground/55 sm:hidden">
          {[ownerLabel, v.subtitle].filter(Boolean).join(" \u00b7 ")}
        </span>
        {v.subtitle ? (
          <span className="mt-0.5 hidden truncate text-xs leading-snug text-foreground/55 sm:block">{v.subtitle}</span>
        ) : null}
      </span>

      {/* Observer */}
      <span className="hidden min-w-0 flex-col justify-center text-xs text-foreground/55 sm:flex">
        <span className="truncate">{ownerLabel}</span>
        {record.kind === "site" ? <TrustedByBadges did={record.did} variant="compact" /> : null}
      </span>

      {/* Date */}
      <span className="hidden min-w-0 truncate text-xs text-foreground/50 sm:block">
        {record.createdAt ? formatDate(record.createdAt) : ""}
      </span>

      {/* Affordance */}
      <ChevronRightIcon className="h-4 w-4 shrink-0 justify-self-end text-foreground/40 transition-colors group-hover:text-foreground" aria-hidden />
    </div>
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

function SortControl({
  sort,
  setSort,
  open,
  setOpen,
}: {
  sort: SortMode;
  setSort: (sort: SortMode) => void;
  open: boolean;
  setOpen: (next: boolean | ((value: boolean) => boolean)) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen]);

  const label = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "Sort";

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Sort sightings"
        title={label}
        className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background/70 px-3 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground hover:shadow-sm"
      >
        <ArrowUpDownIcon className="h-4 w-4" aria-hidden />
        <span className="hidden md:inline">{label}</span>
        <ChevronDownIcon className={`hidden h-4 w-4 transition-transform md:inline ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-[1000] mt-2 w-44 rounded-2xl border border-border bg-popover py-1.5 shadow-xl">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setSort(option.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                sort === option.value
                  ? "bg-primary/5 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilterPill({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm font-medium transition-colors ${
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border-soft bg-surface text-foreground/65 hover:border-primary/30 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function occurrenceDisplayName(record: OccurrenceRecord): string {
  if (record.media.includes("audio") && record.vernacularName === "Nature sound recording" && record.scientificName) {
    return record.scientificName;
  }
  return record.vernacularName || record.scientificName || (record.media.includes("audio") ? "Nature sound recording" : "Unidentified sighting");
}

function occurrenceSecondaryName(record: OccurrenceRecord): string | null {
  if (!record.vernacularName || !record.scientificName) return null;
  if (record.media.includes("audio") && record.vernacularName === "Nature sound recording") return record.vernacularName;
  return record.vernacularName.toLowerCase() === record.scientificName.toLowerCase()
    ? null
    : record.scientificName;
}

function occurrencePlace(record: OccurrenceRecord): string | null {
  const country = record.country
    ? [countryFlag(record.countryCode), record.country].filter(Boolean).join(" ")
    : formatCountry(record.countryCode);
  const place = [record.locality, country].filter(Boolean).join(", ");
  return place || country || null;
}

function cardView(record: ExplorerRecord): CardView {
  if (record.kind === "occurrence") {
    const name = occurrenceDisplayName(record);
    const place = occurrencePlace(record);
    const taxon = occurrenceSecondaryName(record) || record.family || record.genus || record.kingdom || null;
    return {
      alt: name,
      title: name,
      subtitle: place ?? undefined,
      pills: (
        <>
          {taxon ? <Pill>{taxon}</Pill> : null}
          {place ? (
            <Pill>
              {place}
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
                title={mediaLabel(m)}
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
                {formatCountry(record.country)}
              </Pill>
            ) : null}
            {record.orgType ? <Pill>{record.orgType}</Pill> : null}
          </>
        ) : undefined,
      badge: (
        <span className="inline-flex items-center rounded-full bg-background/85 px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.1em] text-foreground/70 backdrop-blur-md">
          {certified ? "Verified" : "GainForest"}
        </span>
      ),
      placeholder: (
        <div className="flex h-full w-full items-center justify-center font-garamond text-[34px] text-foreground/15">
          {countryFlag(record.country) || "\u25F0"}
        </div>
      ),
    };
  }

  if (record.kind === "project") {
    return {
      alt: record.title,
      title: record.title,
      subtitle: record.shortDescription ?? undefined,
      pills: (
        <>
          <Pill accent>
            {formatCompact(record.bumicertCount)} Cert{record.bumicertCount === 1 ? "" : "s"}
          </Pill>
          {record.locationUri ? <Pill>Project place</Pill> : null}
        </>
      ),
      badge: (
        <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.1em] text-primary backdrop-blur-md">
          Project
        </span>
      ),
      placeholder: (
        <div className="flex h-full w-full items-center justify-center font-garamond text-[14px] italic text-foreground/30">
          No cover image
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
          {formatCompact(record.contributorCount)} {record.contributorCount === 1 ? "person" : "people"} named
        </Pill>
        {record.locationCount > 0 ? (
          <Pill>
            {formatCompact(record.locationCount)} project place{record.locationCount === 1 ? "" : "s"}
          </Pill>
        ) : null}
      </>
    ),
    badge: (
      <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.1em] text-brand-dark backdrop-blur-md">
        <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand text-brand" />
        Cert
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

function parseBadgeFilterParam(value: string | null): BumicertBadgeFilter[] {
  if (!value) return [];
  const parsed = value.split(",").filter((item): item is BumicertBadgeFilter => BADGE_FILTER_KEYS.includes(item as BumicertBadgeFilter));
  return [...new Set(parsed)];
}

function serializeBadgeFilterParam(filters: BumicertBadgeFilter[]): string | null {
  return filters.length > 0 ? filters.join(",") : null;
}

function filterRecords(records: ExplorerRecord[], query: string): ExplorerRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  return records.filter((r) => haystack(r).includes(q));
}

function occurrenceCategoryLabel(category: OccurrenceCategory): string {
  return OCCURRENCE_CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? "Nature";
}

function occurrenceTaxonText(record: OccurrenceRecord): string {
  return [record.vernacularName, record.scientificName, record.family, record.genus, record.kingdom, record.basisOfRecord, record.remarks]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function occurrenceCategory(record: OccurrenceRecord): Exclude<OccurrenceCategory, "all"> | null {
  const text = occurrenceTaxonText(record);
  const kingdom = record.kingdom?.toLowerCase() ?? "";

  if (/\b(flower|flowers|bloom|blossom|orchid|rose|hibiscus|daisy|sunflower)\b/.test(text)) return "flowers";
  if (/\b(tree|trees|palm|oak|cedar|mahogany|mangrove|sapling|seedling)\b/.test(text)) return "trees";
  if (/\b(bird|birds|aves|parrot|hummingbird|toucan|tanager|flycatcher|antbird|thrush|owl|hawk|eagle)\b/.test(text)) return "birds";
  if (kingdom === "plantae" || /\b(plant|plants|flora|grass|fern|moss|shrub|vine)\b/.test(text)) return "plants";
  return null;
}

function filterOccurrenceCategory(records: OccurrenceRecord[], category: OccurrenceCategory): OccurrenceRecord[] {
  if (category === "all") return records;
  if (category === "plants") {
    return records.filter((record) => {
      const match = occurrenceCategory(record);
      return match === "plants" || match === "trees" || match === "flowers";
    });
  }
  return records.filter((record) => occurrenceCategory(record) === category);
}

// ── Sorting ──────────────────────────────────────────────────────────────
//
// Records arrive newest-first (createdAt DESC) from the indexer; this lets the
// visitor re-sort the already-loaded slice by timestamp or alphabetically.

function sortTimestamp(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Title used for alphabetical sort, per record kind. */
function sortKey(r: ExplorerRecord): string {
  if (r.kind === "occurrence") return occurrenceDisplayName(r).toLowerCase();
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
  icon: ReactNode;
  accent?: boolean;
};

function within(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= Date.now() - days * 86_400_000;
}

function computeOccurrenceTotalStats(stats: OccurrenceStats, records: ExplorerRecord[]): Stat[] {
  const occ = records as OccurrenceRecord[];
  const fallback = {
    totalSightings: occ.length,
    photoSightings: occ.filter((record) => record.media.includes("image") || Boolean(record.imageUrl || record.imageRef)).length,
    recentSightings: occ.filter((record) => within(record.createdAt, 30)).length,
    mappedSightings: occ.filter((record) => record.lat != null && record.lon != null).length,
  };
  const n = (value: number | null, fallbackValue: number) => formatCompact(value ?? fallbackValue);
  return [
    {
      label: stats.totalSightings == null ? "Loaded nature sightings" : "Nature sightings shared",
      value: n(stats.totalSightings, fallback.totalSightings),
      icon: <LayoutGridIcon />,
      accent: true,
    },
    {
      label: stats.photoSightings == null ? "Loaded sightings with photos" : "Sightings with photos",
      value: n(stats.photoSightings, fallback.photoSightings),
      icon: <ImageIcon />,
    },
    {
      label: "Sightings in last 30 days",
      value: n(stats.recentSightings, fallback.recentSightings),
      icon: <LeafIcon />,
      accent: true,
    },
    {
      label: "Locations across sightings",
      value: n(stats.mappedSightings, fallback.mappedSightings),
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
        label: "Loaded nature sightings",
        value: n(occ.length),
        icon: <LayoutGridIcon />,
        accent: true,
      },
      {
        label: "Sightings from last 30 days",
        value: n(last30),
        icon: <LeafIcon />,
      },
      {
        label: "Different plants and animals",
        value: n(species),
        icon: <LeafIcon />,
        accent: true,
      },
      {
        label: "Sightings with photos or sounds",
        value: n(withMedia),
        icon: <ImageIcon />,
      },
      {
        label: "Countries in these sightings",
        value: n(countries),
        icon: <MapIcon />,
      },
      {
        label: "Sightings from this week",
        value: n(last7),
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
      { label: "Loaded Certs", value: n(b.length), icon: <LayoutGridIcon />, accent: true },
      { label: "Certs from last 30 days", value: n(last30), icon: <LeafIcon /> },
      { label: "People named in loaded Certs", value: n(contributors), icon: <LeafIcon />, accent: true },
      { label: "Project places in loaded Certs", value: n(sites), icon: <MapIcon /> },
      { label: "Loaded Certs with pictures", value: n(withCover), icon: <ImageIcon /> },
      { label: "Certs from this week", value: n(last7), icon: <AudioLinesIcon /> },
    ];
  }

  if (kind === "project") {
    const p = records.filter((r): r is Extract<ExplorerRecord, { kind: "project" }> => r.kind === "project");
    const bumicerts = p.reduce((sum, record) => sum + record.bumicertCount, 0);
    const withImg = p.filter((record) => record.imageUrl).length;
    const withPlace = p.filter((record) => record.locationUri).length;
    return [
      { label: "Loaded projects", value: n(p.length), icon: <LayoutGridIcon />, accent: true },
      { label: "Projects from last 30 days", value: n(last30), icon: <LeafIcon /> },
      { label: "Certs in loaded projects", value: n(bumicerts), icon: <LeafIcon />, accent: true },
      { label: "Loaded projects with places", value: n(withPlace), icon: <MapIcon /> },
      { label: "Loaded projects with pictures", value: n(withImg), icon: <ImageIcon /> },
      { label: "Projects from this week", value: n(last7), icon: <AudioLinesIcon /> },
    ];
  }

  const s = records as SiteRecord[];
  const countries = new Set(s.map((r) => r.country).filter(Boolean)).size;
  const withImg = s.filter((r) => r.imageUrl).length;
  return [
    { label: "Loaded organization profiles", value: n(s.length), icon: <LayoutGridIcon />, accent: true },
    { label: "Profiles from last 30 days", value: n(last30), icon: <LeafIcon /> },
    { label: "Countries in loaded profiles", value: n(countries), icon: <MapIcon />, accent: true },
    { label: "Profiles with cover or logo", value: n(withImg), icon: <ImageIcon /> },
    { label: "Profiles from this week", value: n(last7), icon: <AudioLinesIcon /> },
  ];
}

function StatBand({ stats }: { stats: Stat[] }) {
  return (
    <StatsTileGrid
      columns={stats.length === 4 ? 4 : 6}
      items={stats.map((stat) => ({
        label: stat.label,
        value: stat.value,
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

function mediaLabel(kind: OccurrenceRecord["media"][number]): string {
  if (kind === "audio") return "Field sound";
  if (kind === "spectrogram") return "Sound view";
  if (kind === "image") return "Photo";
  if (kind === "video") return "Video";
  return kind;
}


function CardsGlyph() {
  return <LayoutGridIcon width={16} height={16} aria-hidden />;
}

function CompactCardsGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      {[1, 6, 11].flatMap((x) => [1, 6, 11].map((y) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx="0.8" stroke="currentColor" strokeWidth="1.4" />
      )))}
    </svg>
  );
}

function ListGlyph() {
  return <ListIcon width={16} height={16} aria-hidden />;
}

function MapGlyph() {
  return <MapIcon width={16} height={16} aria-hidden />;
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
