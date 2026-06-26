"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3Icon,
  BuildingIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  CoinsIcon,
  HandHeartIcon,
  ExternalLinkIcon,
  GaugeIcon,
  GlobeIcon,
  SproutIcon,
  TrendingUpIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import {
  computeGeoStats,
  computeKpis,
  computePerOrg,
  computeRecentTransactions,
  computeTimeSeries,
  computeTopDonors,
  fetchOrgCountryMap,
  fetchReceipts,
  filterByPeriod,
  type DashboardKpis,
  type GeoStats,
  type OrgRow,
  type Period,
  type TimeGranularity,
  type TimePoint,
  type TopDonor,
  type TxRow,
} from "../_lib/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatCompactUsd, formatNumber, formatUsd } from "../_lib/format";
import { AuthorInline } from "./AuthorChip";
import { PreferredAccountLink, PreferredBumicertLink } from "./PreferredLinks";
import { StatsTile } from "./StatsTile";
import { PictureHero } from "./PictureHero";

const PERIODS: Period[] = ["all", "month", "week"];

const GRANULARITIES: TimeGranularity[] = ["day", "week", "month"]; 
const PERIOD_VALUES: Period[] = ["all", "month", "week"];
const SORT_DIRECTIONS: Array<"asc" | "desc"> = ["asc", "desc"];
const DONOR_SORT_KEYS: Array<"rank" | "totalAmount" | "donationCount" | "lastDonatedAt"> = ["rank", "totalAmount", "donationCount", "lastDonatedAt"];
const ORG_SORT_KEYS: Array<"totalRaised" | "bumicertCount" | "donorCount"> = ["totalRaised", "bumicertCount", "donorCount"];
const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;

// Shared surface treatment matching the app's modern pages (leaderboard, explorer):
// soft card tint, primary-tinted shadow, hairline ring, and backdrop blur.
const SURFACE =
  "rounded-3xl bg-card/70 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur";
const PILL_GROUP =
  "flex items-center gap-1 rounded-full bg-muted/55 p-1 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur";
const DEFAULT_SECTION_LIMIT = 25;

function pillButton(active: boolean) {
  return [
    "rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
    active
      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
  ].join(" ");
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

export function Dashboard({ embedded = false }: { embedded?: boolean }) {
  const { period, setPeriod } = useDashboardPeriod();
  const [granularity, setGranularity] = useQueryState(
    "granularity",
    parseAsStringEnum<TimeGranularity>(GRANULARITIES).withDefault("day").withOptions(QUERY_STATE_OPTIONS),
  );
  const [receipts, setReceipts] = useState<Awaited<ReturnType<typeof fetchReceipts>> | null>(null);
  // null while loading — the geo fetch is much slower than the receipts fetch,
  // so the dashboard renders as soon as receipts land and geo data fills in.
  const [orgCountryMap, setOrgCountryMap] = useState<Map<string, string> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetchReceipts(controller.signal)
      .then((nextReceipts) => {
        if (!cancelled) setReceipts(nextReceipts);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError" || cancelled) return;
        setError(true);
      });

    fetchOrgCountryMap(controller.signal)
      .then((nextOrgCountryMap) => {
        if (!cancelled) setOrgCountryMap(nextOrgCountryMap);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError" || cancelled) return;
        // Best effort; render the dashboard without geographic reach data.
        setOrgCountryMap(new Map());
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const allReceipts = receipts ?? [];
  const geoLoading = orgCountryMap === null;
  const periodFiltered = useMemo(() => filterByPeriod(allReceipts, period), [allReceipts, period]);
  const kpis = useMemo(() => computeKpis(periodFiltered), [periodFiltered]);
  const geoStats = useMemo(
    () => computeGeoStats(orgCountryMap ?? new Map(), Number.POSITIVE_INFINITY),
    [orgCountryMap],
  );
  const timeSeries = useMemo(
    () => computeTimeSeries(periodFiltered, granularity),
    [periodFiltered, granularity],
  );
  const topDonors = useMemo(() => computeTopDonors(periodFiltered, Number.POSITIVE_INFINITY), [periodFiltered]);
  const perOrg = useMemo(() => computePerOrg(periodFiltered), [periodFiltered]);
  const recentTx = useMemo(() => computeRecentTransactions(allReceipts, Number.POSITIVE_INFINITY), [allReceipts]);

  return (
    <DashboardShell embedded={embedded} periodFilter={<PeriodFilter period={period} onPeriodChange={(nextPeriod) => void setPeriod(nextPeriod)} />}>
      {error ? (
        <DashboardError />
      ) : receipts === null ? (
        <DashboardSkeleton />
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-12"
        >
          <motion.div variants={itemVariants}>
            <KPISummary kpis={kpis} geoStats={geoStats} geoLoading={geoLoading} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <DonationsVolumeChart
              data={timeSeries}
              granularity={granularity}
              onGranularityChange={(nextGranularity) => void setGranularity(nextGranularity)}
            />
          </motion.div>
          <motion.div variants={itemVariants} className="flex flex-col gap-6 lg:flex-row">
            <div className="min-w-0 flex-1">
              <TopDonorsTable rows={topDonors} />
            </div>
            <div className="flex min-w-0 flex-col gap-6 lg:w-[42%]">
              <TopCountriesTable stats={geoStats} loading={geoLoading} />
              <OrganizationsTable rows={perOrg} />
            </div>
          </motion.div>
          <motion.div variants={itemVariants}>
            <RecentTransactionsTable rows={recentTx} />
          </motion.div>
        </motion.div>
      )}
    </DashboardShell>
  );
}

function DashboardShell({ children, periodFilter, embedded = false }: { children: React.ReactNode; periodFilter: React.ReactNode; embedded?: boolean }) {
  const t = useTranslations("marketplace.dashboard.hero");
  return (
    <section className={`bg-background pb-20 md:pb-28 ${embedded ? "" : "-mt-14"}`}>
      <PictureHero
        lightSrc="/assets/media/images/donations/donations-hero-light@2x.webp"
        darkSrc="/assets/media/images/donations/donations-hero-dark@2x.webp"
        imageAlt={t("imageAlt")}
        eyebrow={t("eyebrow")}
        icon={<BarChart3Icon />}
        title={t("title")}
        accent={t("accent")}
        lede={t("lede")}
        actions={periodFilter}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-6">
        {children}
      </div>
    </section>
  );
}

function useDashboardPeriod() {
  const [period, setPeriod] = useQueryState(
    "period",
    parseAsStringEnum<Period>(PERIOD_VALUES).withDefault("all").withOptions(QUERY_STATE_OPTIONS),
  );

  return { period, setPeriod };
}

function PeriodFilter({ period, onPeriodChange }: { period: Period; onPeriodChange: (period: Period) => void }) {
  const t = useTranslations("marketplace.dashboard.periods");
  return (
    <div className={PILL_GROUP}>
      {PERIODS.map((item) => {
        const active = period === item;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            onClick={() => onPeriodChange(item)}
            className={pillButton(active)}
          >
            {t(item)}
          </button>
        );
      })}
    </div>
  );
}

function KPISummary({ kpis, geoStats, geoLoading }: { kpis: DashboardKpis; geoStats: GeoStats; geoLoading: boolean }) {
  const t = useTranslations("marketplace.dashboard.kpis");
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
      <StatCard
        icon={<CoinsIcon className="h-4 w-4" />}
        label={t("totalDonated")}
        value={formatCompactUsd(kpis.totalRaised)}
      />
      <StatCard
        icon={<HandHeartIcon className="h-4 w-4" />}
        label={t("completedDonations")}
        value={formatCompact(kpis.totalDonations)}
      />
      <StatCard
        icon={<UsersRoundIcon className="h-4 w-4" />}
        label={t("donors")}
        value={formatCompact(kpis.uniqueDonors)}
      />
      <StatCard
        icon={<SproutIcon className="h-4 w-4" />}
        label={t("bumicertsWithDonations")}
        value={formatCompact(kpis.activeBumicerts)}
      />
      <StatCard
        icon={<GaugeIcon className="h-4 w-4" />}
        label={t("averageDonation")}
        value={formatCompactUsd(kpis.avgDonation)}
      />
      <StatCard
        icon={<GlobeIcon className="h-4 w-4" />}
        label={t("countriesWithBumicerts")}
        value={geoLoading ? "…" : formatCompact(geoStats.countriesRepresented)}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <StatsTile icon={icon} label={label} value={value} />;
}

function TopCountriesTable({ stats, loading }: { stats: GeoStats; loading: boolean }) {
  const t = useTranslations("marketplace.dashboard");
  const [expanded, setExpanded] = useState(false);
  const visibleCountries = expanded ? stats.topCountries : stats.topCountries.slice(0, DEFAULT_SECTION_LIMIT);

  return (
    <div className={`overflow-hidden ${SURFACE}`}>
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <GlobeIcon className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">
          {t("geo.topCountries")}
        </span>
      </div>

      {loading && stats.topCountries.length === 0 ? (
        <ul className="space-y-2 px-5 pb-5" aria-label={t("tables.loadingCountries")}> 
          {Array.from({ length: 5 }).map((_, index) => (
            <li key={index} className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Skeleton className="h-3 w-4 shrink-0" />
                <Skeleton className="h-3 w-2/3" />
              </span>
              <Skeleton className="h-3 w-20 shrink-0" />
            </li>
          ))}
        </ul>
      ) : stats.topCountries.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("geo.empty")}</p>
      ) : (
        <>
          <ul className="space-y-2 px-5 pb-5">
            {visibleCountries.map((country, index) => (
              <li key={country.countryCode} className="flex items-center justify-between gap-4 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <span className="w-4 shrink-0 text-right text-xs text-muted-foreground/50 tabular-nums">
                    {index + 1}
                  </span>
                  <span className="shrink-0">{country.emoji}</span>
                  <span className="truncate">{country.name}</span>
                </span>
                <span className="shrink-0 font-medium text-foreground tabular-nums">
                  {t("geo.organizationCount", { count: country.orgCount })}
                </span>
              </li>
            ))}
          </ul>
          <SectionLimitButton
            expanded={expanded}
            total={stats.topCountries.length}
            onToggle={() => setExpanded((current) => !current)}
          />
        </>
      )}
    </div>
  );
}

function DonationsVolumeChart({
  data,
  granularity,
  onGranularityChange,
}: {
  data: TimePoint[];
  granularity: TimeGranularity;
  onGranularityChange: (granularity: TimeGranularity) => void;
}) {
  const t = useTranslations("marketplace.dashboard.chart");
  const formatted = data.map((point) => ({
    ...point,
    label: formatChartDate(point.date, granularity),
  }));

  return (
    <div className={`${SURFACE} p-5`}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUpIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">
              {t("title")}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("raisedPer", { granularity })}</p>
        </div>
        <div className={PILL_GROUP}>
          {GRANULARITIES.map((item) => {
            const active = granularity === item;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={active}
                onClick={() => onGranularityChange(item)}
                className={pillButton(active)}
              >
                {t(`granularities.${item}`)}
              </button>
            );
          })}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="donationGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => formatCompactUsd(value)}
              width={48}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#donationGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "var(--primary)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; payload?: TimePoint }>; label?: string }) {
  const t = useTranslations("marketplace.dashboard.chart");
  if (!active || !payload?.length) return null;
  const amount = payload[0]?.value ?? 0;
  const count = payload[0]?.payload?.count ?? 0;
  return (
    <div className="rounded-xl bg-card/95 px-3 py-2 text-xs shadow-md shadow-primary/10 ring-1 ring-foreground/10 backdrop-blur">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-muted-foreground">{formatCompactUsd(amount)}</p>
      <p className="text-muted-foreground">{t("donationCount", { count })}</p>
    </div>
  );
}

function TopDonorsTable({ rows }: { rows: TopDonor[] }) {
  const t = useTranslations("marketplace.dashboard.tables");
  const [sortKey, setSortKey] = useQueryState(
    "donorSort",
    parseAsStringEnum<(typeof DONOR_SORT_KEYS)[number]>(DONOR_SORT_KEYS).withDefault("rank").withOptions(QUERY_STATE_OPTIONS),
  );
  const [sortDir, setSortDir] = useQueryState(
    "donorDir",
    parseAsStringEnum<"asc" | "desc">(SORT_DIRECTIONS).withDefault("asc").withOptions(QUERY_STATE_OPTIONS),
  );
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let compare = 0;
      if (sortKey === "rank") compare = a.rank - b.rank;
      else if (sortKey === "totalAmount") compare = a.totalAmount - b.totalAmount;
      else if (sortKey === "donationCount") compare = a.donationCount - b.donationCount;
      else compare = (a.lastDonatedAt ?? "").localeCompare(b.lastDonatedAt ?? "");
      return sortDir === "asc" ? compare : -compare;
    });
  }, [rows, sortDir, sortKey]);
  const visibleRows = expanded ? sorted : sorted.slice(0, DEFAULT_SECTION_LIMIT);

  const sort = (key: typeof sortKey) => {
    if (sortKey === key) {
      void setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      void setSortKey(key);
      void setSortDir("desc");
    }
  };

  return (
    <div className={`overflow-hidden ${SURFACE}`}>
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <UsersIcon className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">{t("topDonors")}</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("noDonations")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border/60">
                  <SortableCol col="rank" sortKey={sortKey} sortDir={sortDir} onSort={sort}>#</SortableCol>
                  <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{t("donor")}</th>
                  <SortableCol col="totalAmount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>{t("totalDonated")}</SortableCol>
                  <SortableCol col="donationCount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>{t("donations")}</SortableCol>
                  <SortableCol col="lastDonatedAt" sortKey={sortKey} sortDir={sortDir} onSort={sort}>{t("lastDonation")}</SortableCol>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.donorId} className="border-t border-border/40 transition-colors hover:bg-primary/[0.04]">
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.rank}</td>
                    <td className="px-3 py-2.5"><DonorCell id={row.donorId} type={row.donorType} /></td>
                    <td className="px-3 py-2.5 text-foreground tabular-nums">{formatCompactUsd(row.totalAmount)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{row.donationCount}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatTableDate(row.lastDonatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionLimitButton
            expanded={expanded}
            total={sorted.length}
            onToggle={() => setExpanded((current) => !current)}
          />
        </>
      )}
    </div>
  );
}

function OrganizationsTable({ rows }: { rows: OrgRow[] }) {
  const t = useTranslations("marketplace.dashboard.tables");
  const [sortKey, setSortKey] = useQueryState(
    "orgSort",
    parseAsStringEnum<(typeof ORG_SORT_KEYS)[number]>(ORG_SORT_KEYS).withDefault("totalRaised").withOptions(QUERY_STATE_OPTIONS),
  );
  const [sortDir, setSortDir] = useQueryState(
    "orgDir",
    parseAsStringEnum<"asc" | "desc">(SORT_DIRECTIONS).withDefault("desc").withOptions(QUERY_STATE_OPTIONS),
  );
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let compare = 0;
      if (sortKey === "totalRaised") compare = a.totalRaised - b.totalRaised;
      else if (sortKey === "bumicertCount") compare = a.bumicertCount - b.bumicertCount;
      else compare = a.donorCount - b.donorCount;
      return sortDir === "asc" ? compare : -compare;
    });
  }, [rows, sortDir, sortKey]);
  const visibleRows = expanded ? sorted : sorted.slice(0, DEFAULT_SECTION_LIMIT);

  const sort = (key: typeof sortKey) => {
    if (sortKey === key) {
      void setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      void setSortKey(key);
      void setSortDir("desc");
    }
  };

  return (
    <div className={`overflow-hidden ${SURFACE}`}>
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <BuildingIcon className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">{t("byOrganization")}</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("noDonations")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border/60">
                  <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{t("organization")}</th>
                  <SortableCol col="totalRaised" sortKey={sortKey} sortDir={sortDir} onSort={sort}>{t("totalRaised")}</SortableCol>
                  <SortableCol col="bumicertCount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>{t("bumicerts")}</SortableCol>
                  <SortableCol col="donorCount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>{t("donors")}</SortableCol>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.orgDid} className="border-t border-border/40 transition-colors hover:bg-primary/[0.04]">
                    <td className="px-3 py-2.5">
                      <PreferredAccountLink
                        did={row.orgDid}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-foreground transition-colors hover:text-primary"
                      >
                        <AuthorInline did={row.orgDid} />
                        <ExternalLinkIcon className="h-3 w-3 opacity-60" />
                      </PreferredAccountLink>
                    </td>
                    <td className="px-3 py-2.5 text-foreground tabular-nums">{formatCompactUsd(row.totalRaised)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{row.bumicertCount}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{row.donorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionLimitButton
            expanded={expanded}
            total={sorted.length}
            onToggle={() => setExpanded((current) => !current)}
          />
        </>
      )}
    </div>
  );
}

function RecentTransactionsTable({ rows }: { rows: TxRow[] }) {
  const t = useTranslations("marketplace.dashboard.tables");
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, DEFAULT_SECTION_LIMIT);
  const displaySummary = expanded || rows.length <= DEFAULT_SECTION_LIMIT ? t("showingAll") : t("showingLatest", { count: DEFAULT_SECTION_LIMIT });

  return (
    <div className={`overflow-hidden ${SURFACE}`}>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">{t("recentDonations")}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("allTimeDonations", { count: rows.length })}
          </p>
        </div>
        {rows.length > 0 && <span className="mt-1 shrink-0 text-[10px] text-muted-foreground/50">{displaySummary}</span>}
      </div>

      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("noDonations")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border/60">
                  <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{t("date")}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{t("donor")}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{t("amount")}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{t("bumicert")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.uri} className="border-t border-border/40 transition-colors hover:bg-primary/[0.04]">
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{formatTableDate(row.date)}</td>
                    <td className="px-3 py-2.5">
                      {row.donorId ? <DonorCell id={row.donorId} type={row.donorType ?? "wallet"} /> : <span className="text-xs text-foreground">{t("anonymous")}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-foreground tabular-nums">{formatUsd(row.amount)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      <BumicertLink uri={row.bumicertUri} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionLimitButton
            expanded={expanded}
            total={rows.length}
            onToggle={() => setExpanded((current) => !current)}
          />
        </>
      )}
    </div>
  );
}

function SectionLimitButton({ expanded, total, onToggle }: { expanded: boolean; total: number; onToggle: () => void }) {
  const t = useTranslations("marketplace.dashboard.tables");
  if (total <= DEFAULT_SECTION_LIMIT) return null;

  return (
    <div className="border-t border-border/40 px-5 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
      >
        {expanded ? t("showFirst", { count: DEFAULT_SECTION_LIMIT }) : t("showAll", { count: formatCompact(total) })}
      </button>
    </div>
  );
}

function SortableCol<T extends string>({
  col,
  sortKey,
  sortDir,
  onSort,
  children,
}: {
  col: T;
  sortKey: T;
  sortDir: "asc" | "desc";
  onSort: (col: T) => void;
  children: React.ReactNode;
}) {
  return (
    <th
      className="cursor-pointer px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase transition-colors select-none hover:text-foreground"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );
}

function SortIcon<T extends string>({ col, sortKey, sortDir }: { col: T; sortKey: T; sortDir: "asc" | "desc" }) {
  if (col !== sortKey) return <ChevronsUpDownIcon className="h-3 w-3 opacity-40" />;
  return sortDir === "asc" ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />;
}

function DonorCell({ id, type }: { id: string; type: "did" | "wallet" }) {
  const t = useTranslations("marketplace.dashboard.tables");
  if (type === "wallet") {
    return <span className="text-xs text-foreground">{t("anonymousSupporter")}</span>;
  }

  return (
    <PreferredAccountLink did={id} className="underline-offset-2 hover:underline">
      <AuthorInline did={id} />
    </PreferredAccountLink>
  );
}

function BumicertLink({ uri }: { uri: string | null }) {
  const t = useTranslations("marketplace.dashboard.tables");
  if (!uri) return <>—</>;
  const parsed = parseBumicertUri(uri);
  if (!parsed) return <>—</>;
  return (
    <PreferredBumicertLink did={parsed.did} rkey={parsed.rkey} className="text-primary hover:underline" title={t("viewBumicert")}>
      {t("view")}
    </PreferredBumicertLink>
  );
}

function parseBumicertUri(uri: string): { did: string; rkey: string } | null {
  const match = uri.match(/^at:\/\/(did:[^/]+)\/[^/]+\/(.+)$/);
  if (!match) return null;
  return { did: match[1], rkey: match[2] };
}

function formatChartDate(date: string, granularity: TimeGranularity): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  if (granularity === "month") return parsed.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTableDate(date: string | null | undefined): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function TableSkeleton() {
  // Mirrors the real table cards: an icon + uppercase label header (px-5 pt-5
  // pb-3), then rows separated by a hairline top border like the real <tr>s.
  return (
    <div className={`overflow-hidden ${SURFACE}`}>
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-4 rounded-sm" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 border-t border-border/40 px-3 py-2.5">
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-12">
      {/* KPI tiles — mirror StatsTile: icon chip + value on one row, label below. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="relative overflow-hidden rounded-2xl bg-foreground/5 p-4 sm:rounded-3xl sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <Skeleton className="size-4 shrink-0 rounded-sm sm:size-5" />
              <Skeleton className="h-7 w-24 sm:h-8" />
            </div>
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      {/* Donations volume chart — icon/label header, granularity pills, chart body. */}
      <div className={`${SURFACE} p-5`}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-9 w-56 rounded-full" />
        </div>
        <Skeleton className="h-[240px] w-full" />
      </div>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <TableSkeleton />
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:w-[42%]">
          <TableSkeleton />
          <TableSkeleton />
        </div>
      </div>
      <TableSkeleton />
    </div>
  );
}

function DashboardError() {
  const t = useTranslations("marketplace.dashboard.error");
  return (
    <div className={`mt-10 flex flex-col items-center gap-3 ${SURFACE} px-6 py-16 text-center`}>
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <BarChart3Icon className="size-8 opacity-60" />
      </div>
      <p
        className="text-3xl font-light text-foreground"
        style={{ fontFamily: "var(--font-garamond-var)" }}
      >
        {t("title")}
      </p>
      <p
        className="max-w-sm text-base text-foreground/70"
        style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
      >
        {t("description")}
      </p>
      <Link
        href="/donations"
        className="mt-3 rounded-full bg-primary px-5 py-2.5 text-[13.5px] font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90"
      >
        {t("action")}
      </Link>
    </div>
  );
}
