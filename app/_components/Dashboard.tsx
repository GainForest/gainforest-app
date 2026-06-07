"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
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
  HandHeartIcon,
  ExternalLinkIcon,
  GlobeIcon,
  HashIcon,
  LayoutGridIcon,
  TrendingUpIcon,
  UsersIcon,
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
import { accountHref, localBumicertHref } from "../_lib/urls";
import { formatCompact, formatCompactUsd, formatNumber, formatUsd } from "../_lib/format";
import { AuthorInline } from "./AuthorChip";
import { StatsTile } from "./StatsTile";
import { PictureHero } from "./PictureHero";

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "all", label: "All Time" },
  { id: "month", label: "Past 30 Days" },
  { id: "week", label: "Past 7 Days" },
];

const GRANULARITIES: TimeGranularity[] = ["day", "week", "month"];

const GRANULARITY_LABELS: Record<TimeGranularity, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

// Shared surface treatment matching the app's modern pages (leaderboard, explorer):
// soft card tint, primary-tinted shadow, hairline ring, and backdrop blur.
const SURFACE =
  "rounded-3xl bg-card/70 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur";
const PILL_GROUP =
  "flex items-center gap-1 rounded-full bg-muted/55 p-1 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur";

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

export function Dashboard() {
  const { period, setPeriod } = useDashboardPeriod();
  const [granularity, setGranularity] = useState<TimeGranularity>("day");
  const [receipts, setReceipts] = useState<Awaited<ReturnType<typeof fetchReceipts>> | null>(null);
  const [orgCountryMap, setOrgCountryMap] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    Promise.all([fetchReceipts(controller.signal), fetchOrgCountryMap(controller.signal)])
      .then(([nextReceipts, nextOrgCountryMap]) => {
        if (cancelled) return;
        setReceipts(nextReceipts);
        setOrgCountryMap(nextOrgCountryMap);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError" || cancelled) return;
        setError(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const allReceipts = receipts ?? [];
  const periodFiltered = useMemo(() => filterByPeriod(allReceipts, period), [allReceipts, period]);
  const kpis = useMemo(() => computeKpis(periodFiltered), [periodFiltered]);
  const geoStats = useMemo(() => computeGeoStats(orgCountryMap), [orgCountryMap]);
  const timeSeries = useMemo(
    () => computeTimeSeries(periodFiltered, granularity),
    [periodFiltered, granularity],
  );
  const topDonors = useMemo(() => computeTopDonors(periodFiltered, 50), [periodFiltered]);
  const perOrg = useMemo(() => computePerOrg(periodFiltered), [periodFiltered]);
  const recentTx = useMemo(() => computeRecentTransactions(allReceipts, 50), [allReceipts]);

  return (
    <DashboardShell periodFilter={<PeriodFilter period={period} onPeriodChange={setPeriod} />}>
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
            <KPISummary kpis={kpis} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <GeographicReach stats={geoStats} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <DonationsVolumeChart
              data={timeSeries}
              granularity={granularity}
              onGranularityChange={setGranularity}
            />
          </motion.div>
          <motion.div variants={itemVariants} className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <TopDonorsTable rows={topDonors} />
            <OrganizationsTable rows={perOrg} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <RecentTransactionsTable rows={recentTx} />
          </motion.div>
        </motion.div>
      )}
    </DashboardShell>
  );
}

function DashboardShell({ children, periodFilter }: { children: React.ReactNode; periodFilter: React.ReactNode }) {
  return (
    <section className="-mt-14 bg-background pb-20 md:pb-28">
      <PictureHero
        lightSrc="/assets/media/images/donations/donations-hero-light@2x.webp"
        darkSrc="/assets/media/images/donations/donations-hero-dark@2x.webp"
        imageAlt="Misty regenerative landscape for donation activity"
        eyebrow="Giving Activity"
        icon={<BarChart3Icon />}
        title="Donations"
        accent="Overview"
        lede="Track giving across Bumicerts: total raised, supporter activity, places reached, funding trends, and recent gifts."
        actions={periodFilter}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-6">
        {children}
      </div>
    </section>
  );
}

function useDashboardPeriod() {
  const [period, setPeriodState] = useState<Period>("all");
  const firstUrlSyncRef = useRef(true);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("period");
    if (value === "month" || value === "week" || value === "all") {
      setPeriodState(value);
    }
  }, []);

  useEffect(() => {
    if (firstUrlSyncRef.current) {
      firstUrlSyncRef.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (period === "all") params.delete("period");
    else params.set("period", period);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [period]);

  return { period, setPeriod: setPeriodState };
}

function PeriodFilter({ period, onPeriodChange }: { period: Period; onPeriodChange: (period: Period) => void }) {
  return (
    <div className={PILL_GROUP}>
      {PERIODS.map((item) => {
        const active = period === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onPeriodChange(item.id)}
            className={pillButton(active)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function KPISummary({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      <StatCard
        icon={<HandHeartIcon className="h-4 w-4" />}
        label="Total Raised"
        value={formatCompactUsd(kpis.totalRaised)}
        sub="Raised from completed gifts"
      />
      <StatCard
        icon={<HashIcon className="h-4 w-4" />}
        label="Total Donations"
        value={formatCompact(kpis.totalDonations)}
        sub="Completed gifts"
      />
      <StatCard
        icon={<UsersIcon className="h-4 w-4" />}
        label="Supporters"
        value={formatCompact(kpis.uniqueDonors)}
        sub="Supporters counted"
      />
      <StatCard
        icon={<TrendingUpIcon className="h-4 w-4" />}
        label="Average Gift"
        value={formatCompactUsd(kpis.avgDonation)}
        sub="Average gift size"
      />
      <StatCard
        icon={<LayoutGridIcon className="h-4 w-4" />}
        label="Active Bumicerts"
        value={formatCompact(kpis.activeBumicerts)}
        sub="Bumicerts with funding"
      />
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return <StatsTile icon={icon} label={label} value={value} detail={sub} accent={label === "Total Raised" || label === "Active Bumicerts"} />;
}

function GeographicReach({ stats }: { stats: GeoStats }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
      <StatsTile
        icon={<GlobeIcon />}
        label="Places Reached"
        value={formatCompact(stats.countriesRepresented)}
        detail="Countries with organizations"
        accent
      />

      <div className={`overflow-hidden ${SURFACE}`}>
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <GlobeIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">
            Top Countries
          </span>
        </div>

        {stats.topCountries.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">No geographic data available.</p>
        ) : (
          <ul className="space-y-2 px-5 pb-5">
            {stats.topCountries.map((country, index) => (
              <li key={country.countryCode} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="w-4 text-right text-xs text-muted-foreground/50 tabular-nums">
                    {index + 1}
                  </span>
                  <span>{country.emoji}</span>
                  <span>{country.name}</span>
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {country.orgCount} {country.orgCount === 1 ? "organization" : "organizations"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
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
              Giving Over Time
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">USD raised per {granularity}</p>
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
                {GRANULARITY_LABELS[item]}
              </button>
            );
          })}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          No donation data for this period.
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
  if (!active || !payload?.length) return null;
  const amount = payload[0]?.value ?? 0;
  const count = payload[0]?.payload?.count ?? 0;
  return (
    <div className="rounded-xl bg-card/95 px-3 py-2 text-xs shadow-md shadow-primary/10 ring-1 ring-foreground/10 backdrop-blur">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-muted-foreground">{formatCompactUsd(amount)}</p>
      <p className="text-muted-foreground">{count} {count === 1 ? "donation" : "donations"}</p>
    </div>
  );
}

function TopDonorsTable({ rows }: { rows: TopDonor[] }) {
  const [sortKey, setSortKey] = useState<"rank" | "totalAmount" | "donationCount" | "lastDonatedAt">("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  const sort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className={`overflow-hidden ${SURFACE}`}>
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <UsersIcon className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">Top Donors</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">No donations yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border/60">
                <SortableCol col="rank" sortKey={sortKey} sortDir={sortDir} onSort={sort}>#</SortableCol>
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Donor</th>
                <SortableCol col="totalAmount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Total Donated</SortableCol>
                <SortableCol col="donationCount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Donations</SortableCol>
                <SortableCol col="lastDonatedAt" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Last Donation</SortableCol>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
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
      )}
    </div>
  );
}

function OrganizationsTable({ rows }: { rows: OrgRow[] }) {
  const [sortKey, setSortKey] = useState<"totalRaised" | "bumicertCount" | "donorCount">("totalRaised");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let compare = 0;
      if (sortKey === "totalRaised") compare = a.totalRaised - b.totalRaised;
      else if (sortKey === "bumicertCount") compare = a.bumicertCount - b.bumicertCount;
      else compare = a.donorCount - b.donorCount;
      return sortDir === "asc" ? compare : -compare;
    });
  }, [rows, sortDir, sortKey]);

  const sort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className={`overflow-hidden ${SURFACE}`}>
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <BuildingIcon className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">By Organization</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">No donations yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border/60">
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Organization</th>
                <SortableCol col="totalRaised" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Total Raised</SortableCol>
                <SortableCol col="bumicertCount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Bumicerts</SortableCol>
                <SortableCol col="donorCount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Donors</SortableCol>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.orgDid} className="border-t border-border/40 transition-colors hover:bg-primary/[0.04]">
                  <td className="px-3 py-2.5">
                    <Link
                      href={accountHref(row.orgDid)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-foreground transition-colors hover:text-primary"
                    >
                      <AuthorInline did={row.orgDid} />
                      <ExternalLinkIcon className="h-3 w-3 opacity-60" />
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-foreground tabular-nums">{formatCompactUsd(row.totalRaised)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{row.bumicertCount}</td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{row.donorCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecentTransactionsTable({ rows }: { rows: TxRow[] }) {
  return (
    <div className={`overflow-hidden ${SURFACE}`}>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">Recent Gifts</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            All time · {rows.length} {rows.length === 1 ? "donation" : "donations"}
          </p>
        </div>
        <span className="mt-1 shrink-0 text-[10px] text-muted-foreground/50">showing latest 50</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">No gifts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border/60">
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Donor</th>
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Bumicert</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.uri} className="border-t border-border/40 transition-colors hover:bg-primary/[0.04]">
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{formatTableDate(row.date)}</td>
                  <td className="px-3 py-2.5">
                    {row.donorId ? <DonorCell id={row.donorId} type={row.donorType ?? "wallet"} /> : <span className="text-xs text-foreground">Anonymous</span>}
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
      )}
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
  if (type === "wallet") {
    return <span className="text-xs text-foreground">Anonymous wallet</span>;
  }

  return (
    <Link href={accountHref(id)} className="underline-offset-2 hover:underline">
      <AuthorInline did={id} />
    </Link>
  );
}

function BumicertLink({ uri }: { uri: string | null }) {
  if (!uri) return <>—</>;
  const parsed = parseBumicertUri(uri);
  if (!parsed) return <>—</>;
  return (
    <Link href={localBumicertHref(parsed.did, parsed.rkey)} className="text-primary hover:underline" title="View bumicert">
      View
    </Link>
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

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

function TableSkeleton() {
  return (
    <div className={`space-y-3 ${SURFACE} p-5`}>
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-12">
      <div className={`space-y-3 ${SURFACE} p-5`}>
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-5 w-full" />
        ))}
      </div>
      <div className={`space-y-4 ${SURFACE} p-5`}>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-[240px] w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TableSkeleton />
        <TableSkeleton />
      </div>
      <TableSkeleton />
    </div>
  );
}

function DashboardError() {
  return (
    <div className={`mt-10 flex flex-col items-center gap-3 ${SURFACE} px-6 py-16 text-center`}>
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <BarChart3Icon className="size-8 opacity-60" />
      </div>
      <p
        className="text-3xl font-light text-foreground"
        style={{ fontFamily: "var(--font-garamond-var)" }}
      >
        Donation data is unavailable
      </p>
      <p
        className="max-w-sm text-base text-foreground/70"
        style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
      >
        We could not load donation information. Try again in a moment.
      </p>
      <Link
        href="/donations"
        className="mt-3 rounded-full bg-primary px-5 py-2.5 text-[13.5px] font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90"
      >
        Open donations overview
      </Link>
    </div>
  );
}
