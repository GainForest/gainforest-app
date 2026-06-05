"use client";

import Link from "next/link";
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
  DollarSignIcon,
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
import { accountHref, bumicertHref } from "../_lib/urls";
import { formatNumber, formatUsd, shortWallet } from "../_lib/format";
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
        <div className="flex flex-col gap-12">
          <KPISummary kpis={kpis} />
          <GeographicReach stats={geoStats} />
          <DonationsVolumeChart
            data={timeSeries}
            granularity={granularity}
            onGranularityChange={setGranularity}
          />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <TopDonorsTable rows={topDonors} />
            <OrganizationsTable rows={perOrg} />
          </div>
          <RecentTransactionsTable rows={recentTx} />
        </div>
      )}
    </DashboardShell>
  );
}

function DashboardShell({ children, periodFilter }: { children: React.ReactNode; periodFilter: React.ReactNode }) {
  return (
    <section className="-mt-14 bg-background pb-20 md:pb-28">
      <PictureHero
        lightSrc="/assets/media/images/donations/donations-hero-light.png"
        darkSrc="/assets/media/images/donations/donations-hero-dark.png"
        imageAlt="Misty regenerative landscape for donations analytics"
        eyebrow="Platform Analytics"
        icon={<BarChart3Icon />}
        title="Donations"
        accent="Dashboard"
        lede="Track platform-wide giving across Bumicerts: total raised, donor activity, geographic reach, funding trends, and recent transactions."
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
    <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 p-1">
      {PERIODS.map((item) => {
        const active = period === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onPeriodChange(item.id)}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium transition-all duration-200",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        icon={<DollarSignIcon className="h-4 w-4" />}
        label="Total Raised"
        value={formatUsd(kpis.totalRaised)}
        sub="All USD donations"
      />
      <StatCard
        icon={<HashIcon className="h-4 w-4" />}
        label="Total Donations"
        value={formatNumber(kpis.totalDonations)}
        sub="Receipts recorded"
      />
      <StatCard
        icon={<UsersIcon className="h-4 w-4" />}
        label="Unique Donors"
        value={formatNumber(kpis.uniqueDonors)}
        sub="By DID or wallet"
      />
      <StatCard
        icon={<TrendingUpIcon className="h-4 w-4" />}
        label="Avg Donation"
        value={formatUsd(kpis.avgDonation)}
        sub="Per transaction"
      />
      <StatCard
        icon={<LayoutGridIcon className="h-4 w-4" />}
        label="Active Bumicerts"
        value={formatNumber(kpis.activeBumicerts)}
        sub="Have received funds"
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
        label="Geographic Reach"
        value={formatNumber(stats.countriesRepresented)}
        detail="Countries represented"
        accent
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-background">
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
    <div className="rounded-2xl border border-border bg-background p-5">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUpIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">
              Donation Volume Over Time
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">USD raised per {granularity}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 p-1">
          {GRANULARITIES.map((item) => {
            const active = granularity === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => onGranularityChange(item)}
                className={[
                  "rounded-full px-3 py-1 text-xs font-medium transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
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
              tickFormatter={(value: number) => (value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value}`)}
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
    <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-muted-foreground">{formatUsd(amount)}</p>
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
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
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
              <tr className="border-t border-border">
                <SortableCol col="rank" sortKey={sortKey} sortDir={sortDir} onSort={sort}>#</SortableCol>
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Donor</th>
                <SortableCol col="totalAmount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Total Donated</SortableCol>
                <SortableCol col="donationCount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Donations</SortableCol>
                <SortableCol col="lastDonatedAt" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Last Donation</SortableCol>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.donorId} className="border-t border-border/50 transition-colors hover:bg-muted/20">
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.rank}</td>
                  <td className="px-3 py-2.5"><DonorCell id={row.donorId} type={row.donorType} /></td>
                  <td className="px-3 py-2.5 text-foreground tabular-nums">{formatUsd(row.totalAmount)}</td>
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
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
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
              <tr className="border-t border-border">
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Organization</th>
                <SortableCol col="totalRaised" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Total Raised</SortableCol>
                <SortableCol col="bumicertCount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Bumicerts</SortableCol>
                <SortableCol col="donorCount" sortKey={sortKey} sortDir={sortDir} onSort={sort}>Donors</SortableCol>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.orgDid} className="border-t border-border/50 transition-colors hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <Link
                      href={accountHref(row.orgDid)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-foreground transition-colors hover:text-primary"
                      title={row.orgDid}
                    >
                      {truncateDid(row.orgDid)}
                      <ExternalLinkIcon className="h-3 w-3 opacity-60" />
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-foreground tabular-nums">{formatUsd(row.totalRaised)}</td>
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
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">Recent Transactions</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            All time · {rows.length} {rows.length === 1 ? "donation" : "donations"}
          </p>
        </div>
        <span className="mt-1 shrink-0 text-[10px] text-muted-foreground/50">showing latest 50</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">No transactions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border">
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Donor</th>
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Bumicert</th>
                <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.uri} className="border-t border-border/50 transition-colors hover:bg-muted/20">
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{formatTableDate(row.date)}</td>
                  <td className="px-3 py-2.5">
                    {row.donorId ? <DonorCell id={row.donorId} type={row.donorType ?? "wallet"} /> : <span className="text-xs text-foreground">Anonymous</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-foreground tabular-nums">{formatUsd(row.amount)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    <BumicertLink uri={row.bumicertUri} />
                  </td>
                  <td className="px-3 py-2.5">
                    {row.txUrl && row.txHash ? (
                      <Link
                        href={row.txUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                        title={row.txHash}
                      >
                        {`${row.txHash.slice(0, 8)}…${row.txHash.slice(-6)}`}
                        <ExternalLinkIcon className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
    return <span className="text-xs text-foreground" title={id}>Anonymous ({shortWallet(id)})</span>;
  }

  return (
    <Link href={accountHref(id)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
      <AuthorInline did={id} />
    </Link>
  );
}

function BumicertLink({ uri }: { uri: string | null }) {
  if (!uri) return <>—</>;
  const parsed = parseBumicertUri(uri);
  if (!parsed) return <>—</>;
  return (
    <Link href={bumicertHref(parsed.did, parsed.rkey)} target="_blank" rel="noreferrer" className="text-primary hover:underline" title="View bumicert">
      {parsed.rkey}
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

function truncateDid(did: string): string {
  const parts = did.split(":");
  const last = parts[parts.length - 1] ?? "";
  return `${parts.slice(0, 2).join(":")}:…${last.slice(-8)}`;
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

function KPICardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-5">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-background p-5">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <KPICardSkeleton key={index} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <KPICardSkeleton />
        <div className="space-y-3 rounded-2xl border border-border bg-background p-5">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </div>
      </div>
      <div className="space-y-4 rounded-2xl border border-border bg-background p-5">
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
    <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <div
        className="text-[22px] text-foreground"
        style={{ fontFamily: "var(--font-garamond-var)" }}
      >
        Donation data is unavailable
      </div>
      <p className="mt-2 max-w-[420px] text-sm leading-[1.5] text-muted-foreground">
        The indexer did not return funding receipts. View the live figures on the Bumicerts dashboard instead.
      </p>
      <Link
        href="https://certs.gainforest.app/dashboard"
        target="_blank"
        rel="noreferrer"
        className="mt-5 rounded-full bg-primary px-5 py-2.5 text-[13.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Open Bumicerts dashboard ↗
      </Link>
    </div>
  );
}
