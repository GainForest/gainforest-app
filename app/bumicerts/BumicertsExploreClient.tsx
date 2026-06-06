"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowUpDownIcon,
  ChevronDownIcon,
  ImageIcon,
  LayoutGridIcon,
  LeafIcon,
  MapIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { RecordDrawer } from "../_components/RecordDrawer";
import { RecordMap } from "../_components/RecordMap";
import { StatsTileGrid } from "../_components/StatsTile";
import type { BumicertRecord, ExplorerRecord } from "../_lib/indexer";
import { isPdsBlobUrl } from "../_lib/pds";

type FilterKey = "images" | "locations" | "contributors" | "active";
type SortMode = "newest" | "oldest" | "az" | "za";
type ViewMode = "cards" | "map";

type FilterChip = {
  key: FilterKey;
  label: string;
  predicate: (record: BumicertRecord) => boolean;
};

const FILTER_CHIPS: FilterChip[] = [
  { key: "images", label: "With images", predicate: (record) => Boolean(record.imageUrl) },
  { key: "locations", label: "Project places", predicate: (record) => record.locationCount > 0 },
  { key: "contributors", label: "Contributors", predicate: (record) => record.contributorCount > 0 },
  { key: "active", label: "Active period", predicate: (record) => Boolean(record.startDate || record.endDate) },
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

export function BumicertsExploreClient({ records }: { records: BumicertRecord[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [openSort, setOpenSort] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);
  const [filters, setFilters] = useState<FilterKey[]>([]);
  const [view, setView] = useState<ViewMode>("cards");
  const [drawer, setDrawer] = useState<BumicertRecord | null>(null);

  const visibleRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = records.filter((record) => {
      if (q) {
        const haystack = `${record.title} ${record.shortDescription ?? ""} ${record.did}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return filters.every((key) => FILTER_CHIPS.find((chip) => chip.key === key)?.predicate(record));
    });

    return filtered.toSorted((a, b) => {
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
  }, [records, query, sort, filters]);

  const stats = useMemo(
    () => [
      {
        label: "Projects shown",
        value: visibleRecords.length,
        detail: "ready to explore",
      },
      {
        label: "Certified places",
        value: visibleRecords.reduce((sum, record) => sum + record.locationCount, 0),
        detail: "project locations",
      },
      {
        label: "Contributors",
        value: visibleRecords.reduce((sum, record) => sum + record.contributorCount, 0),
        detail: "people credited",
      },
      {
        label: "Project photos",
        value: visibleRecords.filter((record) => record.imageUrl).length,
        detail: "visual stories",
      },
    ],
    [visibleRecords],
  );

  const toggleFilter = (key: FilterKey) => {
    setFilters((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  };

  const clearFilters = () => setFilters([]);
  const openRecord = (record: BumicertRecord) => setDrawer(record);
  const openMapRecord = (record: ExplorerRecord) => {
    if (record.kind === "bumicert") setDrawer(record);
  };

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
          <div className="relative z-20 -mt-10 px-3">
            <StatsBand stats={stats} />
          </div>

          <div className="relative z-20 mt-4 mb-0 space-y-3 px-3">
            <div className="space-y-3 animate-in" style={{ animationDelay: "80ms" }}>
              <div className="flex items-center gap-3">
                <div className="group/input-group border-input relative flex h-10 min-w-0 flex-1 items-center rounded-full border bg-background/50 shadow-xs backdrop-blur transition-[color,box-shadow] outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                  <div className="flex h-auto cursor-text items-center justify-center gap-2 py-1.5 pl-3 text-sm font-medium text-muted-foreground select-none">
                    <SearchIcon className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search projects"
                    placeholder="Search projects by name, keyword, or location..."
                    className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>

                <div className="hidden shrink-0 rounded-full border border-border bg-background/50 p-0.5 backdrop-blur sm:inline-flex">
                  {(
                    [
                      { id: "cards", label: "Cards", Icon: LayoutGridIcon },
                      { id: "map", label: "Map", Icon: MapIcon },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setView(option.id)}
                      aria-pressed={view === option.id}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
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

                <div className="relative shrink-0">
                  <button
                    onClick={() => setOpenSort((value) => !value)}
                    type="button"
                    aria-label="Sort projects"
                    aria-expanded={openSort}
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-background px-8 text-base font-medium transition-colors hover:bg-muted hover:text-foreground hover:shadow-sm disabled:pointer-events-none disabled:opacity-50 has-[>svg]:px-4"
                  >
                    <ArrowUpDownIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">{SORT_LABELS[sort]}</span>
                    <ChevronDownIcon className={`h-4 w-4 transition-transform ${openSort ? "rotate-180" : ""}`} />
                  </button>

                  {openSort && (
                    <div className="absolute right-0 top-full z-20 mt-2 w-36 rounded-2xl border border-border bg-popover py-1.5 shadow-xl animate-in">
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

              <div className="flex items-center gap-3">
                <div className="inline-flex shrink-0 rounded-full border border-border bg-background/50 p-0.5 backdrop-blur sm:hidden">
                  {(
                    [
                      { id: "cards", label: "Cards", Icon: LayoutGridIcon },
                      { id: "map", label: "Map", Icon: MapIcon },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setView(option.id)}
                      aria-pressed={view === option.id}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
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

                <div className="scrollbar-hidden min-w-0 flex-1 overflow-x-auto pb-px">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-medium transition-all ${
                        filters.length === 0
                          ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_18px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
                          : "border-border bg-card/85 text-muted-foreground hover:border-primary/35 hover:text-foreground"
                      }`}
                    >
                      All Projects
                    </button>
                    {FILTER_CHIPS.map((chip) => {
                      const selected = filters.includes(chip.key);
                      return (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={() => toggleFilter(chip.key)}
                          className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-medium transition-all ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_18px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
                              : "border-border bg-card/85 text-muted-foreground hover:border-primary/35 hover:text-foreground"
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpenFilters((value) => !value)}
                    className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-medium transition-all ${
                      filters.length > 0
                        ? "border-primary/50 bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"
                    }`}
                  >
                    <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                    <span>All filters</span>
                    {filters.length > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                        {filters.length}
                      </span>
                    )}
                  </button>

                  {openFilters && (
                    <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-border bg-popover p-4 shadow-xl animate-in">
                      <div className="mb-3">
                        <h2 className="text-base font-medium text-foreground">All Filters</h2>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Filter projects by organization, country, or impact area
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {FILTER_CHIPS.map((chip) => (
                          <button
                            key={chip.key}
                            onClick={() => toggleFilter(chip.key)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                              filters.includes(chip.key)
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-muted-foreground hover:border-foreground/50"
                            }`}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                        <button onClick={clearFilters} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                          Clear all
                        </button>
                        <button
                          onClick={() => setOpenFilters(false)}
                          className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          {filters.length > 0 ? `Apply filters (${filters.length})` : "Apply filters"}
                        </button>
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
            ) : (
              <BumicertGrid records={visibleRecords} onOpen={openRecord} />
            )}
          </div>
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
        src="/images/explore/explore-hero-light.png"
        alt=""
        fill
        priority
        sizes="(min-width: 768px) calc(100vw - 15rem), 100vw"
        className="object-cover object-center dark:hidden"
      />
      <Image
        src="/images/explore/explore-hero-dark.png"
        alt=""
        fill
        priority
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
}: {
  stats: Array<{ label: string; value: number; detail: string }>;
}) {
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
        value: formatStat(stat.value),
        detail: stat.detail,
        icon: icons[index] ?? <LeafIcon />,
        accent: index % 2 === 0,
      }))}
    />
  );
}

function formatStat(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}

function BumicertGrid({
  records,
  onOpen,
}: {
  records: BumicertRecord[];
  onOpen: (record: BumicertRecord) => void;
}) {
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
          No projects found
        </h3>
        <p
          className="max-w-md text-base leading-relaxed text-foreground/80"
          style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
        >
          Try adjusting your search or filters to discover more regenerative impact projects.
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
}

function BumicertCardVisual({ record, priority }: { record: BumicertRecord; priority: boolean }) {
  const objectives = buildObjectiveLabels(record);
  const organizationName = "Project steward";
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

        {objectives.length > 0 && (
          <div className="mt-4 flex w-full flex-wrap items-center gap-2">
            {objectives.map((objective) => (
              <span
                key={objective}
                className={`rounded-full bg-muted px-2.5 py-1 text-sm font-medium ${
                  objective.startsWith("+") ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {objective}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="absolute left-2 top-2 flex min-w-0 items-center gap-1 rounded-full bg-background/70 p-1 shadow-lg backdrop-blur-lg">
        <div className="relative h-6 w-6 shrink-0 scale-120 overflow-hidden rounded-full bg-white shadow-sm transition-all duration-300 group-hover:scale-100">
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-[8px] font-bold text-muted-foreground">
            {organizationName.charAt(0).toUpperCase()}
          </div>
        </div>
        <motion.span
          variants={orgLabelTextVariants}
          className="overflow-hidden whitespace-nowrap text-xs font-medium text-foreground text-shadow-md"
        >
          {organizationName}
        </motion.span>
      </div>
    </motion.div>
  );
}

function buildObjectiveLabels(record: BumicertRecord): string[] {
  const labels: string[] = [];
  if (record.locationCount > 0) labels.push(`${record.locationCount} ${record.locationCount === 1 ? "place" : "places"}`);
  if (record.contributorCount > 0) labels.push(`${record.contributorCount} ${record.contributorCount === 1 ? "contributor" : "contributors"}`);
  if (record.startDate || record.endDate) labels.push("project dates");
  return [labels[0], labels.length > 1 ? `+${labels.length - 1}` : null].filter((value): value is string => Boolean(value));
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
