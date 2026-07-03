"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDownIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LayoutGridIcon,
  LeafIcon,
  ListIcon,
  MapIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { AutoLoadMoreButton } from "../_components/AutoLoadMoreButton";
import { SourceFiltersPopover } from "../_components/SourceFiltersPopover";
import { RecordDrawer } from "../_components/RecordDrawer";
import { RecordMap } from "../_components/RecordMap";
import { TrustedByBadges } from "../_components/TrustedByBadges";
import {
  fetchCertifiedLocationCountriesByUri,
  fetchSiteTotalCount,
  fetchSites,
  type BumicertBadgeFilter,
  type ExplorerRecord,
  type SiteRecord,
} from "../_lib/indexer";
import { countryFlag } from "../_lib/format";
import { useStableQueryView } from "../_lib/use-stable-query-view";

type SortMode = "newest" | "oldest" | "az" | "za";
type ViewMode = "cards" | "list" | "map";
type QuickFilter = "observations";

const SORT_MODES: SortMode[] = ["newest", "oldest", "az", "za"];
const VIEW_MODES: ViewMode[] = ["cards", "list", "map"];
const QUICK_FILTERS: QuickFilter[] = ["observations"];
const BADGE_FILTER_KEYS: BumicertBadgeFilter[] = ["gainforest", "maearth"];
const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;
const SEARCH_QUERY_STATE_OPTIONS = { ...QUERY_STATE_OPTIONS, throttleMs: 200 } as const;

const SORT_OPTION_VALUES: SortMode[] = ["newest", "oldest", "az", "za"];
const QUICK_CHIP_VALUES: QuickFilter[] = ["observations"];

const ORGANIZATIONS_PAGE_SIZE = 24;
const INITIAL_CARD_LIMIT = 96;
const CARD_BATCH_SIZE = 96;

type BadgeFilterOption = {
  key: BumicertBadgeFilter;
  label: string;
  logoSrc: string;
};

export function OrganizationsClient({ records: initialRecords = [] }: { records?: SiteRecord[] }) {
  const t = useTranslations("marketplace.organizations");
  const exploreT = useTranslations("marketplace.explore");
  const locale = useLocale();
  const [records, setRecords] = useState<SiteRecord[]>(initialRecords);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialRecords.length === 0);
  const [loading, setLoading] = useState(initialRecords.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions(SEARCH_QUERY_STATE_OPTIONS),
  );
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringEnum<SortMode>(SORT_MODES).withDefault("newest").withOptions(QUERY_STATE_OPTIONS),
  );
  const [countryFilter, setCountryFilter] = useQueryState(
    "country",
    parseAsString.withOptions(QUERY_STATE_OPTIONS),
  );
  const [typeFilter, setTypeFilter] = useQueryState(
    "category",
    parseAsString.withOptions(QUERY_STATE_OPTIONS),
  );
  const [quickFiltersParam, setQuickFiltersParam] = useQueryState(
    "quick",
    parseAsString.withOptions(QUERY_STATE_OPTIONS),
  );
  const quickFilters = useMemo(() => parseQuickFiltersParam(quickFiltersParam), [quickFiltersParam]);
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
  const [openDropdown, setOpenDropdown] = useState(false);
  const [drawer, setDrawer] = useState<SiteRecord | null>(null);
  const [cardLimit, setCardLimit] = useState(INITIAL_CARD_LIMIT);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const requestSeqRef = useRef(0);
  const countSeqRef = useRef(0);
  const countryHydrationKeyRef = useRef("");
  const badgeFilterOptions = useMemo<BadgeFilterOption[]>(() => [
    { key: "gainforest", label: exploreT("filters.badges.gainforest"), logoSrc: "/assets/media/images/gainforest-logo.svg" },
    { key: "maearth", label: exploreT("filters.badges.maearth"), logoSrc: "/assets/media/images/badges/ma-earth-logo.webp" },
  ], [exploreT]);

  useEffect(() => {
    if (initialRecords.length > 0) return;
    const controller = new AbortController();
    const requestSeq = ++requestSeqRef.current;
    const isCurrent = () => requestSeqRef.current === requestSeq && !controller.signal.aborted;
    const options = { query: deferredQuery, country: countryFilter, orgType: typeFilter, quickFilters, sort, featuredBadgesOnly: true, badgeFilters };
    setLoading(true);
    setLoadingMore(false);
    setRecords([]);
    setCursor(null);
    setHasMore(true);
    fetchSites(ORGANIZATIONS_PAGE_SIZE, null, controller.signal, undefined, "both", options)
      .then((page) => {
        if (!isCurrent()) return;
        setRecords(page.records);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[organizations] fetch failed", error);
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => controller.abort();
  }, [countryFilter, deferredQuery, initialRecords.length, quickFilters, sort, typeFilter, badgeFilters]);

  useEffect(() => {
    const controller = new AbortController();
    const requestSeq = ++countSeqRef.current;
    const isCurrent = () => countSeqRef.current === requestSeq && !controller.signal.aborted;
    setTotalCount(null);
    fetchSiteTotalCount(controller.signal, { query: deferredQuery, country: countryFilter, orgType: typeFilter, quickFilters, sort, featuredBadgesOnly: true, badgeFilters })
      .then((count) => {
        if (isCurrent()) setTotalCount(count);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[organizations] count failed", error);
      });
    return () => controller.abort();
  }, [countryFilter, deferredQuery, quickFilters, sort, typeFilter, badgeFilters]);

  useEffect(() => {
    const missing = records
      .filter((record) => !record.country && record.locationUri)
      .map((record) => record.locationUri!);
    if (missing.length === 0) return;

    const key = Array.from(new Set(missing)).sort().join("|");
    if (countryHydrationKeyRef.current === key) return;
    countryHydrationKeyRef.current = key;

    const controller = new AbortController();
    fetchCertifiedLocationCountriesByUri(missing, controller.signal)
      .then((countries) => {
        if (countries.size === 0) return;
        setRecords((current) => current.map((record) => {
          if (record.country || !record.locationUri) return record;
          const country = countries.get(record.locationUri);
          return country ? { ...record, country } : record;
        }));
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[organizations] country fetch failed", error);
      });
    return () => controller.abort();
  }, [records]);

  const countryChips = useMemo(() => {
    const loadedCodes = records
      .map((record) => normalizeCountry(record.country))
      .filter((code): code is string => Boolean(code));
    return Array.from(new Set(loadedCodes))
      .map((code) => ({ code, name: countryName(code, locale), emoji: countryFlag(code) }))
      .sort((a, b) => Number(b.code === countryFilter) - Number(a.code === countryFilter) || a.name.localeCompare(b.name));
  }, [records, countryFilter, locale]);

  const typeChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      for (const type of orgTypes(record)) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, label: titleCase(value), count }))
      .sort((a, b) => Number(b.value === typeFilter) - Number(a.value === typeFilter) || b.count - a.count || a.label.localeCompare(b.label));
  }, [records, typeFilter]);

  const visibleRecords = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const filtered = records.filter((record) => {
      if (countryFilter && normalizeCountry(record.country) !== countryFilter) return false;
      if (typeFilter && !orgTypes(record).includes(typeFilter)) return false;
      if (quickFilters.includes("observations") && (record.observationCount ?? 0) <= 0) return false;
      if (!normalizedQuery) return true;
      const haystack = [record.name, record.country, countryNameOrEmpty(record.country, locale), record.orgType, record.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    return filtered.toSorted((a, b) => {
      switch (sort) {
        case "oldest":
          return siteTime(a.createdAt) - siteTime(b.createdAt);
        case "az":
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        case "za":
          return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
        case "newest":
        default:
          return siteTime(b.createdAt) - siteTime(a.createdAt);
      }
    });
  }, [countryFilter, deferredQuery, locale, quickFilters, records, sort, typeFilter]);

  const renderedRecords = useMemo(
    () => (view === "map" ? visibleRecords : visibleRecords.slice(0, cardLimit)),
    [cardLimit, view, visibleRecords],
  );

  const hasMoreCardsToShow = view !== "map" && renderedRecords.length < visibleRecords.length;

  const activeFilterCount =
    (countryFilter ? 1 : 0) +
    (typeFilter ? 1 : 0) +
    quickFilters.length +
    badgeFilters.length;

  const hasActiveFilters = query.trim().length > 0 || activeFilterCount > 0;

  useEffect(() => {
    setCardLimit(INITIAL_CARD_LIMIT);
  }, [deferredQuery, sort, countryFilter, typeFilter, quickFilters, badgeFilters, view]);

  const updateQuickFilters = (nextFilters: QuickFilter[]) => {
    void setQuickFiltersParam(serializeQuickFiltersParam(nextFilters));
  };

  const toggleQuickFilter = (filter: QuickFilter) => {
    updateQuickFilters(quickFilters.includes(filter) ? quickFilters.filter((value) => value !== filter) : [...quickFilters, filter]);
  };

  const updateBadgeFilters = (nextFilters: BumicertBadgeFilter[]) => {
    void setBadgesParam(serializeBadgeFilterParam(nextFilters));
  };

  const toggleBadgeFilter = (filter: BumicertBadgeFilter) => {
    updateBadgeFilters(badgeFilters.includes(filter) ? badgeFilters.filter((value) => value !== filter) : [...badgeFilters, filter]);
  };

  const clearAll = () => {
    void setQuery("");
    void setCountryFilter(null);
    void setTypeFilter(null);
    updateQuickFilters([]);
    updateBadgeFilters([]);
  };

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;

    const controller = new AbortController();
    const requestSeq = ++requestSeqRef.current;
    const isCurrent = () => requestSeqRef.current === requestSeq && !controller.signal.aborted;
    const base = records;
    setLoadingMore(true);
    fetchSites(ORGANIZATIONS_PAGE_SIZE, cursor, controller.signal, undefined, "both", { query: deferredQuery, country: countryFilter, orgType: typeFilter, quickFilters, sort, featuredBadgesOnly: true, badgeFilters })
      .then((page) => {
        if (!isCurrent()) return;
        setRecords(mergeSiteRecords(base, page.records));
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[organizations] load more failed", error);
      })
      .finally(() => {
        if (isCurrent()) setLoadingMore(false);
      });
  }, [countryFilter, cursor, deferredQuery, hasMore, loading, loadingMore, quickFilters, badgeFilters, records, sort, typeFilter]);

  const openMapRecord = (record: ExplorerRecord) => {
    if (record.kind === "site") setDrawer(record);
  };

  return (
    <>
      <section className="-mt-14 pb-20 md:pb-28">
        <OrganizationsHero />

        <div className="mx-auto max-w-6xl px-6">
          <div className="relative z-20 mt-5 mb-0 space-y-2.5">
            <div className="relative z-30 flex items-center gap-2 animate-in" style={{ animationDelay: "80ms" }}>
              <div className="group/input-group border-input relative flex h-10 min-w-0 flex-1 items-center rounded-full border bg-background/50 shadow-xs backdrop-blur transition-[color,box-shadow] outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                <div className="flex h-auto cursor-text items-center justify-center gap-2 py-1.5 pl-3.5 text-sm font-medium text-muted-foreground select-none">
                  <SearchIcon className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(event) => void setQuery(event.target.value)}
                  placeholder={t("search.placeholder")}
                  className="min-w-0 flex-1 truncate border-0 bg-transparent px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>

              <SortControl sort={sort} setSort={(nextSort) => void setSort(nextSort)} open={openDropdown} setOpen={setOpenDropdown} />

              <ViewToggle view={view} setView={(nextView) => void setView(nextView)} />
            </div>

            <div
              className="relative z-20 flex items-center gap-2 animate-in"
              style={{ animationDelay: "120ms" }}
            >
              <div className="scroll-mask-right scrollbar-hidden min-w-0 flex-1 overflow-x-auto">
                <div className="flex items-center gap-1.5 pb-1 pr-8">
                {QUICK_CHIP_VALUES.map((value) => (
                  <FilterChip
                    key={value}
                    selected={quickFilters.includes(value)}
                    onClick={() => toggleQuickFilter(value)}
                  >
                    {t(`quickFilters.${value}`)}
                  </FilterChip>
                ))}

                {typeChips.length > 0 && (
                  <FacetDropdown
                    label={t("facets.category")}
                    value={typeFilter}
                    options={typeChips.map((type) => ({ value: type.value, label: type.label, count: type.count }))}
                    onChange={(nextType) => void setTypeFilter(nextType)}
                  />
                )}

                {countryChips.length > 0 && (
                  <FacetDropdown
                    label={t("facets.country")}
                    value={countryFilter}
                    options={countryChips.map((country) => ({ value: country.code, label: country.name, emoji: country.emoji }))}
                    onChange={(nextCountry) => void setCountryFilter(nextCountry)}
                  />
                )}

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                    {t("actions.clear")}
                  </button>
                )}
                </div>
              </div>

              <SourceFiltersPopover
                options={badgeFilterOptions}
                selected={badgeFilters}
                onToggle={toggleBadgeFilter}
                onClear={() => updateBadgeFilters([])}
              />
            </div>
          </div>

          <div className="mt-6">
            {view === "map" ? (
              <RecordMap records={visibleRecords} kind="site" onOpen={openMapRecord} />
            ) : loading && visibleRecords.length === 0 ? (
              <OrganizationsGridSkeleton />
            ) : visibleRecords.length === 0 ? (
              <EmptyState onClear={clearAll} hasActiveFilters={hasActiveFilters} />
            ) : view === "list" ? (
              <OrganizationList records={renderedRecords} onOpen={setDrawer} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2 lg:gap-4">
                {renderedRecords.map((record) => (
                  <OrganizationCard key={record.id} record={record} onOpen={setDrawer} />
                ))}
              </div>
            )}
          </div>

          {(records.length > 0 || (!loading && hasMore && hasActiveFilters)) && (
            <div className="mt-10 flex flex-col items-center gap-3">
              {totalCount !== null && (
                <p className="text-sm text-muted-foreground">
                  {t("footer.showing", { shown: visibleRecords.length, total: totalCount })}
                </p>
              )}
              {hasMoreCardsToShow ? (
                <button
                  type="button"
                  onClick={() => setCardLimit((current) => current + CARD_BATCH_SIZE)}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {t("actions.showMore")}
                </button>
              ) : hasMore ? (
                <AutoLoadMoreButton
                  hasMore={hasMore}
                  loading={loadingMore}
                  onLoadMore={loadMore}
                  autoLoad={autoLoadMore}
                  onAutoLoadChange={setAutoLoadMore}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                />
              ) : (
                <span className="text-sm italic text-muted-foreground">{t("footer.end")}</span>
              )}
            </div>
          )}
        </div>
      </section>

      <RecordDrawer record={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

function OrganizationsHero() {
  const t = useTranslations("marketplace.organizations.hero");

  return (
    <div className="relative min-h-[240px] overflow-hidden bg-card animate-in">
      <div className="absolute inset-0">
        <Image
          src="/assets/organizations/organizations-hero-light@2x.webp"
          alt={t("imageAltLight")}
          fill
          priority
          quality={95}
          sizes="(min-width: 768px) calc(100vw - 15rem), 100vw"
          className="object-cover object-center dark:hidden"
        />
        <Image
          src="/assets/organizations/organizations-hero-dark@2x.webp"
          alt={t("imageAltDark")}
          fill
          priority
          quality={95}
          sizes="(min-width: 768px) calc(100vw - 15rem), 100vw"
          className="hidden object-cover object-center dark:block"
        />
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_36%,color-mix(in_oklab,var(--primary)_16%,transparent)_0%,transparent_28%),linear-gradient(90deg,color-mix(in_oklab,var(--background)_58%,transparent)_0%,color-mix(in_oklab,var(--background)_42%,transparent)_26%,transparent_58%),linear-gradient(180deg,color-mix(in_oklab,var(--background)_46%,transparent)_0%,transparent_42%,var(--background)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background via-background/70 to-transparent" />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-8 pt-[64px] pb-8 sm:px-10 lg:px-9">
        <h1
          aria-label={t("titleAriaLabel")}
          className="max-w-4xl text-4xl leading-[0.98] font-light tracking-[-0.035em] text-foreground sm:text-5xl md:text-5xl lg:text-6xl"
          style={{ fontFamily: "var(--font-garamond-var)" }}
        >
          <span aria-hidden="true">
            {t("titleFirst")}{" "}
            <span
              className="text-foreground/90"
              style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
            >
              {t("titleSecond")}
            </span>
          </span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-base">
          {t("description")}
        </p>
      </div>
    </div>
  );
}

function ViewToggle({ view, setView }: { view: ViewMode; setView: (view: ViewMode) => void }) {
  const t = useTranslations("marketplace.organizations.view");
  return (
    <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background/70 p-0.5 backdrop-blur">
      {([
        { id: "cards", label: t("cards"), Icon: LayoutGridIcon },
        { id: "list", label: t("list"), Icon: ListIcon },
        { id: "map", label: t("map"), Icon: MapIcon },
      ] as const).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          aria-pressed={view === id}
          aria-label={label}
          title={label}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full p-0 text-sm font-medium transition-colors sm:w-auto sm:gap-1.5 sm:px-3 ${
            view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
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
  setOpen: (updater: (open: boolean) => boolean) => void;
}) {
  const t = useTranslations("marketplace.organizations");
  const sortOptions = SORT_OPTION_VALUES.map((value) => ({ value, label: t(`sort.${value}`) }));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(() => false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(() => false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t("search.sortAriaLabel")}
        className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground hover:shadow-sm"
      >
        <ArrowUpDownIcon className="h-4 w-4" />
        <span className="hidden md:inline">{sortOptions.find((option) => option.value === sort)?.label}</span>
        <ChevronDownIcon className={`hidden h-4 w-4 transition-transform md:inline ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-full right-0 z-[1000] mt-2 w-44 rounded-2xl border border-border bg-popover py-1.5 shadow-xl"
            >
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSort(option.value);
                    setOpen(() => false);
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

type FacetOption = { value: string; label: string; count?: number; emoji?: string };

function FacetDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: FacetOption[];
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors ${
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
          }`}
        >
          {selected ? (
            <span className="max-w-[140px] truncate">
              {selected.emoji ? `${selected.emoji} ` : ""}
              {selected.label}
            </span>
          ) : (
            label
          )}
          <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-60 p-1.5">
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(active ? null : option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {option.emoji && <span>{option.emoji}</span>}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.count != null && (
                  <span className="text-[11px] tabular-nums opacity-60">{option.count}</span>
                )}
                {active && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OrganizationsGridSkeleton() {
  const t = useTranslations("marketplace.organizations");
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2 lg:gap-4" aria-label={t("loading")}>
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
          {/* Cover */}
          <Skeleton className="h-28 shrink-0 rounded-none" />

          {/* Body */}
          <div className="flex flex-1 flex-col px-5 pb-5">
            <div className="-mt-8 mb-3 flex items-end justify-between gap-2">
              <Skeleton className="size-16 shrink-0 rounded-full ring-4 ring-card" />
              <Skeleton className="mb-1 h-6 w-20 rounded-full" />
            </div>

            <Skeleton className="h-6 w-3/4 rounded-full" />
            <div className="mt-1.5 space-y-1.5">
              <Skeleton className="h-3.5 w-full rounded-full" />
              <Skeleton className="h-3.5 w-2/3 rounded-full" />
            </div>

            <div className="min-h-5 flex-1" />
            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
              <Skeleton className="h-3.5 w-24 rounded-full" />
              <Skeleton className="size-8 shrink-0 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Shared track template for the compact organisation list. Header + rows use
// the same definition so columns line up; hidden columns are matched by the
// track count at each breakpoint:
//   base : logo | org | chevron
//   sm   : logo | org | type | place | chevron
//   lg   : logo | org | type | place | joined | chevron
const ORG_LIST_GRID =
  "grid-cols-[2.75rem_minmax(0,1fr)_1rem] " +
  "sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,8rem)_minmax(0,8rem)_1rem] " +
  "lg:grid-cols-[3rem_minmax(0,1fr)_minmax(0,8rem)_minmax(0,9rem)_minmax(0,6rem)_1rem]";

function OrganizationListHeader() {
  const t = useTranslations("marketplace.organizations.list");
  return (
    <div className={`hidden items-center gap-3 px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:grid sm:gap-4 sm:px-3 ${ORG_LIST_GRID}`}>
      <span aria-hidden />
      <span>{t("colOrganization")}</span>
      <span>{t("colType")}</span>
      <span>{t("colPlace")}</span>
      <span className="hidden lg:block">{t("colJoined")}</span>
      <span aria-hidden />
    </div>
  );
}

const OrganizationList = memo(function OrganizationList({ records, onOpen }: { records: SiteRecord[]; onOpen: (record: SiteRecord) => void }) {
  return (
    <div>
      <OrganizationListHeader />
      <ul role="list" className="border-t border-border">
        {records.map((record) => (
          <li key={record.id} className="relative after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-border last:after:hidden sm:after:inset-x-3">
            <OrganizationListItem record={record} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
});

const OrganizationListItem = memo(function OrganizationListItem({ record, onOpen }: { record: SiteRecord; onOpen: (record: SiteRecord) => void }) {
  const t = useTranslations("marketplace.organizations.card");
  const locale = useLocale();
  const country = normalizeCountry(record.country);
  const countryLabel = country ? countryName(country, locale) : null;
  const types = orgTypes(record).map(titleCase);
  const primaryType = types[0] ?? null;
  const description = orgDescription(types, countryLabel, t);
  const avatarUrl = organizationAvatarUrl(record);
  const joinedYear = createdYear(record.createdAt);

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className={`group grid w-full items-center gap-3 px-2 py-2 text-left outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 sm:gap-4 sm:px-3 ${ORG_LIST_GRID}`}
    >
      {/* Logo */}
      <span aria-hidden className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          initials(record.name)
        )}
      </span>

      {/* Organisation: name + secondary meta */}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium leading-snug text-foreground group-hover:underline">{record.name}</span>
        {/* Mobile: type · place. Desktop: description. */}
        <span className="mt-0.5 truncate text-xs leading-snug text-muted-foreground sm:hidden">
          {[primaryType, countryLabel ? `${countryFlag(country)} ${countryLabel}` : null].filter(Boolean).join(" \u00b7 ") || description}
        </span>
        <span className="mt-0.5 hidden truncate text-xs leading-snug text-muted-foreground sm:block">{description}</span>
      </span>

      {/* Type */}
      <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">
        {primaryType ?? <span className="text-muted-foreground/45">—</span>}
      </span>

      {/* Place */}
      <span className="hidden min-w-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
        {countryLabel ? (
          <>
            <span aria-hidden>{countryFlag(country)}</span>
            <span className="truncate">{countryLabel}</span>
          </>
        ) : (
          <span className="text-muted-foreground/45">—</span>
        )}
      </span>

      {/* Joined */}
      <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
        {joinedYear ?? <span className="text-muted-foreground/45">—</span>}
      </span>

      {/* Affordance */}
      <ChevronRightIcon className="h-4 w-4 shrink-0 justify-self-end text-muted-foreground/50 transition-colors group-hover:text-foreground" aria-hidden />
    </button>
  );
});

const OrganizationCard = memo(function OrganizationCard({ record, onOpen }: { record: SiteRecord; onOpen: (record: SiteRecord) => void }) {
  const t = useTranslations("marketplace.organizations.card");
  const locale = useLocale();
  const country = normalizeCountry(record.country);
  const countryLabel = country ? countryName(country, locale) : null;
  const types = orgTypes(record).map(titleCase);
  const primaryType = types[0] ?? null;
  const description = orgDescription(types, countryLabel, t);
  const joinedYear = createdYear(record.createdAt);
  const bannerUrl = organizationBannerUrl(record);
  const avatarUrl = organizationAvatarUrl(record);

  return (
    <button type="button" onClick={() => onOpen(record)} className="group h-full w-full text-left">
      <article
        className="flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg"
        style={{ viewTransitionName: `org-${record.did.replace(/[^a-z0-9]/gi, "-")}` }}
      >
        {/* Cover */}
        <div className="relative h-28 shrink-0 overflow-hidden">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%),linear-gradient(135deg,var(--muted),var(--card))]">
              <LeafIcon className="size-10 text-primary/40" aria-hidden="true" strokeWidth={1.25} />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-card via-card/40 to-transparent" />

          <TrustedByBadges did={record.did} className="absolute left-2.5 top-2.5 z-10 max-w-[70%]" variant="compact" />

          {countryLabel && (
            <span className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-xs text-foreground/80 backdrop-blur-sm">
              <span>{countryFlag(country)}</span>
              <span className="max-w-[120px] truncate">{countryLabel}</span>
            </span>
          )}
        </div>

        {/* Body */}
        <div className="relative flex flex-1 flex-col px-5 pb-5">
          <div className="-mt-8 mb-3 flex items-end justify-between gap-2">
            <span
              aria-hidden
              className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_85%,var(--card)),color-mix(in_oklab,var(--primary)_45%,var(--card)))] text-lg font-semibold text-primary-foreground shadow-sm ring-4 ring-card"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                initials(record.name)
              )}
            </span>
            {primaryType && (
              <span className="mb-1 max-w-[55%] truncate rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {primaryType}
              </span>
            )}
          </div>

          <h3 className="line-clamp-1 font-instrument text-2xl italic leading-tight text-foreground">
            {record.name}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

          <div className="min-h-5 flex-1" />
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {joinedYear && <span className="shrink-0">{t("joined", { year: joinedYear })}</span>}
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground">
              <span className="transition-colors group-hover:text-primary">{t("showDetails")}</span>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                <ArrowUpRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </span>
          </div>
        </div>
      </article>
    </button>
  );
});

function orgDescription(
  types: string[],
  countryLabel: string | null,
  t: ReturnType<typeof useTranslations<"marketplace.organizations.card">>,
): string {
  const where = countryLabel ? t("where", { country: countryLabel }) : "";
  if (types.length) {
    return t("descriptionWithType", { types: types.join(" & ").toLowerCase(), where });
  }
  return t("descriptionDefault", { where });
}

function EmptyState({ onClear, hasActiveFilters }: { onClear: () => void; hasActiveFilters: boolean }) {
  const t = useTranslations("marketplace.organizations");
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <span
        className="mb-4 text-7xl font-light tracking-tight text-primary/[0.15] md:text-8xl"
        style={{ fontFamily: "var(--font-garamond-var)" }}
      >
        0
      </span>
      <h3
        className="mb-3 text-2xl font-light text-foreground md:text-3xl"
        style={{ fontFamily: "var(--font-garamond-var)" }}
      >
        {t("empty.title")}
      </h3>
      <p
        className="max-w-md text-base leading-relaxed text-foreground/80"
        style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
      >
        {t("empty.description")}
      </p>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("actions.clearFilters")}
        </button>
      )}
    </div>
  );
}

function normalizeCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const code = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function countryNameOrEmpty(country: string | null | undefined, locale: string): string {
  const code = normalizeCountry(country);
  return code ? countryName(code, locale) : "";
}

function createdYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? String(new Date(time).getFullYear()) : null;
}

function siteTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : 0;
}

function orgTypes(record: SiteRecord): string[] {
  if (!record.orgType) return [];
  return record.orgType
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);
}

function organizationBannerUrl(record: SiteRecord): string | null {
  return record.bannerUrl ?? (record.coverRef ? record.imageUrl : null);
}

function organizationAvatarUrl(record: SiteRecord): string | null {
  return record.avatarUrl ?? (!record.coverRef && record.logoRef ? record.imageUrl : null);
}

function mergeSiteRecords(base: SiteRecord[], incoming: SiteRecord[]): SiteRecord[] {
  const seen = new Set(base.map((record) => record.id));
  return [...base, ...incoming.filter((record) => !seen.has(record.id))];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "•";
}

function parseQuickFiltersParam(value: string | null): QuickFilter[] {
  if (!value) return [];
  const parsed = value.split(",").filter((item): item is QuickFilter => QUICK_FILTERS.includes(item as QuickFilter));
  return [...new Set(parsed)];
}

function serializeQuickFiltersParam(filters: QuickFilter[]): string | null {
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

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
