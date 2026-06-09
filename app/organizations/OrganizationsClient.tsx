"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDownIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  ImageOffIcon,
  LayoutGridIcon,
  LeafIcon,
  ListIcon,
  MapIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordDrawer } from "../_components/RecordDrawer";
import { RecordMap } from "../_components/RecordMap";
import { StatsTileGrid } from "../_components/StatsTile";
import {
  fetchCertifiedLocationCountriesByUri,
  fetchOrganizationStats,
  fetchSites,
  type ExplorerRecord,
  type OrganizationStats,
  type SiteRecord,
} from "../_lib/indexer";
import { countryFlag } from "../_lib/format";

type SortMode = "newest" | "oldest" | "az" | "za";
type ViewMode = "cards" | "list" | "map";
type QuickFilter = "observations" | "bumicerts";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "A → Z" },
  { value: "za", label: "Z → A" },
];

const QUICK_CHIPS: Array<{ value: QuickFilter; label: string }> = [
  { value: "observations", label: "Has observations" },
  { value: "bumicerts", label: "Has Bumicerts" },
];

const ORGANIZATIONS_PAGE_SIZE = 24;
const INITIAL_CARD_LIMIT = 96;
const CARD_BATCH_SIZE = 96;

export function OrganizationsClient({ records: initialRecords = [] }: { records?: SiteRecord[] }) {
  const [records, setRecords] = useState<SiteRecord[]>(initialRecords);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialRecords.length === 0);
  const [loading, setLoading] = useState(initialRecords.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  const [view, setView] = useState<ViewMode>("cards");
  const [openDropdown, setOpenDropdown] = useState(false);
  const [drawer, setDrawer] = useState<SiteRecord | null>(null);
  const [cardLimit, setCardLimit] = useState(INITIAL_CARD_LIMIT);
  const [totalStats, setTotalStats] = useState<OrganizationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const deferredQuery = useDeferredValue(query);
  const requestSeqRef = useRef(0);
  const countryHydrationKeyRef = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    setStatsLoading(true);
    fetchOrganizationStats("both", controller.signal)
      .then((nextStats) => setTotalStats(nextStats))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.warn("[organizations] stats fetch failed", error);
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
    const isCurrent = () => requestSeqRef.current === requestSeq && !controller.signal.aborted;
    const options = { query: deferredQuery, country: countryFilter, orgType: typeFilter, quickFilters, sort };
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
  }, [countryFilter, deferredQuery, initialRecords.length, quickFilters, sort, typeFilter]);

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
    const statsCodes = totalStats?.countryCodes ?? [];

    return Array.from(new Set([...statsCodes, ...loadedCodes]))
      .map((code) => ({ code, name: countryName(code), emoji: countryFlag(code) }))
      .sort((a, b) => Number(b.code === countryFilter) - Number(a.code === countryFilter) || a.name.localeCompare(b.name));
  }, [records, countryFilter, totalStats?.countryCodes]);

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
      if (quickFilters.includes("bumicerts") && (record.bumicertCount ?? 0) <= 0) return false;
      if (!normalizedQuery) return true;
      const haystack = [record.name, record.country, countryNameOrEmpty(record.country), record.orgType, record.source]
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
  }, [countryFilter, deferredQuery, quickFilters, records, sort, typeFilter]);

  const stats = useMemo(
    () => [
      {
        label: "Organizations",
        value: totalStats?.organizations ?? null,
        detail: "public profiles",
      },
      {
        label: "With Bumicerts",
        value: totalStats?.withBumicerts ?? null,
        detail: "organizations with project stories",
      },
      {
        label: "With observations",
        value: totalStats?.withObservations ?? null,
        detail: "organizations with nature sightings",
      },
      {
        label: "Locations shown",
        value: totalStats?.mappedPlaces ?? null,
        detail: "organization locations on map",
      },
    ],
    [totalStats],
  );

  const renderedRecords = useMemo(
    () => (view === "map" ? visibleRecords : visibleRecords.slice(0, cardLimit)),
    [cardLimit, view, visibleRecords],
  );

  const hasMoreCardsToShow = view !== "map" && renderedRecords.length < visibleRecords.length;

  const activeFilterCount =
    (countryFilter ? 1 : 0) +
    (typeFilter ? 1 : 0) +
    quickFilters.length;

  const hasActiveFilters = query.trim().length > 0 || activeFilterCount > 0;

  useEffect(() => {
    setCardLimit(INITIAL_CARD_LIMIT);
  }, [deferredQuery, sort, countryFilter, typeFilter, quickFilters, view]);

  const toggleQuickFilter = (filter: QuickFilter) => {
    setQuickFilters((current) =>
      current.includes(filter) ? current.filter((value) => value !== filter) : [...current, filter],
    );
  };

  const clearAll = () => {
    setQuery("");
    setCountryFilter(null);
    setTypeFilter(null);
    setQuickFilters([]);
  };

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;

    const controller = new AbortController();
    const requestSeq = ++requestSeqRef.current;
    const isCurrent = () => requestSeqRef.current === requestSeq && !controller.signal.aborted;
    const base = records;
    setLoadingMore(true);
    fetchSites(ORGANIZATIONS_PAGE_SIZE, cursor, controller.signal, undefined, "both", { query: deferredQuery, country: countryFilter, orgType: typeFilter, quickFilters, sort })
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
  }, [countryFilter, cursor, deferredQuery, hasMore, loading, loadingMore, quickFilters, records, sort, typeFilter]);

  const openMapRecord = (record: ExplorerRecord) => {
    if (record.kind === "site") setDrawer(record);
  };

  return (
    <>
      <section className="-mt-14 pb-20 md:pb-28">
        <OrganizationsHero />

        <div className="mx-auto max-w-6xl px-6">
          <div className="relative z-20 -mt-10">
            <StatsBand stats={stats} loading={statsLoading} />
          </div>

          <div className="relative z-20 mt-4 mb-0 space-y-2.5">
            <div className="relative z-30 flex items-center gap-2 animate-in" style={{ animationDelay: "80ms" }}>
              <div className="group/input-group border-input relative flex h-10 min-w-0 flex-1 items-center rounded-full border bg-background/50 shadow-xs backdrop-blur transition-[color,box-shadow] outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                <div className="flex h-auto cursor-text items-center justify-center gap-2 py-1.5 pl-3.5 text-sm font-medium text-muted-foreground select-none">
                  <SearchIcon className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search organizations"
                  className="min-w-0 flex-1 truncate border-0 bg-transparent px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>

              <SortControl sort={sort} setSort={setSort} open={openDropdown} setOpen={setOpenDropdown} />

              <ViewToggle view={view} setView={setView} />
            </div>

            <div
              className="scroll-mask-right scrollbar-hidden relative z-20 overflow-x-auto animate-in"
              style={{ animationDelay: "120ms" }}
            >
              <div className="flex items-center gap-1.5 pb-1 pr-8">
                {QUICK_CHIPS.map(({ value, label }) => (
                  <FilterChip
                    key={value}
                    selected={quickFilters.includes(value)}
                    onClick={() => toggleQuickFilter(value)}
                  >
                    {label}
                  </FilterChip>
                ))}

                {typeChips.length > 0 && (
                  <FacetDropdown
                    label="Category"
                    value={typeFilter}
                    options={typeChips.map((type) => ({ value: type.value, label: type.label, count: type.count }))}
                    onChange={setTypeFilter}
                  />
                )}

                {countryChips.length > 0 && (
                  <FacetDropdown
                    label="Country"
                    value={countryFilter}
                    options={countryChips.map((country) => ({ value: country.code, label: country.name, emoji: country.emoji }))}
                    onChange={setCountryFilter}
                  />
                )}

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                    Clear
                  </button>
                )}
              </div>
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
              {view !== "map" && visibleRecords.length > renderedRecords.length && (
                <p className="text-sm text-muted-foreground">
                  Showing {renderedRecords.length} of {visibleRecords.length} organizations.
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

function OrganizationsHero() {
  return (
    <div className="relative min-h-[330px] overflow-hidden bg-card animate-in">
      <div className="absolute inset-0">
        <Image
          src="/assets/organizations/organizations-hero-light@2x.webp"
          alt="Misty mountain forest at sunrise"
          fill
          priority
          quality={95}
          sizes="(min-width: 768px) calc(100vw - 15rem), 100vw"
          className="object-cover object-center dark:hidden"
        />
        <Image
          src="/assets/organizations/organizations-hero-dark@2x.webp"
          alt="Misty mountain forest at dusk"
          fill
          priority
          quality={95}
          sizes="(min-width: 768px) calc(100vw - 15rem), 100vw"
          className="hidden object-cover object-center dark:block"
        />
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_36%,color-mix(in_oklab,var(--primary)_16%,transparent)_0%,transparent_28%),linear-gradient(90deg,color-mix(in_oklab,var(--background)_58%,transparent)_0%,color-mix(in_oklab,var(--background)_42%,transparent)_26%,transparent_58%),linear-gradient(180deg,color-mix(in_oklab,var(--background)_46%,transparent)_0%,transparent_42%,var(--background)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background via-background/70 to-transparent" />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-8 pt-[86px] pb-14 sm:px-10 lg:px-9">
        <div className="mb-5 flex items-center gap-2.5">
          <UsersIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
            Organizations
          </span>
        </div>
        <h1
          aria-label="Nature Stewards"
          className="max-w-4xl text-4xl leading-[0.98] font-light tracking-[-0.035em] text-foreground sm:text-5xl md:text-6xl lg:text-7xl"
          style={{ fontFamily: "var(--font-garamond-var)" }}
        >
          <span aria-hidden="true">
            Nature{" "}
            <span
              className="text-foreground/90"
              style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
            >
              Stewards
            </span>
          </span>
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
          Discover organizations leading environmental stewardship and community-driven change.
        </p>
      </div>
    </div>
  );
}

function ViewToggle({ view, setView }: { view: ViewMode; setView: (view: ViewMode) => void }) {
  return (
    <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background/70 p-0.5 backdrop-blur">
      {([
        { id: "cards", label: "Cards", Icon: LayoutGridIcon },
        { id: "list", label: "List", Icon: ListIcon },
        { id: "map", label: "Map", Icon: MapIcon },
      ] as const).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          aria-pressed={view === id}
          aria-label={label}
          title={label}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition-colors sm:px-3 ${
            view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
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
        aria-label="Sort"
        className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground hover:shadow-sm"
      >
        <ArrowUpDownIcon className="h-4 w-4" />
        <span className="hidden md:inline">{SORT_OPTIONS.find((option) => option.value === sort)?.label}</span>
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
              {SORT_OPTIONS.map((option) => (
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

function StatsBand({ stats, loading }: { stats: Array<{ label: string; value: number | null; detail: string }>; loading: boolean }) {
  if (loading || stats.every((stat) => stat.value === null)) return null;

  const icons = [
    <UsersIcon key="organizations" />,
    <GlobeIcon key="bumicerts" />,
    <LeafIcon key="observations" />,
    <MapIcon key="mapped" />,
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

function OrganizationsGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2 lg:gap-4" aria-label="Loading organizations">
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

const OrganizationList = memo(function OrganizationList({ records, onOpen }: { records: SiteRecord[]; onOpen: (record: SiteRecord) => void }) {
  return (
    <ul role="list">
      {records.map((record) => (
        <li key={record.id} className="relative after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden">
          <OrganizationListItem record={record} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
});

const OrganizationListItem = memo(function OrganizationListItem({ record, onOpen }: { record: SiteRecord; onOpen: (record: SiteRecord) => void }) {
  const country = normalizeCountry(record.country);
  const countryLabel = country ? countryName(country) : null;
  const types = orgTypes(record).map(titleCase);
  const primaryType = types[0] ?? null;
  const description = orgDescription(types, countryLabel);
  const bannerUrl = organizationBannerUrl(record);
  const avatarUrl = organizationAvatarUrl(record);
  const joinedYear = createdYear(record.createdAt);

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="group flex w-full gap-3 rounded-2xl px-1 py-3 text-left outline-none transition-colors duration-300 hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-primary/60 sm:gap-4 sm:px-2 sm:py-4"
    >
      <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-36">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <span className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%),linear-gradient(135deg,var(--muted),var(--card))] text-muted-foreground">
            <ImageOffIcon className="size-10 opacity-50" aria-hidden strokeWidth={1.25} />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <span className="min-w-0">
          {(primaryType || countryLabel) ? (
            <span className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {primaryType ? <span>{primaryType}</span> : null}
              {countryLabel ? <span>{countryFlag(country)} {countryLabel}</span> : null}
            </span>
          ) : null}
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                initials(record.name)
              )}
            </span>
            <span className="block min-w-0 truncate font-instrument text-2xl italic leading-tight text-foreground">{record.name}</span>
          </span>
          <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">{description}</span>
        </span>
        <span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <span className="text-xs text-muted-foreground">{joinedYear ? `Joined ${joinedYear}` : "Public profile"}</span>
          <span className="shrink-0 text-xs font-medium text-foreground transition-colors group-hover:text-primary">Show details</span>
        </span>
      </span>
    </button>
  );
});

const OrganizationCard = memo(function OrganizationCard({ record, onOpen }: { record: SiteRecord; onOpen: (record: SiteRecord) => void }) {
  const country = normalizeCountry(record.country);
  const countryLabel = country ? countryName(country) : null;
  const types = orgTypes(record).map(titleCase);
  const primaryType = types[0] ?? null;
  const description = orgDescription(types, countryLabel);
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
              <ImageOffIcon className="size-12 text-muted-foreground opacity-50" aria-hidden="true" strokeWidth={1.25} />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-card via-card/40 to-transparent" />

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
              {joinedYear && <span className="shrink-0">Joined {joinedYear}</span>}
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground">
              <span className="transition-colors group-hover:text-primary">Show details</span>
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

function orgDescription(types: string[], countryLabel: string | null): string {
  const where = countryLabel ? ` in ${countryLabel}` : "";
  if (types.length) {
    return `A ${types.join(" & ").toLowerCase()} advancing community-led environmental stewardship${where}.`;
  }
  return `A nature steward protecting and restoring local ecosystems${where}.`;
}

function EmptyState({ onClear, hasActiveFilters }: { onClear: () => void; hasActiveFilters: boolean }) {
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
        No organizations found
      </h3>
      <p
        className="max-w-md text-base leading-relaxed text-foreground/80"
        style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
      >
        Try adjusting your search or filters.
      </p>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Clear filters
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

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function countryNameOrEmpty(country: string | null | undefined): string {
  const code = normalizeCountry(country);
  return code ? countryName(code) : "";
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

function formatStat(value: number): string {
  return new Intl.NumberFormat("en", { notation: Math.abs(value) >= 1000 ? "compact" : "standard" }).format(value);
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

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
