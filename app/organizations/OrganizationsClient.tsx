"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDownIcon,
  ChevronDownIcon,
  GlobeIcon,
  ImageIcon,
  LayoutGridIcon,
  LeafIcon,
  MapIcon,
  MapPinIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RecordDrawer } from "../_components/RecordDrawer";
import { RecordMap } from "../_components/RecordMap";
import { StatsTileGrid } from "../_components/StatsTile";
import {
  fetchOrganizationStats,
  fetchSites,
  type ExplorerRecord,
  type OrganizationStats,
  type SiteRecord,
} from "../_lib/indexer";
import { countryFlag, formatDate } from "../_lib/format";

type SortMode = "newest" | "oldest" | "az" | "za";
type SourceFilter = "both" | "gainforest" | "certified";
type ViewMode = "cards" | "map";
type QuickFilter = "photos" | "locations";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "A → Z" },
  { value: "za", label: "Z → A" },
];

const SOURCE_CHIPS: Array<{ value: SourceFilter; label: string }> = [
  { value: "both", label: "All organizations" },
  { value: "gainforest", label: "Project profiles" },
  { value: "certified", label: "Bumicerts profiles" },
];

const QUICK_CHIPS: Array<{ value: QuickFilter; label: string; Icon: typeof ImageIcon }> = [
  { value: "photos", label: "With photos", Icon: ImageIcon },
  { value: "locations", label: "Mapped locations", Icon: MapPinIcon },
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
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("both");
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

  useEffect(() => {
    const controller = new AbortController();
    setStatsLoading(true);
    fetchOrganizationStats(sourceFilter, controller.signal)
      .then((nextStats) => setTotalStats(nextStats))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setTotalStats(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatsLoading(false);
      });
    return () => controller.abort();
  }, [sourceFilter]);

  useEffect(() => {
    if (initialRecords.length > 0) return;
    const controller = new AbortController();
    setLoading(true);
    fetchSites(ORGANIZATIONS_PAGE_SIZE, null, controller.signal, (running) => {
      setRecords(running as SiteRecord[]);
      setLoading(false);
    })
      .then((page) => {
        setRecords(page.records);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        setLoading(false);
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [initialRecords.length]);

  const countryChips = useMemo(() => {
    const codes = records
      .map((record) => normalizeCountry(record.country))
      .filter((code): code is string => Boolean(code));

    return Array.from(new Set(codes))
      .map((code) => ({ code, name: countryName(code), emoji: countryFlag(code) }))
      .sort((a, b) => Number(b.code === countryFilter) - Number(a.code === countryFilter) || a.name.localeCompare(b.name));
  }, [records, countryFilter]);

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
      if (sourceFilter !== "both" && record.source !== sourceFilter) return false;
      if (countryFilter && normalizeCountry(record.country) !== countryFilter) return false;
      if (typeFilter && !orgTypes(record).includes(typeFilter)) return false;
      if (quickFilters.includes("photos") && !hasPhoto(record)) return false;
      if (quickFilters.includes("locations") && !hasMappableLocation(record)) return false;
      if (!normalizedQuery) return true;
      const haystack = [record.name, record.country, countryNameOrEmpty(record.country), record.orgType, record.did, record.source]
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
  }, [records, deferredQuery, sort, sourceFilter, countryFilter, typeFilter, quickFilters]);

  const stats = useMemo(
    () => [
      {
        label: "Total organizations",
        value: totalStats?.organizations ?? null,
        detail: "organization profiles",
      },
      {
        label: "Countries",
        value: totalStats?.countries ?? null,
        detail: "countries represented",
      },
      {
        label: "With photos",
        value: totalStats?.withPhotos ?? null,
        detail: "profiles with photos",
      },
      {
        label: "Mapped places",
        value: totalStats?.mappedPlaces ?? null,
        detail: "places shown on map",
      },
    ],
    [totalStats],
  );

  const renderedRecords = useMemo(
    () => (view === "cards" ? visibleRecords.slice(0, cardLimit) : visibleRecords),
    [cardLimit, view, visibleRecords],
  );

  const hasMoreCardsToShow = view === "cards" && renderedRecords.length < visibleRecords.length;

  const hasActiveFilters =
    query.trim().length > 0 ||
    sourceFilter !== "both" ||
    Boolean(countryFilter) ||
    Boolean(typeFilter) ||
    quickFilters.length > 0;

  useEffect(() => {
    setCardLimit(INITIAL_CARD_LIMIT);
  }, [deferredQuery, sort, sourceFilter, countryFilter, typeFilter, quickFilters, view]);

  const toggleQuickFilter = (filter: QuickFilter) => {
    setQuickFilters((current) =>
      current.includes(filter) ? current.filter((value) => value !== filter) : [...current, filter],
    );
  };

  const clearAll = () => {
    setQuery("");
    setSourceFilter("both");
    setCountryFilter(null);
    setTypeFilter(null);
    setQuickFilters([]);
  };

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;

    const controller = new AbortController();
    const base = records;
    setLoadingMore(true);
    fetchSites(ORGANIZATIONS_PAGE_SIZE, cursor, controller.signal, (running) => {
      setRecords(mergeSiteRecords(base, running));
    })
      .then((page) => {
        setRecords(mergeSiteRecords(base, page.records));
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[organizations] load more failed", error);
      })
      .finally(() => setLoadingMore(false));
  }, [cursor, hasMore, loading, loadingMore, records]);

  const openMapRecord = (record: ExplorerRecord) => {
    if (record.kind === "site") setDrawer(record);
  };

  return (
    <>
      <section className="-mt-14 pb-20 md:pb-28">
        <OrganizationsHero />

        <div className="mx-auto max-w-6xl px-6">
          <div className="relative z-20 -mt-10 px-3">
            <StatsBand stats={stats} loading={statsLoading || (loading && records.length === 0)} />
          </div>

          <div className="relative z-20 mt-4 mb-0 space-y-3 px-3">
            <div className="flex flex-wrap items-center gap-3 animate-in" style={{ animationDelay: "80ms" }}>
              <div className="group/input-group border-input relative flex h-10 min-w-[220px] flex-1 items-center rounded-full border bg-background/50 shadow-xs backdrop-blur transition-[color,box-shadow] outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                <div className="flex h-auto cursor-text items-center justify-center gap-2 py-1.5 pl-3 text-sm font-medium text-muted-foreground select-none">
                  <SearchIcon className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search organizations..."
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>

              <ViewToggle view={view} setView={setView} />

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setOpenDropdown((open) => !open)}
                  aria-expanded={openDropdown}
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground hover:shadow-sm sm:px-8 sm:text-base has-[>svg]:px-4"
                >
                  <ArrowUpDownIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">{SORT_OPTIONS.find((option) => option.value === sort)?.label}</span>
                  <ChevronDownIcon className={`h-4 w-4 transition-transform ${openDropdown ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {openDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute top-full right-0 z-20 mt-2 w-44 rounded-2xl border border-border bg-background py-1.5 shadow-xl"
                    >
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setSort(option.value);
                            setOpenDropdown(false);
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
                  )}
                </AnimatePresence>
              </div>
            </div>

            <ChipRow delay={120}>
              {SOURCE_CHIPS.map((chip) => (
                <FilterChip
                  key={chip.value}
                  selected={sourceFilter === chip.value}
                  onClick={() => setSourceFilter(chip.value)}
                >
                  {chip.label}
                </FilterChip>
              ))}
              {QUICK_CHIPS.map(({ value, label, Icon }) => (
                <FilterChip
                  key={value}
                  selected={quickFilters.includes(value)}
                  onClick={() => toggleQuickFilter(value)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </FilterChip>
              ))}
              {hasActiveFilters && (
                <Button type="button" onClick={clearAll} variant="outline" size="sm">
                  <XIcon className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              )}
            </ChipRow>

            {typeChips.length > 0 && (
              <ChipRow delay={150}>
                {typeChips.map((type) => (
                  <FilterChip
                    key={type.value}
                    selected={typeFilter === type.value}
                    onClick={() => setTypeFilter(typeFilter === type.value ? null : type.value)}
                  >
                    {type.label}
                    <span className="text-[10px] opacity-60">{type.count}</span>
                  </FilterChip>
                ))}
              </ChipRow>
            )}

            {countryChips.length > 0 && (
              <ChipRow delay={180}>
                {countryChips.map((country) => (
                  <FilterChip
                    key={country.code}
                    selected={countryFilter === country.code}
                    onClick={() => setCountryFilter(countryFilter === country.code ? null : country.code)}
                  >
                    {country.emoji} {country.name}
                  </FilterChip>
                ))}
              </ChipRow>
            )}
          </div>

          <div className="my-6 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

          {view === "map" ? (
            <RecordMap records={visibleRecords} kind="site" onOpen={openMapRecord} />
          ) : loading && visibleRecords.length === 0 ? (
            <OrganizationsGridSkeleton />
          ) : visibleRecords.length === 0 ? (
            <EmptyState onClear={clearAll} hasActiveFilters={hasActiveFilters} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2 lg:gap-4">
              {renderedRecords.map((record) => (
                <OrganizationCard key={record.id} record={record} onOpen={setDrawer} />
              ))}
            </div>
          )}

          {records.length > 0 && (
            <div className="mt-10 flex flex-col items-center gap-3">
              {view === "cards" && visibleRecords.length > renderedRecords.length && (
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
          src="/assets/organizations/organizations-hero-light.png"
          alt="Misty mountain forest at sunrise"
          fill
          priority
          sizes="(min-width: 1280px) 1152px, calc(100vw - 48px)"
          className="object-cover object-center dark:hidden"
        />
        <Image
          src="/assets/organizations/organizations-hero-dark.png"
          alt="Misty mountain forest at dusk"
          fill
          priority
          sizes="(min-width: 1280px) 1152px, calc(100vw - 48px)"
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
    <div className="inline-flex rounded-full border border-border bg-background/70 p-0.5 backdrop-blur">
      {([
        { id: "cards", label: "Cards", Icon: LayoutGridIcon },
        { id: "map", label: "Map", Icon: MapIcon },
      ] as const).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          aria-pressed={view === id}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function ChipRow({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <div className="scrollbar-hidden overflow-x-auto animate-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 pb-1">{children}</div>
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
    <Button type="button" onClick={onClick} variant={selected ? "default" : "outline"} size="sm">
      {children}
    </Button>
  );
}

function StatsBand({ stats, loading }: { stats: Array<{ label: string; value: number | null; detail: string }>; loading: boolean }) {
  if (loading) return null;

  const icons = [
    <UsersIcon key="organizations" />,
    <GlobeIcon key="countries" />,
    <ImageIcon key="photos" />,
    <MapPinIcon key="mapped" />,
  ];

  return (
    <StatsTileGrid
      columns={4}
      items={stats.map((stat, index) => ({
        label: stat.label,
        value: formatStat(stat.value),
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
        <div key={index} className="overflow-hidden rounded-2xl border border-border/50 bg-card">
          <div className="h-32 bg-muted" />
          <div className="space-y-2 p-4">
            <div className="h-5 w-3/4 rounded-full bg-muted" />
            <div className="h-3 w-full rounded-full bg-muted/70" />
            <div className="h-3 w-2/3 rounded-full bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

const OrganizationCard = memo(function OrganizationCard({ record, onOpen }: { record: SiteRecord; onOpen: (record: SiteRecord) => void }) {
  const country = normalizeCountry(record.country);
  const countryLabel = country ? countryName(country) : null;
  const types = orgTypes(record).map(titleCase);
  const sourceLabel = record.source === "certified" ? "Bumicerts profile" : "Project profile";
  const created = formatDate(record.createdAt);
  const description = types.length
    ? `${types.join(", ")} organization stewarding local impact work.`
    : countryLabel
      ? `Organization stewarding regenerative work in ${countryLabel}.`
      : "Organization stewarding regenerative work with GainForest.";

  return (
    <div className="h-full">
      <button type="button" onClick={() => onOpen(record)} className="h-full w-full text-left">
        <div
          className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/50 bg-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
          style={{ viewTransitionName: `org-${record.did.replace(/[^a-z0-9]/gi, "-")}` }}
        >
          <div className="relative h-32 shrink-0 overflow-hidden">
            {record.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={record.imageUrl}
                alt={record.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
            ) : (
              <div className="absolute inset-0 bg-muted" />
            )}
            <div className="absolute inset-0 bg-linear-to-t from-background via-background/80 to-transparent" />

            <div className="absolute top-2 right-2 flex flex-wrap justify-end gap-1.5">
              {countryLabel && (
                <span className="flex items-center gap-1 rounded-full bg-background/60 px-2 py-1 text-xs backdrop-blur-sm">
                  <span>{countryFlag(country)}</span>
                  <span className="text-foreground/80">{countryLabel}</span>
                </span>
              )}
              {hasMappableLocation(record) && (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-background/60 text-xs text-primary backdrop-blur-sm" title="Mapped location">
                  ●
                </span>
              )}
            </div>

            <div className="absolute right-4 bottom-2 left-4 flex flex-col items-start gap-2">
              <div className="-ml-1 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background/80">
                <span className="text-sm font-semibold text-muted-foreground">{initials(record.name)}</span>
              </div>
              <h3 className="line-clamp-1 font-instrument text-2xl italic text-foreground">
                {record.name}
              </h3>
            </div>
          </div>

          <div className="flex-1 px-4 pt-3">
            <p className="line-clamp-3 text-muted-foreground">{description}</p>
          </div>

          <div className="px-4 pt-3">
            <div className="flex min-w-0 flex-wrap gap-1 overflow-hidden">
              <span className="max-w-[160px] truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {sourceLabel}
              </span>
              {types.slice(0, 2).map((type) => (
                <span key={type} className="max-w-[130px] truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {type}
                </span>
              ))}
              {types.length > 2 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                  +{types.length - 2}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 p-4">
            <div className="min-w-0 font-mono text-[10px] text-muted-foreground">
              <span className="block truncate">Shared {created}</span>
              {created && <span className="block text-muted-foreground/70">Joined {created}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              <span>Open</span>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
});

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

function hasPhoto(record: SiteRecord): boolean {
  return Boolean(record.imageUrl || record.coverRef || record.logoRef);
}

function hasMappableLocation(record: SiteRecord): boolean {
  return record.source === "gainforest" || Boolean(record.locationUri);
}

function formatStat(value: number | null): string {
  if (value === null) return "—";
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
