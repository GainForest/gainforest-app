"use client";

import Image from "next/image";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudSunIcon,
  DropletsIcon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  LayoutGridIcon,
  LeafIcon,
  Loader2Icon,
  ListIcon,
  MapIcon,
  MapPinIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SproutIcon,
  StarIcon,
  TreePineIcon,
  UsersRoundIcon,
} from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { BumicertOwnerAvatar } from "@/components/bumicert/BumicertOwnerAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AutoLoadMoreButton } from "../_components/AutoLoadMoreButton";
import { SortSection } from "../_components/AllFiltersPopover";
import { ProjectScopeTags } from "../_components/ProjectScopeTags";
import { ProjectEvidence } from "../_components/ProjectEvidence";
import { ProjectListItem, ProjectListHeader } from "../_components/ProjectListItem";
import { OwnerFilterBanner, OwnerFilterButton, useOwnerFilter } from "../_components/OwnerFilter";
import { RecordDrawer } from "../_components/RecordDrawer";
import { RecordMap } from "../_components/RecordMap";
import {
  enrichProjectsWithCardMeta,
  fetchProjectTotalCount,
  fetchProjects,
  type BumicertBadgeFilter,
  type ExplorerRecord,
  type ExplorerSortMode,
  type ProjectIndexFilter,
  type ProjectRecord,
} from "../_lib/indexer";
import { isPdsBlobUrl } from "../_lib/pds";
import { countryName, formatCompactUsd } from "../_lib/format";
import { useStableQueryView } from "../_lib/use-stable-query-view";
import { useViewer } from "../_lib/viewer";

const PROJECTS_PAGE_SIZE = 48;
const INITIAL_CARD_LIMIT = 96;
const CARD_BATCH_SIZE = 96;
// "donations" stays parseable so old shared links keep working (it means
// "either donation source"), but the UI only offers the two source chips.
const FILTER_KEYS: ProjectIndexFilter[] = ["images", "locations", "timeline", "donations", "donations-gainforest", "donations-maearth"];
const BADGE_FILTER_KEYS: BumicertBadgeFilter[] = ["gainforest", "maearth"];
const SORT_MODES: ExplorerSortMode[] = ["newest", "oldest", "az", "za"];
type ViewMode = "cards" | "list" | "map";
const VIEW_MODES: ViewMode[] = ["cards", "list", "map"];
type ProjectCategory = "all" | "forests" | "biodiversity" | "foodWater" | "communities" | "climate";
const CATEGORY_KEYS: ProjectCategory[] = ["all", "forests", "biodiversity", "foodWater", "communities", "climate"];
const CATEGORY_OPTIONS = [
  { key: "all", Icon: LeafIcon },
  { key: "forests", Icon: TreePineIcon },
  { key: "biodiversity", Icon: SproutIcon },
  { key: "foodWater", Icon: DropletsIcon },
  { key: "communities", Icon: UsersRoundIcon },
  { key: "climate", Icon: CloudSunIcon },
] as const;
const CATEGORY_TERMS: Record<Exclude<ProjectCategory, "all">, string[]> = {
  forests: ["forest", "tree", "reforestation", "agroforestry", "mangrove", "nursery"],
  biodiversity: ["biodiversity", "species", "wildlife", "habitat", "pollinator", "conservation", "monitoring"],
  foodWater: ["food", "farm", "agriculture", "agroecology", "water", "watershed", "soil", "wetland"],
  communities: ["community", "indigenous", "youth", "education", "livelihood", "stewardship", "commons"],
  climate: ["climate", "carbon", "energy", "resilience", "regeneration", "restoration", "biochar"],
};
const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;
const SEARCH_QUERY_STATE_OPTIONS = { ...QUERY_STATE_OPTIONS, throttleMs: 200 } as const;



type BadgeFilterOption = {
  key: BumicertBadgeFilter;
  label: string;
  logoSrc: string;
};

type ProjectDonationSummary = {
  acceptsDonations: boolean;
  totalUsd: number;
  donorCount: number;
  gainforest: { totalUsd: number; donorCount: number } | null;
  gainforestDonation: {
    organizationDid: string;
    rkey: string;
    minDonationInUSD: string | null;
    maxDonationInUSD: string | null;
  } | null;
  maEarth: { totalUsd: number; donorCount: number; donateUrl: string; rounds: number[] } | null;
};

type InitialProjectsPage = {
  records: ProjectRecord[];
  cursor: string | null;
  hasMore: boolean;
};

export function ProjectsExploreClient({
  initialPage,
  records: initialRecordsProp,
  initialFeaturedUris = [],
}: {
  initialPage?: InitialProjectsPage;
  records?: ProjectRecord[];
  initialFeaturedUris?: string[];
}) {
  const t = useTranslations("marketplace.projects");
  const exploreT = useTranslations("marketplace.explore");
  const filterChips = useMemo<Array<{ key: ProjectIndexFilter; label: string; predicate: (record: ProjectRecord) => boolean; hidden?: boolean }>>(() => [
    { key: "images", label: t("filters.images"), predicate: (record) => Boolean(record.imageUrl) },
    { key: "locations", label: t("filters.locations"), predicate: (record) => Boolean(record.locationUri) },
    { key: "timeline", label: t("filters.timeline"), predicate: (record) => (record.evidence?.timeline ?? 0) > 0 },
    { key: "donations-gainforest", label: t("filters.donationsGainforest"), predicate: (record) => record.donationSources?.gainforest === true },
    { key: "donations-maearth", label: t("filters.donationsMaearth"), predicate: (record) => record.donationSources?.maearth === true },
    // Legacy key from old shared links; not offered as a chip anymore.
    { key: "donations", label: t("filters.donations"), predicate: (record) => record.acceptsDonations === true, hidden: true },
  ], [t]);
  const badgeFilterOptions = useMemo<BadgeFilterOption[]>(() => [
    { key: "gainforest", label: exploreT("filters.badges.gainforest"), logoSrc: "/assets/media/images/gainforest-logo.svg" },
    { key: "maearth", label: exploreT("filters.badges.maearth"), logoSrc: "/assets/media/images/badges/ma-earth-logo.webp" },
  ], [exploreT]);
  const sortOptions = useMemo<Array<{ value: ExplorerSortMode; label: string }>>(() => [
    { value: "newest", label: t("sort.newest") },
    { value: "oldest", label: t("sort.oldest") },
    { value: "az", label: t("sort.az") },
    { value: "za", label: t("sort.za") },
  ], [t]);
  const viewOptions = useMemo(() => [
    { id: "cards", label: t("view.cards"), Icon: LayoutGridIcon },
    { id: "list", label: t("view.list"), Icon: ListIcon },
    { id: "map", label: t("view.map"), Icon: MapIcon },
  ] as const, [t]);
  const initialRecords = useMemo(() => initialPage?.records ?? initialRecordsProp ?? [], [initialPage, initialRecordsProp]);
  const [records, setRecords] = useState<ProjectRecord[]>(initialRecords);
  const [cursor, setCursor] = useState<string | null>(initialPage?.cursor ?? null);
  const [hasMore, setHasMore] = useState(initialPage?.hasMore ?? initialRecords.length === 0);
  const [loading, setLoading] = useState(!initialPage && initialRecords.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [cardLimit, setCardLimit] = useState(INITIAL_CARD_LIMIT);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);
  const [drawer, setDrawer] = useState<ProjectRecord | null>(null);
  const [donationSummaries, setDonationSummaries] = useState<Record<string, ProjectDonationSummary>>({});
  const [featuredUris, setFeaturedUris] = useState<string[]>(initialFeaturedUris);
  const [canManageFeatured, setCanManageFeatured] = useState(false);
  const [featureBusyUri, setFeatureBusyUri] = useState<string | null>(null);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const viewer = useViewer();
  const filtersMenuRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);
  const countSeqRef = useRef(0);
  const donationRequestKeyRef = useRef("");

  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions(SEARCH_QUERY_STATE_OPTIONS),
  );
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringEnum<ExplorerSortMode>(SORT_MODES).withDefault("newest").withOptions(QUERY_STATE_OPTIONS),
  );
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
  const [filtersParam, setFiltersParam] = useQueryState(
    "filters",
    parseAsString.withOptions(QUERY_STATE_OPTIONS),
  );
  const filters = useMemo(() => parseFilterParam(filtersParam), [filtersParam]);
  const [badgesParam, setBadgesParam] = useQueryState(
    "badges",
    parseAsString.withOptions(QUERY_STATE_OPTIONS),
  );
  const badgeFilters = useMemo(() => parseBadgeFilterParam(badgesParam), [badgesParam]);
  const [category, setCategory] = useQueryState(
    "category",
    parseAsStringEnum<ProjectCategory>(CATEGORY_KEYS).withDefault("all").withOptions(QUERY_STATE_OPTIONS),
  );
  const { ownerDid, setOwnerDid } = useOwnerFilter();
  const activeFilterCount = filters.length + badgeFilters.length + (category === "all" ? 0 : 1);
  const shouldUseInitialRecords = initialRecords.length > 0
    && !deferredQuery.trim()
    && filters.length === 0
    && badgeFilters.length === 0
    && sort === "newest"
    && !ownerDid;

  useEffect(() => {
    if (viewer.status !== "ready" || !viewer.sessionDid) return;
    const controller = new AbortController();
    fetch("/api/internal/featured-projects", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ uris?: string[]; canManage?: boolean }> : null)
      .then((data) => {
        if (!data || controller.signal.aborted) return;
        setCanManageFeatured(data.canManage === true);
        if (Array.isArray(data.uris)) setFeaturedUris(data.uris);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [viewer.sessionDid, viewer.status]);

  useEffect(() => {
    if (shouldUseInitialRecords) {
      setRecords(initialRecords);
      setCursor(initialPage?.cursor ?? null);
      setHasMore(initialPage?.hasMore ?? initialRecords.length === 0);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    const controller = new AbortController();
    const requestSeq = ++requestSeqRef.current;
    const options = { query: deferredQuery, filters, sort, featuredBadgesOnly: !ownerDid, badgeFilters, creatorDid: ownerDid };
    const isCurrent = () => requestSeqRef.current === requestSeq && !controller.signal.aborted;
    setLoading(true);
    setLoadingMore(false);
    setRecords([]);
    setCursor(null);
    setHasMore(true);
    fetchProjects(PROJECTS_PAGE_SIZE, null, controller.signal, undefined, options)
      .then((page) => {
        if (!isCurrent()) return;
        setRecords(page.records);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[projects] fetch failed", error);
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => controller.abort();
  }, [shouldUseInitialRecords, initialRecords, initialPage?.cursor, initialPage?.hasMore, deferredQuery, filters, sort, badgeFilters, ownerDid]);

  useEffect(() => {
    const controller = new AbortController();
    const requestSeq = ++countSeqRef.current;
    const isCurrent = () => countSeqRef.current === requestSeq && !controller.signal.aborted;
    setTotalCount(null);
    fetchProjectTotalCount(controller.signal, { query: deferredQuery, filters, sort, featuredBadgesOnly: !ownerDid, badgeFilters, creatorDid: ownerDid })
      .then((count) => {
        if (isCurrent()) setTotalCount(count);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[projects] count failed", error);
      });
    return () => controller.abort();
  }, [deferredQuery, filters, sort, badgeFilters, ownerDid]);

  useEffect(() => {
    setCardLimit(INITIAL_CARD_LIMIT);
  }, [deferredQuery, filters, badgeFilters, category, sort, view, ownerDid]);

  // Projects paint immediately without their scope tags / evidence badges; this
  // backfills that slower metadata for any records still missing it (a record's
  // `evidence` becoming defined is the terminal "enriched" signal, so this never
  // loops). New "load more" pages are picked up the same way.
  useEffect(() => {
    const pending = records.filter((record) => record.evidence === undefined);
    if (pending.length === 0) return;
    const controller = new AbortController();
    enrichProjectsWithCardMeta(pending, controller.signal)
      .then((enriched) => {
        if (controller.signal.aborted) return;
        const enrichedById = new Map(enriched.map((record) => [record.id, record]));
        setRecords((current) => current.map((record) => enrichedById.get(record.id) ?? record));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [records]);

  useEffect(() => {
    if (!openFilters) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (filtersMenuRef.current?.contains(event.target as Node)) return;
      setOpenFilters(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFilters(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openFilters]);

  const visibleRecords = useMemo(() => {
    return records
      .filter((record) => filters.every((key) => filterChips.find((chip) => chip.key === key)?.predicate(record)))
      .filter((record) => matchesProjectCategory(record, category))
      .toSorted((a, b) => compareProjects(a, b, sort));
  }, [records, filters, category, sort, filterChips]);
  const showExploreHome = view === "cards"
    && !deferredQuery.trim()
    && filters.length === 0
    && badgeFilters.length === 0
    && category === "all"
    && sort === "newest"
    && !ownerDid;
  const featuredRecords = useMemo(() => {
    const byUri = new Map(records.map((record) => [record.atUri, record]));
    return featuredUris.flatMap((uri) => {
      const record = byUri.get(uri);
      return record ? [record] : [];
    });
  }, [featuredUris, records]);
  const supportRecords = useMemo(() => {
    const featuredIds = new Set(featuredRecords.map((record) => record.id));
    return records.filter((record) => {
      const summary = donationSummaries[record.atUri];
      return !featuredIds.has(record.id) && Boolean(summary?.acceptsDonations || record.acceptsDonations);
    }).slice(0, 4);
  }, [donationSummaries, featuredRecords, records]);
  const renderedRecords = useMemo(
    () => (view === "map" ? visibleRecords : visibleRecords.slice(0, cardLimit)),
    [cardLimit, view, visibleRecords],
  );
  const hasMoreCardsToShow = view !== "map" && renderedRecords.length < visibleRecords.length;

  useEffect(() => {
    const candidates = renderedRecords.slice(0, 60).filter((record) => record.bumicertUris.length > 0);
    if (candidates.length === 0) return;
    const key = candidates.map((record) => `${record.atUri}:${record.bumicertUris.join("|")}`).join(";");
    if (donationRequestKeyRef.current === key) return;
    donationRequestKeyRef.current = key;

    const controller = new AbortController();
    fetch("/api/projects/donation-summaries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: candidates.map((record) => ({
          key: record.atUri,
          did: record.did,
          atUri: record.atUri,
          bumicertUris: record.bumicertUris,
        })),
      }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { summaries?: Record<string, ProjectDonationSummary> } | null) => {
        if (!data?.summaries || controller.signal.aborted) return;
        setDonationSummaries((current) => ({ ...current, ...data.summaries }));
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[projects] donation summaries failed", error);
      });
    return () => controller.abort();
  }, [renderedRecords]);

  const updateFilters = useCallback((nextFilters: ProjectIndexFilter[]) => {
    void setFiltersParam(serializeFilterParam(nextFilters));
  }, [setFiltersParam]);

  const toggleFilter = useCallback((key: ProjectIndexFilter) => {
    updateFilters(filters.includes(key) ? filters.filter((value) => value !== key) : [...filters, key]);
  }, [filters, updateFilters]);

  const updateBadgeFilters = useCallback((nextFilters: BumicertBadgeFilter[]) => {
    void setBadgesParam(serializeBadgeFilterParam(nextFilters));
  }, [setBadgesParam]);

  const toggleBadgeFilter = useCallback((key: BumicertBadgeFilter) => {
    updateBadgeFilters(badgeFilters.includes(key) ? badgeFilters.filter((value) => value !== key) : [...badgeFilters, key]);
  }, [badgeFilters, updateBadgeFilters]);

  const clearFilters = useCallback(() => {
    updateFilters([]);
    updateBadgeFilters([]);
    void setCategory("all");
  }, [setCategory, updateFilters, updateBadgeFilters]);

  const openRecord = useCallback((record: ProjectRecord) => setDrawer(record), []);
  const toggleFeatured = useCallback(async (record: ProjectRecord) => {
    if (!canManageFeatured || featureBusyUri) return;
    const wasFeatured = featuredUris.includes(record.atUri);
    setFeatureBusyUri(record.atUri);
    setFeatureError(null);
    try {
      const response = await fetch("/api/internal/featured-projects", {
        method: wasFeatured ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uri: record.atUri }),
      });
      const data = (await response.json().catch(() => null)) as { uris?: string[]; error?: string } | null;
      if (!response.ok) throw new Error("update");
      if (Array.isArray(data?.uris)) setFeaturedUris(data.uris);
      else setFeaturedUris((current) => wasFeatured ? current.filter((uri) => uri !== record.atUri) : [record.atUri, ...current]);
    } catch {
      setFeatureError(t("featured.manage.error"));
    } finally {
      setFeatureBusyUri(null);
    }
  }, [canManageFeatured, featureBusyUri, featuredUris, t]);
  const openMapRecord = useCallback((record: ExplorerRecord) => {
    if (record.kind === "project") setDrawer(record);
  }, []);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const controller = new AbortController();
    const requestSeq = ++requestSeqRef.current;
    const base = records;
    const isCurrent = () => requestSeqRef.current === requestSeq && !controller.signal.aborted;
    setLoadingMore(true);
    fetchProjects(PROJECTS_PAGE_SIZE, cursor, controller.signal, undefined, { query: deferredQuery, filters, sort, featuredBadgesOnly: !ownerDid, badgeFilters, creatorDid: ownerDid })
      .then((page) => {
        if (!isCurrent()) return;
        setRecords(mergeProjectRecords(base, page.records));
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[projects] load more failed", error);
      })
      .finally(() => {
        if (isCurrent()) setLoadingMore(false);
      });
  }, [cursor, deferredQuery, filters, badgeFilters, hasMore, loading, loadingMore, records, sort, ownerDid]);

  return (
    <>
      <section className="-mt-14 pb-20 md:pb-28">
        <div className="relative isolate min-h-[240px] overflow-hidden">
          <HeroBackdrop />
          <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-8 pb-8 pt-[64px] sm:px-10 lg:px-9 animate-in">
            <h1
              className="max-w-4xl text-4xl font-light leading-[0.98] tracking-[-0.035em] text-foreground sm:text-5xl md:text-5xl lg:text-6xl"
              style={{ fontFamily: "var(--font-garamond-var)" }}
            >
              {t("hero.title")}{" "}
              <span className="whitespace-nowrap text-foreground/85" style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}>
                {t("hero.accent")}
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-base">{t("hero.description")}</p>
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <div className="relative z-20 mt-5 space-y-3">
            <div className="relative z-30 flex items-center gap-3 animate-in" style={{ animationDelay: "80ms" }}>
              <div className="group/input-group border-input relative flex h-10 min-w-0 flex-1 items-center rounded-full border bg-background/50 shadow-xs backdrop-blur transition-[color,box-shadow] outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                <SearchIcon className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => void setQuery(event.target.value)}
                  aria-label={t("search.ariaLabel")}
                  placeholder={t("search.placeholder")}
                  className="min-w-0 flex-1 truncate border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>

              <div className="hidden h-10 shrink-0 items-center rounded-full border border-border bg-background/50 p-0.5 backdrop-blur sm:inline-flex">
                {viewOptions.map((option) => (
                  <button key={option.id} type="button" onClick={() => void setView(option.id)} aria-pressed={view === option.id} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors", view === option.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <option.Icon className="h-3.5 w-3.5" aria-hidden />
                    {option.label}
                  </button>
                ))}
              </div>
              <OwnerFilterButton ownerDid={ownerDid} onChange={setOwnerDid} />
            </div>

            <div className="relative z-20 flex items-center justify-between gap-3 sm:justify-end">
              <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background/50 p-0.5 backdrop-blur sm:hidden">
                {viewOptions.map((option) => (
                  <button key={option.id} type="button" onClick={() => void setView(option.id)} aria-pressed={view === option.id} aria-label={option.label} title={option.label} className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full", view === option.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <option.Icon className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ))}
              </div>

              <div ref={filtersMenuRef} className="relative shrink-0">
                <Button type="button" onClick={() => setOpenFilters((value) => !value)} aria-haspopup="true" aria-expanded={openFilters} variant={openFilters || activeFilterCount > 0 ? "default" : "outline"} size="sm" className="h-10 text-sm">
                  <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                  <span>{t("filters.allFilters")}</span>
                  {activeFilterCount > 0 ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] text-primary">{activeFilterCount}</span> : null}
                </Button>

                {openFilters ? (
                  <div aria-label={t("filters.allFilters")} className="quick-popover-in absolute right-0 top-full z-[1000] mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-primary/20 bg-popover p-4 shadow-[0_18px_45px_color-mix(in_oklab,var(--primary)_16%,transparent)]">
                    <div className="mb-3">
                      <h2 className="text-base font-medium text-foreground">{t("filters.allFilters")}</h2>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("filters.description")}</p>
                    </div>
                    <div className="mb-3"><SortSection label={exploreT("filters.sortLabel")} options={sortOptions} value={sort} onChange={(value) => void setSort(value)} /></div>
                    <div className="flex flex-wrap gap-2 border-t border-primary/15 pt-3">
                      {badgeFilterOptions.map((badge) => <BadgeFilterButton key={badge.key} badge={badge} selected={badgeFilters.includes(badge.key)} onClick={() => toggleBadgeFilter(badge.key)} />)}
                      {filterChips.filter((chip) => !chip.hidden).map((chip) => (
                        <Button key={chip.key} type="button" aria-pressed={filters.includes(chip.key)} onClick={() => toggleFilter(chip.key)} variant={filters.includes(chip.key) ? "default" : "outline"} size="sm" className="h-10 text-sm">{chip.label}</Button>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-primary/15 pt-3">
                      <p className="text-xs text-accent-foreground/75">{t("filters.updateHint")}</p>
                      <Button type="button" onClick={clearFilters} variant="ghost" size="sm">{t("actions.clearAll")}</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {ownerDid ? <div className="mt-4"><OwnerFilterBanner ownerDid={ownerDid} onClear={() => setOwnerDid(null)} /></div> : null}
          {featureError ? <p aria-live="polite" className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{featureError}</p> : null}

          <section aria-labelledby="project-categories-heading" className="mt-8 rounded-[1.75rem] border border-border/70 bg-card p-4 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-2 px-1 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t("categories.eyebrow")}</p>
                <h2 id="project-categories-heading" className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("categories.title")}</h2>
              </div>
              <p className="max-w-md text-sm text-muted-foreground">{t("categories.description")}</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {CATEGORY_OPTIONS.map(({ key, Icon }) => {
                const selected = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => void setCategory(key)}
                    className={cn(
                      "group flex min-h-24 flex-col items-start justify-between rounded-2xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md",
                      selected ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-border/70 bg-background/65 text-foreground",
                    )}
                  >
                    <span className={cn("grid h-9 w-9 place-items-center rounded-xl", selected ? "bg-primary-foreground/15" : "bg-primary/10 text-primary")}>
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="mt-3 text-sm font-semibold leading-tight">{t(`categories.items.${key}`)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {showExploreHome && featuredRecords.length > 0 ? (
            <FeaturedProjects records={featuredRecords} onOpen={openRecord} />
          ) : null}

          {showExploreHome && supportRecords.length > 0 ? (
            <SupportShelf records={supportRecords} onOpen={openRecord} donationSummaries={donationSummaries} />
          ) : null}

          <section aria-labelledby="project-catalog-heading" className="mt-14 sm:mt-16">
            <div className="border-b border-border/70 pb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t("catalog.eyebrow")}</p>
              <h2 id="project-catalog-heading" className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{category === "all" ? t("catalog.title") : t(`categories.items.${category}`)}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{totalCount !== null && category === "all" ? t("catalog.count", { count: totalCount }) : t("catalog.description")}</p>
            </div>

            <div className="mt-5">
              {view === "map" ? (
                <RecordMap records={visibleRecords} kind="project" onOpen={openMapRecord} />
              ) : view === "list" ? (
                <ProjectList records={renderedRecords} loading={loading} onOpen={openRecord} donationSummaries={donationSummaries} />
              ) : (
                <ProjectGrid
                  records={renderedRecords}
                  loading={loading}
                  onOpen={openRecord}
                  onFilterOwner={setOwnerDid}
                  donationSummaries={donationSummaries}
                  canManageFeatured={canManageFeatured}
                  featuredUris={featuredUris}
                  featureBusyUri={featureBusyUri}
                  onToggleFeatured={toggleFeatured}
                />
              )}
            </div>
          </section>

          {records.length > 0 ? (
            <div className="mt-10 flex flex-col items-center gap-3">
              {totalCount !== null && category === "all" ? <p className="text-sm text-muted-foreground">{t("footer.showing", { shown: visibleRecords.length, total: totalCount })}</p> : null}
              {hasMoreCardsToShow ? (
                <button type="button" onClick={() => setCardLimit((current) => current + CARD_BATCH_SIZE)} className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                  {t("footer.showMore")}
                </button>
              ) : hasMore ? (
                <AutoLoadMoreButton hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} autoLoad={autoLoadMore} onAutoLoadChange={setAutoLoadMore} idleLabel={t("footer.showMore")} loadingLabel={t("footer.showMore")} endLabel={t("footer.end")} className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60" />
              ) : (
                <span className="text-sm italic text-muted-foreground">{t("footer.end")}</span>
              )}
            </div>
          ) : null}
        </div>
      </section>
      <RecordDrawer record={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

function HeroBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <Image
        src="/images/explore/explore-hero-light@2x.webp"
        alt=""
        fill
        priority
        quality={95}
        sizes="(min-width: 768px) calc(100vw - 15rem), 100vw"
        className="object-cover object-center dark:hidden"
      />
      <Image
        src="/images/explore/explore-hero-dark@2x.webp"
        alt=""
        fill
        priority
        quality={95}
        sizes="(min-width: 768px) calc(100vw - 15rem), 100vw"
        className="hidden object-cover object-center dark:block"
      />
      <div className="absolute inset-0 bg-linear-to-r from-background/92 via-background/55 to-background/5 dark:from-background/78 dark:via-background/42 dark:to-background/0" />
      <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-background/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-b from-transparent via-background/70 to-background" />
    </div>
  );
}

function FeaturedProjects({ records, onOpen }: { records: ProjectRecord[]; onOpen: (record: ProjectRecord) => void }) {
  const t = useTranslations("marketplace.projects.featured");
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const isCarousel = records.length > 3;
  const scrollCarousel = (direction: -1 | 1) => {
    const node = carouselRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <section aria-labelledby="featured-projects-heading" className="mt-14 sm:mt-16">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t("eyebrow")}</p>
          <h2 id="featured-projects-heading" className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t("title")}</h2>
        </div>
        <div className="flex items-end gap-3">
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{t("description")}</p>
          {isCarousel ? (
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => scrollCarousel(-1)} aria-label={t("previous")} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-foreground transition hover:border-primary/30 hover:text-primary">
                <ChevronLeftIcon className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={() => scrollCarousel(1)} aria-label={t("next")} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-foreground transition hover:border-primary/30 hover:text-primary">
                <ChevronRightIcon className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div
        ref={carouselRef}
        className={cn(
          isCarousel
            ? "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "grid gap-4 md:grid-cols-3",
        )}
      >
        {records.map((record) => (
          <FeaturedProjectCard
            key={record.id}
            record={record}
            onOpen={onOpen}
            className={isCarousel ? "w-[86%] shrink-0 snap-start sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]" : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function FeaturedProjectCard({ record, onOpen, className }: { record: ProjectRecord; onOpen: (record: ProjectRecord) => void; className?: string }) {
  const t = useTranslations("marketplace.projects.featured");
  const cardT = useTranslations("marketplace.projects.card");
  const [imgError, setImgError] = useState(false);
  const place = countryName(record.country);
  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      aria-label={cardT("open", { title: record.title })}
      className={cn(
        "group flex h-full min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-border/70 bg-card text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        className,
      )}
    >
      <span className="relative block aspect-[16/8] w-full overflow-hidden bg-muted">
        {record.imageUrl && !imgError ? (
          <Image src={record.imageUrl} alt="" fill sizes="(min-width: 768px) 33vw, 86vw" unoptimized={!isPdsBlobUrl(record.imageUrl)} onError={() => setImgError(true)} className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
        ) : (
          <span className="grid h-full place-items-center bg-primary/8 text-primary/40"><FolderKanbanIcon className="h-10 w-10" aria-hidden /></span>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/92 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur">
          <LeafIcon className="h-3.5 w-3.5" aria-hidden />
          {t("badge")}
        </span>
      </span>

      <span className="flex flex-1 flex-col p-4">
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          {place ? <span className="inline-flex items-center gap-1"><MapPinIcon className="h-3.5 w-3.5" aria-hidden />{place}</span> : null}
          {record.creatorName ? <span className="truncate">{record.creatorName}</span> : null}
        </span>
        <span className="mt-2 line-clamp-2 font-instrument text-2xl italic leading-tight text-foreground">{record.title}</span>
        {record.shortDescription ? <span className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{record.shortDescription}</span> : null}
        <span className="mt-auto inline-flex items-center gap-2 pt-4 text-sm font-semibold text-primary">
          {t("action")} <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </span>
      </span>
    </button>
  );
}

function SupportShelf({ records, onOpen, donationSummaries }: { records: ProjectRecord[]; onOpen: (record: ProjectRecord) => void; donationSummaries: Record<string, ProjectDonationSummary> }) {
  const t = useTranslations("marketplace.projects.support");
  return (
    <section aria-labelledby="support-projects-heading" className="mt-14 rounded-[2rem] bg-primary/[0.06] px-4 py-7 sm:mt-16 sm:px-7 sm:py-9">
      <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><HeartHandshakeIcon className="h-4 w-4" aria-hidden />{t("eyebrow")}</p>
          <h2 id="support-projects-heading" className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{t("title")}</h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{t("description")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {records.map((record) => (
          <SupportProjectCard key={record.id} record={record} onOpen={onOpen} donationSummary={donationSummaries[record.atUri]} />
        ))}
      </div>
    </section>
  );
}

function SupportProjectCard({
  record,
  onOpen,
  donationSummary,
}: {
  record: ProjectRecord;
  onOpen: (record: ProjectRecord) => void;
  donationSummary?: ProjectDonationSummary;
}) {
  const t = useTranslations("marketplace.projects.card");
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;
  const totalUsd = donationSummary?.totalUsd ?? 0;
  const donorCount = donationSummary?.donorCount ?? 0;
  const place = countryName(record.country);

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      aria-label={t("open", { title: record.title })}
      className="group grid min-h-44 grid-cols-[8.5rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:grid-cols-[11rem_minmax(0,1fr)]"
    >
      <span className="relative min-h-44 overflow-hidden bg-muted">
        {hasImage ? (
          <Image
            src={record.imageUrl!}
            alt=""
            fill
            sizes="176px"
            unoptimized={!isPdsBlobUrl(record.imageUrl)}
            onError={() => setImgError(true)}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full place-items-center bg-primary/8 text-primary/45">
            <FolderKanbanIcon className="h-8 w-8" aria-hidden />
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-col justify-between p-4">
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{record.creatorName ?? t("projectSteward")}</span>
            {place ? <><span aria-hidden>·</span><span className="truncate">{place}</span></> : null}
          </span>
          <span className="mt-2 line-clamp-2 font-instrument text-2xl italic leading-tight text-foreground">{record.title}</span>
          {record.shortDescription ? <span className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{record.shortDescription}</span> : null}
        </span>

        <span className="mt-3 flex items-end justify-between gap-3 border-t border-border/60 pt-3">
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {totalUsd > 0 && donorCount > 0 ? (
              <><strong className="font-semibold text-foreground">{formatCompactUsd(totalUsd)}</strong> {t("byDonors", { donors: donorCount })}</>
            ) : t("openForSupport")}
          </span>
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" aria-hidden />
        </span>
      </span>
    </button>
  );
}

const ProjectGrid = memo(function ProjectGrid({
  records,
  loading,
  onOpen,
  onFilterOwner,
  donationSummaries = {},
  canManageFeatured = false,
  featuredUris = [],
  featureBusyUri = null,
  onToggleFeatured,
}: {
  records: ProjectRecord[];
  loading: boolean;
  onOpen: (record: ProjectRecord) => void;
  onFilterOwner?: (did: string) => void;
  donationSummaries?: Record<string, ProjectDonationSummary>;
  canManageFeatured?: boolean;
  featuredUris?: string[];
  featureBusyUri?: string | null;
  onToggleFeatured?: (record: ProjectRecord) => void;
}) {
  const t = useTranslations("marketplace.projects");
  if (loading && records.length === 0) return <ProjectGridSkeleton />;

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-28 text-center animate-in">
        <span className="mb-4 text-7xl font-light tracking-tight text-primary/15 md:text-8xl" style={{ fontFamily: "var(--font-garamond-var)" }}>
          0
        </span>
        <div className="mb-3 flex items-center gap-2">
          <SearchIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">{t("empty.eyebrow")}</span>
        </div>
        <h3 className="mb-3 text-2xl font-light text-foreground md:text-3xl" style={{ fontFamily: "var(--font-garamond-var)" }}>
          {t("empty.title")}
        </h3>
        <p className="max-w-md text-base leading-relaxed text-foreground/80" style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}>
          {t("empty.description")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 grid grid-cols-1 items-stretch gap-5 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] lg:gap-6">
      {records.map((record, index) => (
        <ProjectCard
          key={record.id}
          record={record}
          priority={index < 6}
          index={index}
          onOpen={onOpen}
          onFilterOwner={onFilterOwner}
          donationSummary={donationSummaries[record.atUri]}
          canManageFeatured={canManageFeatured}
          featured={featuredUris.includes(record.atUri)}
          featureBusy={featureBusyUri === record.atUri}
          onToggleFeatured={onToggleFeatured}
        />
      ))}
    </div>
  );
});

const ProjectList = memo(function ProjectList({
  records,
  loading,
  onOpen,
  donationSummaries = {},
}: {
  records: ProjectRecord[];
  loading: boolean;
  onOpen: (record: ProjectRecord) => void;
  donationSummaries?: Record<string, ProjectDonationSummary>;
}) {
  if (loading && records.length === 0) return <ProjectGridSkeleton />;
  if (records.length === 0) return <ProjectGrid records={records} loading={loading} onOpen={onOpen} donationSummaries={donationSummaries} />;

  return (
    <div className="mt-4">
      <ProjectListHeader />
      <ul role="list" className="border-t border-border">
        {records.map((record, index) => (
          <li key={record.id} className="relative animate-in after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-border last:after:hidden sm:after:inset-x-3" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
            <ProjectListItem record={record} onOpen={onOpen} priority={index < 8} donationSummary={donationSummaries[record.atUri]} />
          </li>
        ))}
      </ul>
    </div>
  );
});

function ProjectGridSkeleton() {
  const t = useTranslations("marketplace.projects.card");
  return (
    <div className="mt-5 grid grid-cols-1 items-stretch gap-5 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] lg:gap-6" aria-label={t("loading")}>
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-3xl border border-border bg-card">
          <Skeleton className="aspect-[16/10] rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-3/4 rounded-full" />
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-2/3 rounded-full" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-20 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectCard({
  record,
  priority,
  index,
  onOpen,
  onFilterOwner,
  donationSummary,
  canManageFeatured = false,
  featured = false,
  featureBusy = false,
  onToggleFeatured,
}: {
  record: ProjectRecord;
  priority: boolean;
  index: number;
  onOpen: (record: ProjectRecord) => void;
  onFilterOwner?: (did: string) => void;
  donationSummary?: ProjectDonationSummary;
  canManageFeatured?: boolean;
  featured?: boolean;
  featureBusy?: boolean;
  onToggleFeatured?: (record: ProjectRecord) => void;
}) {
  const t = useTranslations("marketplace.projects.card");
  const ownerFilterT = useTranslations("marketplace.ownerFilter");
  const featuredT = useTranslations("marketplace.projects.featured.manage");
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;
  const ownerName = record.creatorName ?? t("projectSteward");
  const canFilterOwner = Boolean(onFilterOwner) && Boolean(record.did);
  const place = countryName(record.country);
  const maEarthRounds = donationSummary?.maEarth?.rounds ?? [];
  const acceptsGainForestDonations = Boolean(
    donationSummary?.gainforestDonation || record.donationSources?.gainforest,
  );

  return (
    <button type="button" onClick={() => onOpen(record)} className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 animate-in" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {hasImage ? (
          <Image
            src={record.imageUrl!}
            alt={record.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
            priority={priority}
            fetchPriority={priority ? "high" : "auto"}
            unoptimized={!isPdsBlobUrl(record.imageUrl)}
            onError={() => setImgError(true)}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center bg-primary/8 text-primary/50">
            <FolderKanbanIcon className="h-12 w-12" />
          </div>
        )}
        {acceptsGainForestDonations ? (
          <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-background/85 py-1 pl-1.5 pr-3 text-xs font-semibold text-foreground shadow-lg backdrop-blur-lg">
            <Image src="/assets/media/images/gainforest-logo.svg" width={16} height={16} alt="" className="h-4 w-4 shrink-0 object-contain" />
            {t("gainforestBadge")}
          </span>
        ) : null}
        {maEarthRounds.length > 0 ? (
          <span className={`absolute right-3 z-10 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background shadow-lg ${acceptsGainForestDonations ? "bottom-3" : "top-3"}`}>
            {t("round", { round: maEarthRounds[maEarthRounds.length - 1]! })}
          </span>
        ) : !acceptsGainForestDonations && (donationSummary?.acceptsDonations || record.acceptsDonations) ? (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-lg">
            {t("donate")}
          </span>
        ) : null}
        {canManageFeatured ? (
          <span
            role="button"
            tabIndex={featureBusy ? -1 : 0}
            aria-pressed={featured}
            aria-disabled={featureBusy}
            aria-label={featured ? featuredT("remove") : featuredT("add")}
            title={featured ? featuredT("remove") : featuredT("add")}
            onClick={(event) => {
              event.stopPropagation();
              if (!featureBusy) onToggleFeatured?.(record);
            }}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !featureBusy) {
                event.preventDefault();
                event.stopPropagation();
                onToggleFeatured?.(record);
              }
            }}
            className={cn(
              "absolute bottom-3 left-3 z-20 grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-white/35 bg-background/90 text-muted-foreground shadow-lg backdrop-blur transition hover:scale-105 hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              featured && "border-amber-300 bg-amber-50 text-amber-500 dark:bg-amber-950",
              featureBusy && "cursor-wait opacity-70",
            )}
          >
            {featureBusy ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden /> : <StarIcon className={cn("h-4.5 w-4.5", featured && "fill-current")} aria-hidden />}
          </span>
        ) : null}
        <span
          {...(canFilterOwner
            ? {
                role: "button" as const,
                tabIndex: 0,
                "aria-label": ownerFilterT("filterByThis"),
                title: ownerFilterT("filterByThis"),
                onClick: (event: ReactMouseEvent) => {
                  event.stopPropagation();
                  onFilterOwner?.(record.did);
                },
                onKeyDown: (event: ReactKeyboardEvent) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onFilterOwner?.(record.did);
                  }
                },
              }
            : {})}
          className={cn(
            "absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 overflow-hidden rounded-full bg-background/75 p-1 pr-3 shadow-lg backdrop-blur-lg",
            canFilterOwner && "cursor-pointer transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          )}
        >
          <BumicertOwnerAvatar did={record.did} avatarRef={record.creatorAvatarRef} label={ownerName} className="h-7 w-7 shrink-0 shadow-sm" />
          <span className="min-w-0 truncate text-xs font-medium text-foreground">
            {ownerName}
          </span>
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex-1">
          <h2 className="line-clamp-2 font-instrument text-2xl italic leading-tight text-foreground">{record.title}</h2>
          {record.shortDescription ? (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{record.shortDescription}</p>
          ) : null}
        </div>

        {(record.scopeTags?.length ?? 0) > 0 || place || record.evidence ? (
          <div className="mt-4 space-y-2 border-t border-border/70 pt-3">
            {(record.scopeTags?.length ?? 0) > 0 || place ? (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <ProjectScopeTags tags={record.scopeTags ?? []} />
                {place ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                    <MapPinIcon className="h-3.5 w-3.5" />
                    {place}
                  </span>
                ) : null}
              </div>
            ) : null}
            <ProjectEvidence evidence={record.evidence} />
          </div>
        ) : null}

        <ProjectDonationMini summary={donationSummary} acceptsDonations={record.acceptsDonations === true} />
      </div>
    </button>
  );
}

/**
 * Ma Earth-style donation line: a quiet single line with the amount in bold
 * and the donor count muted. No progress bar — projects here have no funding
 * goal, so a bar length would be arbitrary decoration pretending to be data.
 */
function ProjectDonationMini({ summary, acceptsDonations }: { summary?: ProjectDonationSummary; acceptsDonations: boolean }) {
  const t = useTranslations("marketplace.projects.card");
  if (!summary && !acceptsDonations) return null;
  const totalUsd = summary?.totalUsd ?? 0;
  const donorCount = summary?.donorCount ?? 0;
  const hasAmount = totalUsd > 0 && donorCount > 0;

  return (
    <p className="mt-4 flex min-w-0 items-baseline gap-1.5 text-sm">
      {hasAmount ? (
        <>
          <span className="shrink-0 font-semibold text-foreground">{formatCompactUsd(totalUsd)}</span>
          <span className="truncate text-muted-foreground">{t("byDonors", { donors: donorCount })}</span>
        </>
      ) : (
        <span className="truncate text-muted-foreground">{t("openForSupport")}</span>
      )}
    </p>
  );
}

function BadgeFilterButton({ badge, selected, onClick }: { badge: BadgeFilterOption; selected: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant={selected ? "default" : "outline"}
      size="sm"
      className="h-10 gap-2 text-sm"
      aria-pressed={selected}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background/80">
        <Image src={badge.logoSrc} width={20} height={20} alt="" className="h-5 w-5 object-contain" />
      </span>
      {badge.label}
    </Button>
  );
}

function matchesProjectCategory(record: ProjectRecord, category: ProjectCategory): boolean {
  if (category === "all") return true;
  const searchable = [record.title, record.shortDescription, ...(record.scopeTags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return CATEGORY_TERMS[category].some((term) => searchable.includes(term));
}

function compareProjects(a: ProjectRecord, b: ProjectRecord, sort: ExplorerSortMode): number {
  switch (sort) {
    case "oldest":
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    case "az":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    case "za":
      return b.title.localeCompare(a.title, undefined, { sensitivity: "base" });
    case "newest":
    default:
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  }
}

function parseFilterParam(value: string | null): ProjectIndexFilter[] {
  if (value === null) return [];
  if (value === "none") return [];
  const parsed = value.split(",").filter((item): item is ProjectIndexFilter => FILTER_KEYS.includes(item as ProjectIndexFilter));
  return [...new Set(parsed)];
}

function serializeFilterParam(filters: ProjectIndexFilter[]): string | null {
  return filters.length > 0 ? filters.join(",") : null;
}

function parseBadgeFilterParam(value: string | null): BumicertBadgeFilter[] {
  if (!value) return [];
  const parsed = value.split(",").filter((item): item is BumicertBadgeFilter => BADGE_FILTER_KEYS.includes(item as BumicertBadgeFilter));
  return [...new Set(parsed)];
}

function serializeBadgeFilterParam(filters: BumicertBadgeFilter[]): string | null {
  return filters.length > 0 ? filters.join(",") : null;
}

function mergeProjectRecords(base: ProjectRecord[], incoming: ProjectRecord[]): ProjectRecord[] {
  const seen = new Set(base.map((record) => record.id));
  return [...base, ...incoming.filter((record) => !seen.has(record.id))];
}

