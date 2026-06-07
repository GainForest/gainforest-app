"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowDownWideNarrowIcon,
  ChevronRightIcon,
  CrownIcon,
  LeafIcon,
  SparklesIcon,
  SproutIcon,
  TrophyIcon,
  UserRoundCheckIcon,
  UserRoundXIcon,
  UsersRoundIcon,
  WalletIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AuthorInline } from "../_components/AuthorChip";
import { fetchReceipts, type FundingReceipt } from "../_lib/dashboard";
import { formatCompact, formatCompactUsd } from "../_lib/format";
import { accountHref } from "../_lib/urls";

type Period = "all" | "month" | "week";
type DonorFilter = "all" | "anonymous" | "known";
type SortMode = "total-raised" | "donation-count" | "recent-donation";

type LeaderboardEntry = {
  rank: number;
  donorId: string;
  donorType: "did" | "wallet";
  totalAmount: number;
  donationCount: number;
  lastDonatedAt: string | null;
};

type LeaderboardResult = {
  entries: LeaderboardEntry[];
  totalDonorsCount: number;
  totalAmountSum: number;
  totalProjectsSupported: number;
};

const PERIODS: Period[] = ["all", "month", "week"];
const DONOR_FILTERS: Array<{ value: DonorFilter; Icon: typeof UsersRoundIcon; label: string }> = [
  { value: "all", Icon: UsersRoundIcon, label: "All Donors" },
  { value: "anonymous", Icon: UserRoundXIcon, label: "Anonymous Only" },
  { value: "known", Icon: UserRoundCheckIcon, label: "Known Only" },
];
const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "total-raised", label: "Total Raised" },
  { value: "donation-count", label: "Donation Count" },
  { value: "recent-donation", label: "Recent Donation" },
];
const PERIOD_LABELS: Record<Period, string> = {
  all: "All Time",
  month: "This Month",
  week: "This Week",
};

export function LeaderboardClient() {
  const [receipts, setReceipts] = useState<FundingReceipt[] | null>(null);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<Period>("all");
  const [donorFilter, setDonorFilter] = useState<DonorFilter>("all");
  const [sortBy, setSortBy] = useState<SortMode>("total-raised");
  const firstUrlSyncRef = useRef(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextPeriod = params.get("period");
    const nextDonorFilter = params.get("donors");
    const nextSort = params.get("sort");
    if (isPeriod(nextPeriod)) setPeriod(nextPeriod);
    if (isDonorFilter(nextDonorFilter)) setDonorFilter(nextDonorFilter);
    if (isSortMode(nextSort)) setSortBy(nextSort);
  }, []);

  useEffect(() => {
    if (firstUrlSyncRef.current) {
      firstUrlSyncRef.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (period !== "all") params.set("period", period);
    if (donorFilter !== "all") params.set("donors", donorFilter);
    if (sortBy !== "total-raised") params.set("sort", sortBy);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [period, donorFilter, sortBy]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchReceipts(controller.signal)
      .then((items) => {
        if (!cancelled) setReceipts(items);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const leaderboard = useMemo(() => {
    if (!receipts) return null;
    return aggregateToLeaderboard(receipts, { period, limit: 100, donorFilter, sortBy });
  }, [receipts, period, donorFilter, sortBy]);

  return (
    <LeaderboardShell
      animate={false}
      period={period}
      onPeriodChange={setPeriod}
      donorFilter={donorFilter}
      onDonorFilterChange={setDonorFilter}
      sortBy={sortBy}
      onSortChange={setSortBy}
      loading={receipts === null && !error}
      totalDonors={leaderboard?.totalDonorsCount ?? 0}
      totalRaised={leaderboard?.totalAmountSum ?? 0}
      totalProjectsSupported={leaderboard?.totalProjectsSupported ?? 0}
    >
      {error ? (
        <LeaderboardError />
      ) : receipts === null ? (
        <LeaderboardSkeleton />
      ) : (
        <LeaderboardGrid entries={leaderboard?.entries ?? []} />
      )}
    </LeaderboardShell>
  );
}

function PeriodChips({ period, onPeriodChange }: { period: Period; onPeriodChange: (period: Period) => void }) {
  return (
    <div className="grid h-12 grid-cols-3 rounded-full bg-muted/55 p-1 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
      {PERIODS.map((option) => {
        const isSelected = period === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onPeriodChange(option)}
            className={cn(
              "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-all duration-200",
              isSelected
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {PERIOD_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

function DonorTypeTabs({
  donorFilter,
  onDonorFilterChange,
}: {
  donorFilter: DonorFilter;
  onDonorFilterChange: (donorFilter: DonorFilter) => void;
}) {
  return (
    <div className="grid grid-cols-1 rounded-full bg-muted/55 p-1 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur sm:h-12 sm:grid-cols-3">
      {DONOR_FILTERS.map(({ value, Icon, label }) => {
        const isSelected = donorFilter === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onDonorFilterChange(value)}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-all duration-200",
              isSelected
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SortControl({ sortBy, onSortChange }: { sortBy: SortMode; onSortChange: (sortBy: SortMode) => void }) {
  return (
    <div className="flex h-12 items-center justify-between gap-3 rounded-full bg-muted/55 py-1.5 pr-1.5 pl-4 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
      <span
        id="leaderboard-sort-label"
        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium text-muted-foreground"
      >
        <ArrowDownWideNarrowIcon className="size-4" />
        Sort by
      </span>
      <select
        aria-labelledby="leaderboard-sort-label"
        value={sortBy}
        onChange={(event) => {
          if (isSortMode(event.target.value)) onSortChange(event.target.value);
        }}
        className="h-9 min-w-[10.5rem] cursor-pointer rounded-full border-0 bg-transparent px-3 text-sm font-medium text-foreground shadow-none outline-none focus-visible:ring-0"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-foreground/5 p-4 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-foreground/[0.07] sm:rounded-3xl sm:p-6">
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/10 transition-transform duration-300 group-hover:scale-105 sm:size-7 [&_svg]:size-3 sm:[&_svg]:size-3.5">
            {icon}
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-xs sm:tracking-[0.16em]">{label}</p>
        </div>
        <div
          className={cn(
            "mt-2 text-2xl font-semibold tracking-[-0.02em] tabular-nums sm:mt-3 sm:text-3xl",
            accent ? "text-primary" : "text-foreground",
          )}
        >
          {value}
        </div>
        <p className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm sm:leading-normal">{detail}</p>
      </div>
    </div>
  );
}

function HeroLandscapeArt() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[22rem] overflow-hidden">
      <Image
        src="/assets/media/images/leaderboard/hero-landscape-light.png"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 1152px, calc(100vw - 48px)"
        aria-hidden="true"
        className="object-cover object-center opacity-90 dark:hidden"
      />
      <Image
        src="/assets/media/images/leaderboard/hero-landscape-dark.png"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 1152px, calc(100vw - 48px)"
        aria-hidden="true"
        className="hidden object-cover object-center opacity-80 dark:block"
      />
      <div className="absolute inset-y-0 left-0 w-[54%] bg-gradient-to-r from-background via-background/90 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background via-background/80 to-transparent" />
    </div>
  );
}

function StatsSummary({
  totalDonors,
  totalRaised,
  totalProjectsSupported,
  loading,
}: {
  totalDonors: number;
  totalRaised: number;
  totalProjectsSupported: number;
  loading: boolean;
}) {
  if (loading) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      <StatCard
        label="Total Raised"
        value={formatCompactUsd(totalRaised)}
        detail="All time across the platform"
        icon={<LeafIcon className="size-8" />}
        accent
      />
      <StatCard
        label="Total Donors"
        value={formatCompact(totalDonors)}
        detail="Generous impact champions"
        icon={<UsersRoundIcon className="size-8" />}
      />
      <StatCard
        label="Projects Supported"
        value={formatCompact(totalProjectsSupported)}
        detail="Restoring ecosystems & livelihoods"
        icon={<SproutIcon className="size-8" />}
        accent
      />
    </div>
  );
}

function LeaderboardShell({
  animate = true,
  period = "all",
  onPeriodChange,
  donorFilter = "all",
  onDonorFilterChange,
  sortBy = "total-raised",
  onSortChange,
  totalDonors = 0,
  totalRaised = 0,
  totalProjectsSupported = 0,
  loading = false,
  children,
}: {
  animate?: boolean;
  period?: Period;
  onPeriodChange: (period: Period) => void;
  donorFilter?: DonorFilter;
  onDonorFilterChange: (donorFilter: DonorFilter) => void;
  sortBy?: SortMode;
  onSortChange: (sortBy: SortMode) => void;
  totalDonors?: number;
  totalRaised?: number;
  totalProjectsSupported?: number;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="relative -mt-14 overflow-hidden pb-20 pt-0 md:pb-28">
      <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/[0.08] via-transparent to-transparent dark:from-primary/[0.12]" />
      <HeroLandscapeArt />

      <div className="relative min-h-[330px]">
        <motion.header
          initial={animate ? { opacity: 0, y: 16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="mx-auto mb-0 flex max-w-6xl flex-col px-8 pb-14 pt-[86px] sm:px-10 lg:px-9"
        >
          <div className="mb-5 flex items-center gap-2.5">
            <TrophyIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Leaderboard</span>
          </div>
          <h1 className="font-garamond max-w-4xl text-4xl font-light leading-[0.98] tracking-[-0.035em] text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            Impact <span className="font-instrument italic text-foreground/85">Champions</span>
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
            Celebrating the generous contributors driving regenerative change for communities and the planet.
          </p>
        </motion.header>
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="relative z-20 -mt-6 mb-0 space-y-3">
          <motion.div
            initial={animate ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
            className="mb-5 rounded-3xl bg-background/65 p-2 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur-xl"
          >
            <div className="grid gap-3 xl:grid-cols-[1fr_1.15fr_auto] xl:items-center">
              <PeriodChips period={period} onPeriodChange={onPeriodChange} />
              <DonorTypeTabs donorFilter={donorFilter} onDonorFilterChange={onDonorFilterChange} />
              <SortControl sortBy={sortBy} onSortChange={onSortChange} />
            </div>
          </motion.div>

          <motion.div
            initial={animate ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
            className="mb-5"
          >
            <StatsSummary
              totalDonors={totalDonors}
              totalRaised={totalRaised}
              totalProjectsSupported={totalProjectsSupported}
              loading={loading}
            />
          </motion.div>

          {children}
        </div>
      </div>
    </section>
  );
}

function LeaderboardGrid({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-card/75 py-16 text-center text-muted-foreground shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <TrophyIcon className="size-8 opacity-60" />
        </div>
        <p className="font-garamond text-3xl font-light text-foreground">No donations yet</p>
        <p className="font-instrument max-w-sm text-base italic text-foreground/70">Be the first to make an impact.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-card/70 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur divide-y divide-border/60">
      {entries.map((entry, index) => (
        <DonorCard key={entry.donorId} entry={entry} index={index} />
      ))}
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl bg-card/70 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 divide-y divide-border/60">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-4 sm:gap-5 sm:px-5"
        >
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="size-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-44 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <div className="text-right">
            <Skeleton className="ml-auto h-5 w-28" />
          </div>
          <Skeleton className="size-9 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

function LeaderboardError() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-card/75 py-16 text-center text-muted-foreground shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <TrophyIcon className="size-8 opacity-60" />
      </div>
      <p className="font-garamond text-3xl font-light text-foreground">Could not load leaderboard</p>
      <p className="font-instrument max-w-sm text-base italic text-foreground/70">Please try again in a moment.</p>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const medals = ["", "🥇", "🥈", "🥉"];
    return (
      <span
        className="flex size-10 items-center justify-center rounded-full bg-gradient-to-b from-primary/10 to-background text-2xl shadow-sm ring-1 ring-foreground/5"
        role="img"
        aria-label={`Rank ${rank}`}
      >
        {medals[rank]}
      </span>
    );
  }

  return (
    <span className="flex size-10 items-center justify-center rounded-full bg-card text-base font-medium tabular-nums text-muted-foreground shadow-sm ring-1 ring-foreground/5">
      {rank}
    </span>
  );
}

function DonorBadges({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <CrownIcon className="size-3.5" />
          Top Donor
        </span>
        <span className="hidden items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary sm:inline-flex">
          <LeafIcon className="size-3.5" />
          Nature Champion
        </span>
      </div>
    );
  }

  if (rank === 2) {
    return (
      <div className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <SparklesIcon className="size-3.5" />
          Consistent Giver
        </span>
      </div>
    );
  }

  if (rank === 3) {
    return (
      <div className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <SparklesIcon className="size-3.5" />
          Rising Supporter
        </span>
      </div>
    );
  }

  return null;
}

function DonorCard({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const relativeTime = entry.lastDonatedAt ? formatRelativeTimeFromNow(new Date(entry.lastDonatedAt)) : null;
  const isWallet = entry.donorType === "wallet";
  const actionHref = isWallet ? basescanAddress(entry.donorId) : accountHref(entry.donorId);
  const walletLabel = "Anonymous wallet";
  const actionLabel = isWallet ? "Open wallet details" : "Open supporter profile in a new tab";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, delay: Math.min(index, 12) * 0.025, ease: [0.25, 0.1, 0.25, 1] }}
      className="group grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-4 transition-colors duration-200 hover:bg-card/65 sm:gap-5 sm:px-5"
    >
      <div className="flex items-center justify-center">
        <RankBadge rank={entry.rank} />
      </div>

      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground ring-1 ring-foreground/5",
          !isWallet && "bg-primary/10 text-primary ring-primary/10",
        )}
      >
        {isWallet ? <WalletIcon className="size-5" /> : <UserRoundCheckIcon className="size-5" />}
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {isWallet ? (
            <span className="truncate text-sm font-semibold text-foreground sm:text-base">
              {walletLabel}
            </span>
          ) : (
            <span className="min-w-0 max-w-full text-sm font-semibold text-foreground sm:text-base">
              <AuthorInline did={entry.donorId} />
            </span>
          )}
          <DonorBadges rank={entry.rank} />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
          {donationSummary(entry.donationCount, relativeTime)}
        </p>
      </div>

      <div className="text-right">
        <div className="whitespace-nowrap text-base font-bold tabular-nums text-primary sm:text-lg">
          {formatCompactUsd(entry.totalAmount)}
        </div>
      </div>

      <a
        href={actionHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={actionLabel}
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRightIcon className="size-5" aria-hidden="true" />
      </a>
    </motion.div>
  );
}

function aggregateToLeaderboard(
  receipts: FundingReceipt[],
  options: { period: Period; limit: number; donorFilter: DonorFilter; sortBy: SortMode },
): LeaderboardResult {
  const filtered = filterByPeriod(receipts, options.period);
  const usdOnly = filtered.filter((receipt) => ["USD", "USDC"].includes(receipt.currency.toUpperCase()));
  const donorMap = new Map<
    string,
    { type: "did" | "wallet"; totalAmount: number; donationCount: number; lastDonatedAt: string | null }
  >();
  const projectUris = new Set<string>();

  for (const receipt of usdOnly) {
    const donor = receipt.from;
    if (!donor || !donorMatchesFilter(donor.type, options.donorFilter)) continue;
    if (receipt.bumicertUri) projectUris.add(receipt.bumicertUri);

    const existing = donorMap.get(donor.id);
    if (existing) {
      existing.totalAmount += receipt.amount;
      existing.donationCount += 1;
      if (receipt.occurredAt && (!existing.lastDonatedAt || receipt.occurredAt > existing.lastDonatedAt)) {
        existing.lastDonatedAt = receipt.occurredAt;
      }
    } else {
      donorMap.set(donor.id, {
        type: donor.type,
        totalAmount: receipt.amount,
        donationCount: 1,
        lastDonatedAt: receipt.occurredAt,
      });
    }
  }

  const sorted = Array.from(donorMap.entries())
    .map(([donorId, data]) => ({
      donorId,
      donorType: data.type,
      totalAmount: data.totalAmount,
      donationCount: data.donationCount,
      lastDonatedAt: data.lastDonatedAt,
    }))
    .sort((a, b) => compareEntries(a, b, options.sortBy) || a.donorId.localeCompare(b.donorId));

  return {
    entries: sorted.slice(0, options.limit).map((entry, index) => ({ rank: index + 1, ...entry })),
    totalDonorsCount: donorMap.size,
    totalAmountSum: Array.from(donorMap.values()).reduce((sum, data) => sum + data.totalAmount, 0),
    totalProjectsSupported: projectUris.size,
  };
}

function filterByPeriod(receipts: FundingReceipt[], period: Period): FundingReceipt[] {
  if (period === "all") return receipts;
  const cutoff = Date.now() - (period === "week" ? 7 : 30) * 24 * 60 * 60 * 1000;
  return receipts.filter((receipt) => {
    if (!receipt.occurredAt) return false;
    const time = Date.parse(receipt.occurredAt);
    return Number.isFinite(time) && time >= cutoff;
  });
}

function donorMatchesFilter(donorType: "did" | "wallet", donorFilter: DonorFilter): boolean {
  if (donorFilter === "all") return true;
  if (donorFilter === "anonymous") return donorType === "wallet";
  return donorType === "did";
}

function compareEntries(a: Omit<LeaderboardEntry, "rank">, b: Omit<LeaderboardEntry, "rank">, sortBy: SortMode): number {
  switch (sortBy) {
    case "total-raised": {
      const amountDiff = b.totalAmount - a.totalAmount;
      return amountDiff !== 0 ? amountDiff : b.donationCount - a.donationCount;
    }
    case "donation-count": {
      const countDiff = b.donationCount - a.donationCount;
      return countDiff !== 0 ? countDiff : b.totalAmount - a.totalAmount;
    }
    case "recent-donation": {
      const dateDiff = dateTimeValue(b.lastDonatedAt) - dateTimeValue(a.lastDonatedAt);
      return dateDiff !== 0 ? dateDiff : b.totalAmount - a.totalAmount;
    }
  }
}

function dateTimeValue(date: string | null): number {
  if (!date) return 0;
  const time = Date.parse(date);
  return Number.isNaN(time) ? 0 : time;
}

function donationSummary(count: number, relativeTime: string | null): string {
  const donationCount = `${count.toLocaleString("en")} ${count === 1 ? "donation" : "donations"}`;
  return relativeTime ? `${donationCount} · Last donation ${relativeTime}` : donationCount;
}

function formatRelativeTimeFromNow(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  const diffInSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffInSeconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return formatter.format(diffInSeconds, "second");
  if (abs < 3600) return formatter.format(Math.round(diffInSeconds / 60), "minute");
  if (abs < 86400) return formatter.format(Math.round(diffInSeconds / 3600), "hour");
  if (abs < 2592000) return formatter.format(Math.round(diffInSeconds / 86400), "day");
  if (abs < 31536000) return formatter.format(Math.round(diffInSeconds / 2592000), "month");
  return formatter.format(Math.round(diffInSeconds / 31536000), "year");
}

function basescanAddress(address: string): string {
  return `https://basescan.org/address/${encodeURIComponent(address)}`;
}

function isPeriod(value: string | null): value is Period {
  return value === "all" || value === "month" || value === "week";
}

function isDonorFilter(value: string | null): value is DonorFilter {
  return value === "all" || value === "anonymous" || value === "known";
}

function isSortMode(value: string | null): value is SortMode {
  return value === "total-raised" || value === "donation-count" || value === "recent-donation";
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
