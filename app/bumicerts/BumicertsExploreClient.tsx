"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowUpDownIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ImageIcon,
  LayoutGridIcon,
  LeafIcon,
  ListIcon,
  MapIcon,
  MapPinIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { BumicertOwnerAvatar } from "@/components/bumicert/BumicertOwnerAvatar";
import { BumicertPillRows, type BumicertCardPill } from "@/components/bumicert/BumicertPillRows";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordDrawer } from "../_components/RecordDrawer";
import { RecordMap } from "../_components/RecordMap";
import { StatsTileGrid } from "../_components/StatsTile";
import {
  fetchBumicertStats,
  fetchBumicerts,
  type BumicertRecord,
  type BumicertStats,
  type ExplorerRecord,
} from "../_lib/indexer";
import { isPdsBlobUrl } from "../_lib/pds";

type FilterKey = "images" | "locations" | "contributors" | "active" | "donations";
type SortMode = "newest" | "oldest" | "az" | "za";
type ViewMode = "cards" | "list" | "map";

type FilterChip = {
  key: FilterKey;
  label: string;
  predicate: (record: BumicertRecord) => boolean;
};

const FILTER_CHIPS: FilterChip[] = [
  { key: "images", label: "Shows photos", predicate: (record) => Boolean(record.imageUrl) },
  { key: "locations", label: "Shows project places", predicate: (record) => record.locationCount > 0 },
  { key: "contributors", label: "Shows named people", predicate: (record) => record.contributorCount > 0 },
  { key: "active", label: "Shows work dates", predicate: (record) => Boolean(record.startDate || record.endDate) },
  { key: "donations", label: "Accepts donations", predicate: () => true },
];

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "az", label: "A → Z" },
  { value: "za", label: "Z → A" },
];

const SORT_LABELS: Record<SortMode, string> = Object.fromEntries(
  SORT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<SortMode, string>;

const BUMICERTS_PAGE_SIZE = 48;
const INITIAL_CARD_LIMIT = 96;
const CARD_BATCH_SIZE = 96;

export function BumicertsExploreClient({ records: initialRecords = [] }: { records?: BumicertRecord[] }) {
  const [records, setRecords] = useState<BumicertRecord[]>(initialRecords);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialRecords.length === 0);
  const [loading, setLoading] = useState(initialRecords.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortMode>("newest");
  const [openSort, setOpenSort] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);
  const [filters, setFilters] = useState<FilterKey[]>(["images"]);
  const [view, setView] = useState<ViewMode>("cards");
  const [drawer, setDrawer] = useState<BumicertRecord | null>(null);
  const [cardLimit, setCardLimit] = useState(INITIAL_CARD_LIMIT);
  const [totalStats, setTotalStats] = useState<BumicertStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const filtersMenuRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatsLoading(true);
    fetchBumicertStats(controller.signal)
      .then((nextStats) => setTotalStats(nextStats))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.warn("[bumicerts] stats fetch failed", error);
          setTotalStats(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatsLoading(false);
      });
    return () => controller.abort();
  }, []);

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
    fetchBumicerts(BUMICERTS_PAGE_SIZE, null, controller.signal, undefined, options)
      .then((page) => {
        if (!isCurrent()) return;
        setRecords(page.records);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[bumicerts] fetch failed", error);
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => controller.abort();
  }, [initialRecords.length, deferredQuery, filters, sort]);

  const visibleRecords = useMemo(() => {
    return records.filter((record) => filters.every((key) => FILTER_CHIPS.find((chip) => chip.key === key)?.predicate(record))).toSorted((a, b) => {
      switch (sort) {
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "az":
          return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        case "za":
          return b.title.localeCompare(a.title, undefined, { sensitivity: "base" });
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [records, deferredQuery, sort, filters]);

  const renderedRecords = useMemo(
    () => (view === "map" ? visibleRecords : visibleRecords.slice(0, cardLimit)),
    [cardLimit, view, visibleRecords],
  );

  const hasMoreCardsToShow = view !== "map" && renderedRecords.length < visibleRecords.length;

  useEffect(() => {
    setCardLimit(INITIAL_CARD_LIMIT);
  }, [deferredQuery, filters, sort, view]);

  const stats = useMemo(
    () => [
      {
        label: "Bumicerts",
        value: totalStats?.totalBumicerts ?? null,
        detail: "published",
      },
      {
        label: "Project places",
        value: totalStats?.certifiedPlaces ?? null,
        detail: "linked to Bumicerts",
      },
      {
        label: "People named",
        value: totalStats?.contributors ?? null,
        detail: "named in Bumicerts",
      },
      {
        label: "Stories with photos",
        value: totalStats?.projectPhotos ?? null,
        detail: "include a project photo",
      },
    ],
    [totalStats],
  );

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

  const toggleFilter = useCallback((key: FilterKey) => {
    setFilters((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }, []);

  const clearFilters = useCallback(() => setFilters([]), []);
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;

    const controller = new AbortController();
    const requestSeq = ++requestSeqRef.current;
    const isCurrent = () => requestSeqRef.current === requestSeq && !controller.signal.aborted;
    const base = records;
    setLoadingMore(true);
    fetchBumicerts(BUMICERTS_PAGE_SIZE, cursor, controller.signal, undefined, { query: deferredQuery, filters, sort })
      .then((page) => {
        if (!isCurrent()) return;
        setRecords(mergeBumicertRecords(base, page.records));
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[bumicerts] load more failed", error);
      })
      .finally(() => {
        if (isCurrent()) setLoadingMore(false);
      });
  }, [cursor, deferredQuery, filters, hasMore, loading, loadingMore, records, sort]);
  const openRecord = useCallback((record: BumicertRecord) => setDrawer(record), []);
  const openMapRecord = useCallback((record: ExplorerRecord) => {
    if (record.kind === "bumicert") setDrawer(record);
  }, []);

  return (
    <>
      <section className="-mt-14 pb-20 md:pb-28">
        <div className="relative isolate min-h-[330px] overflow-hidden">
          <HeroBackdrop />
          <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-8 pb-14 pt-[86px] sm:px-10 lg:px-9 animate-in">
            <div className="mb-5 flex items-center gap-2.5">
              <LeafIcon className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Explore Projects
              </span>
            </div>
            <h1
              className="max-w-4xl text-4xl font-light leading-[0.98] tracking-[-0.035em] text-foreground sm:text-5xl md:text-6xl lg:text-7xl"
              style={{ fontFamily: "var(--font-garamond-var)" }}
            >
              Discover{" "}
              <span
                className="whitespace-nowrap text-foreground/85"
                style={{
                  fontFamily: "var(--font-instrument-serif-var)",
                  fontStyle: "italic",
                }}
              >
                Regenerative Impact
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
              Browse projects from communities and organizations restoring ecosystems,
              strengthening livelihoods, and building a more resilient future.
            </p>
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <div className="relative z-20 -mt-10">
            <StatsBand stats={stats} loading={statsLoading} />
          </div>

          <div className="relative z-20 mt-4 mb-0 space-y-3">
            <div className="space-y-3 animate-in" style={{ animationDelay: "80ms" }}>
              <div className="relative z-30 flex items-center gap-3">
                <div className="group/input-group border-input relative flex h-10 min-w-0 flex-1 items-center rounded-full border bg-background/50 shadow-xs backdrop-blur transition-[color,box-shadow] outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                  <div className="flex h-auto cursor-text items-center justify-center gap-2 py-1.5 pl-3 text-sm font-medium text-muted-foreground select-none">
                    <SearchIcon className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search projects"
                    placeholder="Search projects by name, keyword, or location"
                    className="min-w-0 flex-1 truncate border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>

                <div className="hidden h-10 shrink-0 items-center rounded-full border border-border bg-background/50 p-0.5 backdrop-blur sm:inline-flex">
                  {(
                    [
                      { id: "cards", label: "Cards", Icon: LayoutGridIcon },
                      { id: "list", label: "List", Icon: ListIcon },
                      { id: "map", label: "Map", Icon: MapIcon },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setView(option.id)}
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
                    aria-label="Sort projects"
                    aria-expanded={openSort}
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-background px-8 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground hover:shadow-sm disabled:pointer-events-none disabled:opacity-50 has-[>svg]:px-4"
                  >
                    <ArrowUpDownIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">{SORT_LABELS[sort]}</span>
                    <ChevronDownIcon className={`h-4 w-4 transition-transform ${openSort ? "rotate-180" : ""}`} />
                  </button>

                  {openSort && (
                    <div className="absolute right-0 top-full z-[1000] mt-2 w-36 rounded-2xl border border-border bg-popover py-1.5 shadow-xl animate-in">
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setSort(option.value);
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
                  {(
                    [
                      { id: "cards", label: "Cards", Icon: LayoutGridIcon },
                      { id: "list", label: "List", Icon: ListIcon },
                      { id: "map", label: "Map", Icon: MapIcon },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setView(option.id)}
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

                <div className="scroll-mask-right scrollbar-hidden hidden min-w-0 flex-1 overflow-x-auto pb-px sm:block">
                  <div className="flex items-center gap-2 pr-8">
                    <Button
                      type="button"
                      onClick={clearFilters}
                      variant={filters.length === 0 ? "default" : "outline"}
                      size="sm"
                      className="h-10 text-sm"
                    >
                      All Bumicerts
                    </Button>
                    {FILTER_CHIPS.map((chip) => {
                      const selected = filters.includes(chip.key);
                      return (
                        <Button
                          key={chip.key}
                          type="button"
                          onClick={() => toggleFilter(chip.key)}
                          variant={selected ? "default" : "outline"}
                          size="sm"
                          className="h-10 text-sm"
                        >
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
                    <span>All filters</span>
                    {filters.length > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] text-primary">
                        {filters.length}
                      </span>
                    )}
                  </Button>

                  {openFilters && (
                    <div
                      aria-label="All filters"
                      className="quick-popover-in absolute right-0 top-full z-[1000] mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-primary/20 bg-popover p-4 shadow-[0_18px_45px_color-mix(in_oklab,var(--primary)_16%,transparent)]"
                    >
                      <div className="mb-3">
                        <h2 className="text-base font-medium text-foreground">All filters</h2>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Show Bumicerts with photos, project places, named people, work dates, or donations.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {FILTER_CHIPS.map((chip) => (
                          <Button
                            key={chip.key}
                            type="button"
                            aria-pressed={filters.includes(chip.key)}
                            onClick={() => toggleFilter(chip.key)}
                            variant={filters.includes(chip.key) ? "default" : "outline"}
                            size="sm"
                            className="h-10 text-sm"
                          >
                            {chip.label}
                          </Button>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-primary/15 pt-3">
                        <p className="text-xs text-accent-foreground/75">Filters update as you choose.</p>
                        <Button type="button" onClick={clearFilters} variant="ghost" size="sm">
                          Clear all
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            {view === "map" ? (
              <RecordMap records={visibleRecords} kind="bumicert" onOpen={openMapRecord} />
            ) : view === "list" ? (
              <BumicertList records={renderedRecords} loading={loading} onOpen={openRecord} />
            ) : (
              <BumicertGrid records={renderedRecords} loading={loading} onOpen={openRecord} />
            )}
          </div>

          {records.length > 0 && (
            <div className="mt-10 flex flex-col items-center gap-3">
              {view !== "map" && visibleRecords.length > renderedRecords.length && (
                <p className="text-sm text-muted-foreground">
                  Showing {renderedRecords.length} of {visibleRecords.length} projects.
                </p>
              )}
              {hasMoreCardsToShow ? (
                <button
                  type="button"
                  onClick={() => setCardLimit((current) => current + CARD_BATCH_SIZE)}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Show more
                </button>
              ) : hasMore ? (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  aria-busy={loadingMore}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {loadingMore ? "Loading" : "Load more"}
                </button>
              ) : (
                <span className="text-sm italic text-muted-foreground">You have reached the end.</span>
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
      <div className="absolute inset-x-0 bottom-0 h-44 bg-linear-to-b from-transparent via-background/70 to-background" />
    </div>
  );
}

function StatsBand({
  stats,
  loading,
}: {
  stats: Array<{ label: string; value: number | null; detail: string }>;
  loading: boolean;
}) {
  if (loading || stats.every((stat) => stat.value === null)) return null;

  const icons = [
    <LayoutGridIcon key="projects" />,
    <MapIcon key="places" />,
    <UsersIcon key="contributors" />,
    <ImageIcon key="photos" />,
  ];

  return (
    <StatsTileGrid
      columns={4}
      items={stats.map((stat, index) => ({
        label: stat.label,
        value: stat.value === null ? null : formatStat(stat.value),
        detail: stat.detail,
        icon: icons[index] ?? <LeafIcon />,
        accent: index % 2 === 0,
      }))}
    />
  );
}

function formatStat(value: number): string {
  return new Intl.NumberFormat("en", { notation: Math.abs(value) >= 1000 ? "compact" : "standard" }).format(value);
}

function mergeBumicertRecords(base: BumicertRecord[], incoming: BumicertRecord[]): BumicertRecord[] {
  const seen = new Set(base.map((record) => record.id));
  return [...base, ...incoming.filter((record) => !seen.has(record.id))];
}

const BumicertGrid = memo(function BumicertGrid({
  records,
  loading,
  onOpen,
}: {
  records: BumicertRecord[];
  loading: boolean;
  onOpen: (record: BumicertRecord) => void;
}) {
  if (loading && records.length === 0) {
    return <BumicertGridSkeleton />;
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-28 text-center animate-in">
        <span
          className="mb-4 text-7xl font-light tracking-tight text-primary/15 md:text-8xl"
          style={{ fontFamily: "var(--font-garamond-var)" }}
        >
          0
        </span>
        <div className="mb-3 flex items-center gap-2">
          <SearchIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            No Results
          </span>
        </div>
        <h3
          className="mb-3 text-2xl font-light text-foreground md:text-3xl"
          style={{ fontFamily: "var(--font-garamond-var)" }}
        >
          No Bumicerts found
        </h3>
        <p
          className="max-w-md text-base leading-relaxed text-foreground/80"
          style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
        >
          Try adjusting your search or filters to find more project stories.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-stretch gap-6 lg:gap-8">
      {records.map((record, index) => (
        <div
          key={record.id}
          className="h-full animate-in"
          style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
        >
          <button type="button" onClick={() => onOpen(record)} className="block h-full w-full text-left">
            <BumicertCardVisual record={record} priority={index < 8} />
          </button>
        </div>
      ))}
    </div>
  );
});

function BumicertGridSkeleton() {
  return (
    <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-stretch gap-6 lg:gap-8" aria-label="Loading projects">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
          {/* Image */}
          <Skeleton className="aspect-[4/3] rounded-none" />

          {/* Body (overlaps image like the real card) */}
          <div className="-mt-6 flex flex-1 flex-col justify-between px-4 py-3">
            <div>
              <Skeleton className="h-6 w-3/4 rounded-full" />
              <div className="mt-1.5 space-y-1.5">
                <Skeleton className="h-3.5 w-full rounded-full" />
                <Skeleton className="h-3.5 w-full rounded-full" />
                <Skeleton className="h-3.5 w-2/3 rounded-full" />
              </div>
            </div>

            {/* Pill rows */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
          </div>

          {/* Owner avatar pill */}
          <div className="absolute left-2 top-2 rounded-full bg-background/70 p-1 shadow-lg backdrop-blur-lg">
            <Skeleton className="size-6 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

const BumicertList = memo(function BumicertList({
  records,
  loading,
  onOpen,
}: {
  records: BumicertRecord[];
  loading: boolean;
  onOpen: (record: BumicertRecord) => void;
}) {
  if (loading && records.length === 0) {
    return <BumicertGridSkeleton />;
  }

  if (records.length === 0) {
    return <BumicertGrid records={records} loading={loading} onOpen={onOpen} />;
  }

  return (
    <ul role="list" className="mt-4">
      {records.map((record, index) => (
        <li key={record.id} className="relative animate-in after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
          <BumicertListItem record={record} onOpen={onOpen} priority={index < 8} />
        </li>
      ))}
    </ul>
  );
});

const BumicertListItem = memo(function BumicertListItem({ record, priority, onOpen }: { record: BumicertRecord; priority: boolean; onOpen: (record: BumicertRecord) => void }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;
  const placeLabel = record.locationCount > 0 ? `${record.locationCount} project place${record.locationCount === 1 ? "" : "s"}` : null;
  const peopleLabel = record.contributorCount > 0 ? `${record.contributorCount} people named` : null;

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
          <span className="grid h-full place-items-center font-garamond text-sm italic text-muted-foreground">No cover image</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <span className="min-w-0">
          <span className="block truncate font-instrument text-2xl italic leading-tight text-foreground">{record.title}</span>
          {record.shortDescription ? <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">{record.shortDescription}</span> : null}
        </span>
        <span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <span className="flex min-w-0 flex-wrap gap-1.5 text-xs text-muted-foreground">
            {peopleLabel ? <span>{peopleLabel}</span> : null}
            {placeLabel ? <span>{placeLabel}</span> : null}
          </span>
          <span className="shrink-0 text-xs font-medium text-foreground transition-colors group-hover:text-primary">Show details</span>
        </span>
      </span>
    </button>
  );
});

const BumicertCardVisual = memo(function BumicertCardVisual({ record, priority }: { record: BumicertRecord; priority: boolean }) {
  const { scopeItems, iconItems } = useMemo(() => buildPillRows(record), [record]);
  const organizationName = record.creatorName ?? "Project steward";
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;

  return (
    <motion.div
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:shadow-lg"
      initial="initial"
      whileHover="cardHover"
    >
      <div className="relative z-0 aspect-[4/3] overflow-hidden bg-muted">
        {hasImage ? (
          <Image
            src={record.imageUrl!}
            alt={record.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 240px"
            priority={priority}
            fetchPriority={priority ? "high" : "auto"}
            unoptimized={!isPdsBlobUrl(record.imageUrl)}
            onError={() => setImgError(true)}
            className="scale-110 object-cover transition-all duration-300 group-hover:scale-100"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" aria-label="Missing image" />
        )}
      </div>

      <div className="relative z-1 -mt-6 flex flex-1 flex-col justify-between px-4 py-3">
        <div className="absolute -top-2 left-0 right-0 z-0 h-8 bg-linear-to-b from-transparent via-background/65 to-background" />
        <div>
          <h3 className="relative z-1 line-clamp-1 font-instrument text-2xl italic leading-snug text-foreground">
            {record.title}
          </h3>
          {record.shortDescription && (
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {record.shortDescription}
            </p>
          )}
        </div>

        <BumicertPillRows scopeItems={scopeItems} iconItems={iconItems} />
      </div>

      <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] min-w-0 items-center gap-1 overflow-hidden rounded-full bg-background/70 p-1 shadow-lg backdrop-blur-lg">
        <BumicertOwnerAvatar
          did={record.did}
          avatarRef={record.creatorAvatarRef}
          label={organizationName}
          className="h-6 w-6 shrink-0 scale-120 shadow-sm transition-all duration-300 group-hover:scale-100"
        />
        <motion.span
          variants={orgLabelTextVariants}
          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-foreground text-shadow-md"
        >
          {organizationName}
        </motion.span>
      </div>
    </motion.div>
  );
});

function buildPillRows(record: BumicertRecord): {
  scopeItems: BumicertCardPill[];
  iconItems: BumicertCardPill[];
} {
  const scopeItems: BumicertCardPill[] = (record.scopeTags ?? []).map((tag, index) => ({
    key: `scope-${index}-${tag}`,
    content: <span>{formatScopeTag(tag)}</span>,
  }));

  const iconItems: BumicertCardPill[] = [];

  if (record.locationCount > 0) {
    iconItems.push({
      key: "places",
      content: (
        <>
          <MapPinIcon className="h-3.5 w-3.5" aria-hidden />
          <span>{formatStat(record.locationCount)}</span>
        </>
      ),
      ariaLabel: `${record.locationCount} project place${record.locationCount === 1 ? "" : "s"}`,
    });
  }

  if (record.contributorCount > 0) {
    iconItems.push({
      key: "contributors",
      content: (
        <>
          <UsersIcon className="h-3.5 w-3.5" aria-hidden />
          <span>{formatStat(record.contributorCount)}</span>
        </>
      ),
      ariaLabel: `${record.contributorCount} people named`,
    });
  }

  if (record.startDate || record.endDate) {
    iconItems.push({
      key: "dates",
      content: <CalendarDaysIcon className="h-3.5 w-3.5" aria-hidden />,
      ariaLabel: "Project dates added",
    });
  }

  return { scopeItems, iconItems };
}

function formatScopeTag(tag: string): string {
  const clean = tag.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : tag;
}

const orgLabelTextVariants = {
  initial: {
    opacity: 0,
    maxWidth: 0,
    marginLeft: "-0.25rem",
    marginRight: "0rem",
    pointerEvents: "none" as const,
    x: -2,
    filter: "blur(4px)",
  },
  cardHover: {
    opacity: 1,
    maxWidth: 200,
    marginLeft: "0rem",
    marginRight: "0.5rem",
    pointerEvents: "auto" as const,
    x: 0,
    filter: "blur(0px)",
  },
};
