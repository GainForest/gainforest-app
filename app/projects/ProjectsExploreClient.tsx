"use client";

import Image from "next/image";
import {
  ArrowUpDownIcon,
  ChevronDownIcon,
  FolderKanbanIcon,
  Layers3Icon,
  LayoutGridIcon,
  ListIcon,
  MapIcon,
  MapPinIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { BumicertOwnerAvatar } from "@/components/bumicert/BumicertOwnerAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AutoLoadMoreButton } from "../_components/AutoLoadMoreButton";
import { RecordDrawer } from "../_components/RecordDrawer";
import { RecordMap } from "../_components/RecordMap";
import {
  fetchProjects,
  type ExplorerRecord,
  type ExplorerSortMode,
  type ProjectIndexFilter,
  type ProjectRecord,
} from "../_lib/indexer";
import { isPdsBlobUrl } from "../_lib/pds";

const PROJECTS_PAGE_SIZE = 48;
const INITIAL_CARD_LIMIT = 96;
const CARD_BATCH_SIZE = 96;
const FILTER_KEYS: ProjectIndexFilter[] = ["images", "locations"];
const SORT_MODES: ExplorerSortMode[] = ["newest", "oldest", "az", "za"];
type ViewMode = "cards" | "list" | "map";
const VIEW_MODES: ViewMode[] = ["cards", "list", "map"];
const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;
const SEARCH_QUERY_STATE_OPTIONS = { ...QUERY_STATE_OPTIONS, throttleMs: 200 } as const;



export function ProjectsExploreClient({ records: initialRecords = [] }: { records?: ProjectRecord[] }) {
  const t = useTranslations("marketplace.projects");
  const filterChips = useMemo<Array<{ key: ProjectIndexFilter; label: string; predicate: (record: ProjectRecord) => boolean }>>(() => [
    { key: "images", label: t("filters.images"), predicate: (record) => Boolean(record.imageUrl) },
    { key: "locations", label: t("filters.locations"), predicate: (record) => Boolean(record.locationUri) },
  ], [t]);
  const sortOptions = useMemo<Array<{ value: ExplorerSortMode; label: string }>>(() => [
    { value: "newest", label: t("sort.newest") },
    { value: "oldest", label: t("sort.oldest") },
    { value: "az", label: t("sort.az") },
    { value: "za", label: t("sort.za") },
  ], [t]);
  const sortLabels = useMemo(() => Object.fromEntries(sortOptions.map((option) => [option.value, option.label])) as Record<ExplorerSortMode, string>, [sortOptions]);
  const viewOptions = useMemo(() => [
    { id: "cards", label: t("view.cards"), Icon: LayoutGridIcon },
    { id: "list", label: t("view.list"), Icon: ListIcon },
    { id: "map", label: t("view.map"), Icon: MapIcon },
  ] as const, [t]);
  const [records, setRecords] = useState<ProjectRecord[]>(initialRecords);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialRecords.length === 0);
  const [loading, setLoading] = useState(initialRecords.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cardLimit, setCardLimit] = useState(INITIAL_CARD_LIMIT);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [openSort, setOpenSort] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);
  const [drawer, setDrawer] = useState<ProjectRecord | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const filtersMenuRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);

  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions(SEARCH_QUERY_STATE_OPTIONS),
  );
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringEnum<ExplorerSortMode>(SORT_MODES).withDefault("newest").withOptions(QUERY_STATE_OPTIONS),
  );
  const [view, setView] = useQueryState(
    "view",
    parseAsStringEnum<ViewMode>(VIEW_MODES).withDefault("cards").withOptions(QUERY_STATE_OPTIONS),
  );
  const [filtersParam, setFiltersParam] = useQueryState(
    "filters",
    parseAsString.withOptions(QUERY_STATE_OPTIONS),
  );
  const filters = useMemo(() => parseFilterParam(filtersParam), [filtersParam]);

  useEffect(() => {
    if (initialRecords.length > 0) return;
    const controller = new AbortController();
    const requestSeq = ++requestSeqRef.current;
    const options = { query: deferredQuery, filters, sort };
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
  }, [initialRecords.length, deferredQuery, filters, sort]);

  useEffect(() => {
    setCardLimit(INITIAL_CARD_LIMIT);
  }, [deferredQuery, filters, sort, view]);

  useEffect(() => {
    if (!openSort) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (sortMenuRef.current?.contains(event.target as Node)) return;
      setOpenSort(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenSort(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openSort]);

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
      .toSorted((a, b) => compareProjects(a, b, sort));
  }, [records, filters, sort, filterChips]);
  const renderedRecords = useMemo(
    () => (view === "map" ? visibleRecords : visibleRecords.slice(0, cardLimit)),
    [cardLimit, view, visibleRecords],
  );
  const hasMoreCardsToShow = view !== "map" && renderedRecords.length < visibleRecords.length;

  const updateFilters = useCallback((nextFilters: ProjectIndexFilter[]) => {
    void setFiltersParam(serializeFilterParam(nextFilters));
  }, [setFiltersParam]);

  const toggleFilter = useCallback((key: ProjectIndexFilter) => {
    updateFilters(filters.includes(key) ? filters.filter((value) => value !== key) : [...filters, key]);
  }, [filters, updateFilters]);

  const clearFilters = useCallback(() => updateFilters([]), [updateFilters]);

  const openRecord = useCallback((record: ProjectRecord) => setDrawer(record), []);
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
    fetchProjects(PROJECTS_PAGE_SIZE, cursor, controller.signal, undefined, { query: deferredQuery, filters, sort })
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
  }, [cursor, deferredQuery, filters, hasMore, loading, loadingMore, records, sort]);

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
            <span
              className="whitespace-nowrap text-foreground/85"
              style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
            >
              {t("hero.accent")}
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-base">
            {t("hero.description")}
          </p>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="relative z-20 mt-5 space-y-3">
          <div className="relative z-30 flex items-center gap-3 animate-in" style={{ animationDelay: "80ms" }}>
            <div className="group/input-group border-input relative flex h-10 min-w-0 flex-1 items-center rounded-full border bg-background/50 shadow-xs backdrop-blur transition-[color,box-shadow] outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
              <div className="flex h-auto cursor-text items-center justify-center gap-2 py-1.5 pl-3 text-sm font-medium text-muted-foreground select-none">
                <SearchIcon className="h-4 w-4" />
              </div>
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
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void setView(option.id)}
                  aria-pressed={view === option.id}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors ${
                    view === option.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <option.Icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              ))}
            </div>

            <div ref={sortMenuRef} className="relative shrink-0">
              <button
                onClick={() => {
                  setOpenFilters(false);
                  setOpenSort((value) => !value);
                }}
                type="button"
                aria-label={t("search.sortAriaLabel")}
                aria-expanded={openSort}
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-background px-8 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground hover:shadow-sm disabled:pointer-events-none disabled:opacity-50 has-[>svg]:px-4"
              >
                <ArrowUpDownIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{sortLabels[sort]}</span>
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${openSort ? "rotate-180" : ""}`} />
              </button>

              {openSort && (
                <div className="absolute right-0 top-full z-[1000] mt-2 w-36 rounded-2xl border border-border bg-popover py-1.5 shadow-xl animate-in">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        void setSort(option.value);
                        setOpenSort(false);
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
              )}
            </div>
          </div>

          <div className="relative z-20 flex items-center justify-between gap-3 sm:justify-start">
            <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background/50 p-0.5 backdrop-blur sm:hidden">
              {viewOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void setView(option.id)}
                  aria-pressed={view === option.id}
                  aria-label={option.label}
                  title={option.label}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full p-0 text-sm font-medium transition-colors ${
                    view === option.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <option.Icon className="h-3.5 w-3.5" aria-hidden />
                </button>
              ))}
            </div>

            <div className="scroll-mask-right scrollbar-hidden hidden min-w-0 flex-1 overflow-x-auto pb-px sm:block">
              <div className="flex items-center gap-2 pr-8">
                <Button type="button" onClick={clearFilters} variant={filters.length === 0 ? "default" : "outline"} size="sm" className="h-10 text-sm">
                  {t("filters.allProjects")}
                </Button>
                {filterChips.map((chip) => {
                  const selected = filters.includes(chip.key);
                  return (
                    <Button key={chip.key} type="button" onClick={() => toggleFilter(chip.key)} variant={selected ? "default" : "outline"} size="sm" className="h-10 text-sm">
                      {chip.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div ref={filtersMenuRef} className="relative shrink-0">
              <Button
                type="button"
                onClick={() => {
                  setOpenSort(false);
                  setOpenFilters((value) => !value);
                }}
                aria-haspopup="true"
                aria-expanded={openFilters}
                variant={openFilters || filters.length > 0 ? "default" : "outline"}
                size="sm"
                className="h-10 text-sm"
              >
                <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                <span>{t("filters.allFilters")}</span>
                {filters.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] text-primary">
                    {filters.length}
                  </span>
                )}
              </Button>

              {openFilters && (
                <div aria-label={t("filters.allFilters")} className="quick-popover-in absolute right-0 top-full z-[1000] mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-primary/20 bg-popover p-4 shadow-[0_18px_45px_color-mix(in_oklab,var(--primary)_16%,transparent)]">
                  <div className="mb-3">
                    <h2 className="text-base font-medium text-foreground">{t("filters.allFilters")}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t("filters.description")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {filterChips.map((chip) => (
                      <Button key={chip.key} type="button" aria-pressed={filters.includes(chip.key)} onClick={() => toggleFilter(chip.key)} variant={filters.includes(chip.key) ? "default" : "outline"} size="sm" className="h-10 text-sm">
                        {chip.label}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-primary/15 pt-3">
                    <p className="text-xs text-accent-foreground/75">{t("filters.updateHint")}</p>
                    <Button type="button" onClick={clearFilters} variant="ghost" size="sm">
                      {t("actions.clearAll")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5">
          {view === "map" ? (
            <RecordMap records={visibleRecords} kind="project" onOpen={openMapRecord} />
          ) : view === "list" ? (
            <ProjectList records={renderedRecords} loading={loading} onOpen={openRecord} />
          ) : (
            <ProjectGrid records={renderedRecords} loading={loading} onOpen={openRecord} />
          )}
        </div>

        {records.length > 0 && (
          <div className="mt-10 flex flex-col items-center gap-3">
            {view !== "map" && visibleRecords.length > renderedRecords.length && (
              <p className="text-sm text-muted-foreground">
                {t("footer.showing", { shown: renderedRecords.length, total: visibleRecords.length })}
              </p>
            )}
            {hasMoreCardsToShow ? (
              <button
                type="button"
                onClick={() => setCardLimit((current) => current + CARD_BATCH_SIZE)}
                className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {t("footer.showMore")}
              </button>
            ) : hasMore ? (
              <AutoLoadMoreButton
                hasMore={hasMore}
                loading={loadingMore}
                onLoadMore={loadMore}
                autoLoad={autoLoadMore}
                onAutoLoadChange={setAutoLoadMore}
                idleLabel={t("footer.showMore")}
                loadingLabel={t("footer.showMore")}
                endLabel={t("footer.end")}
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

const ProjectGrid = memo(function ProjectGrid({
  records,
  loading,
  onOpen,
}: {
  records: ProjectRecord[];
  loading: boolean;
  onOpen: (record: ProjectRecord) => void;
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
    <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] items-stretch gap-6 lg:gap-8">
      {records.map((record, index) => (
        <ProjectCard key={record.id} record={record} priority={index < 6} index={index} onOpen={onOpen} />
      ))}
    </div>
  );
});

const ProjectList = memo(function ProjectList({
  records,
  loading,
  onOpen,
}: {
  records: ProjectRecord[];
  loading: boolean;
  onOpen: (record: ProjectRecord) => void;
}) {
  if (loading && records.length === 0) return <ProjectGridSkeleton />;
  if (records.length === 0) return <ProjectGrid records={records} loading={loading} onOpen={onOpen} />;

  return (
    <ul role="list" className="mt-4">
      {records.map((record, index) => (
        <li key={record.id} className="relative animate-in after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
          <ProjectListItem record={record} onOpen={onOpen} priority={index < 8} />
        </li>
      ))}
    </ul>
  );
});

function ProjectListItem({ record, priority, onOpen }: { record: ProjectRecord; priority: boolean; onOpen: (record: ProjectRecord) => void }) {
  const t = useTranslations("marketplace.projects.card");
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="group flex w-full gap-3 rounded-2xl px-1 py-3 text-left outline-none transition-colors duration-300 hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-primary/60 sm:gap-4 sm:px-2 sm:py-4"
    >
      <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-36">
        {hasImage ? (
          <Image
            src={record.imageUrl!}
            alt={record.title}
            fill
            sizes="144px"
            priority={priority}
            fetchPriority={priority ? "high" : "auto"}
            unoptimized={!isPdsBlobUrl(record.imageUrl)}
            onError={() => setImgError(true)}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full place-items-center text-primary/50">
            <FolderKanbanIcon className="h-9 w-9" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <span className="min-w-0">
          <span className="block truncate font-instrument text-2xl italic leading-tight text-foreground">{record.title}</span>
          {record.shortDescription ? <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">{record.shortDescription}</span> : null}
        </span>
        <span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <span className="flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{t("bumicertCount", { count: record.bumicertCount })}</span>
            {record.locationUri ? <span>{t("projectPlace")}</span> : null}
          </span>
          <span className="shrink-0 text-xs font-medium text-foreground transition-colors group-hover:text-primary">{t("showDetails")}</span>
        </span>
      </span>
    </button>
  );
}

function ProjectGridSkeleton() {
  const t = useTranslations("marketplace.projects.card");
  return (
    <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] items-stretch gap-6 lg:gap-8" aria-label={t("loading")}>
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
}: {
  record: ProjectRecord;
  priority: boolean;
  index: number;
  onOpen: (record: ProjectRecord) => void;
}) {
  const t = useTranslations("marketplace.projects.card");
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;

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
        <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 overflow-hidden rounded-full bg-background/75 p-1 pr-3 shadow-lg backdrop-blur-lg">
          <BumicertOwnerAvatar did={record.did} avatarRef={record.creatorAvatarRef} label={record.creatorName ?? t("projectSteward")} className="h-7 w-7 shrink-0 shadow-sm" />
          <span className="min-w-0 truncate text-xs font-medium text-foreground">
            {record.creatorName ?? t("projectSteward")}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex-1">
          <h2 className="line-clamp-2 font-instrument text-2xl italic leading-tight text-foreground">{record.title}</h2>
          {record.shortDescription ? (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{record.shortDescription}</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
            <Layers3Icon className="h-3.5 w-3.5" />
            {t("bumicertCount", { count: record.bumicertCount })}
          </span>
          {record.locationUri ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
              <MapPinIcon className="h-3.5 w-3.5" />
              {t("projectPlace")}
            </span>
          ) : null}
        </div>

      </div>
    </button>
  );
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

function mergeProjectRecords(base: ProjectRecord[], incoming: ProjectRecord[]): ProjectRecord[] {
  const seen = new Set(base.map((record) => record.id));
  return [...base, ...incoming.filter((record) => !seen.has(record.id))];
}

