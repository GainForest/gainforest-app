"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  ArrowDownWideNarrowIcon,
  ChevronRightIcon,
  CrownIcon,
  GiftIcon,
  LeafIcon,
  SparklesIcon,
  SproutIcon,
  TrophyIcon,
  UserRoundCheckIcon,
  UserRoundXIcon,
  UsersRoundIcon,
  WalletIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthorInline } from "../_components/AuthorChip";
import { PreferredAccountLink } from "../_components/PreferredLinks";
import { fetchReceipts, type FundingReceipt } from "../_lib/dashboard";
import { formatCompactUsd } from "../_lib/format";

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
  totalDonationCount: number;
};

const DONOR_FILTER_VALUES: DonorFilter[] = ["all", "anonymous", "known"];
const SORT_VALUES: SortMode[] = ["total-raised", "donation-count", "recent-donation"];
const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;
const DONOR_FILTER_ICONS: Record<DonorFilter, typeof UsersRoundIcon> = {
  all: UsersRoundIcon,
  anonymous: UserRoundXIcon,
  known: UserRoundCheckIcon,
};
const SORT_TRANSLATION_KEYS: Record<SortMode, "totalRaised" | "donationCount" | "recentDonation"> = {
  "total-raised": "totalRaised",
  "donation-count": "donationCount",
  "recent-donation": "recentDonation",
};

// Body-only leaderboard: the donations hero, view switcher and period filter
// live in DonationsHub, so this renders just the donor-type/sort controls, the
// summary strip and the ranked donor list for the period it's handed.
export function LeaderboardBody({ period }: { period: Period }) {
  const [receipts, setReceipts] = useState<FundingReceipt[] | null>(null);
  const [error, setError] = useState(false);
  const [donorFilter, setDonorFilter] = useQueryState(
    "donors",
    parseAsStringEnum<DonorFilter>(DONOR_FILTER_VALUES).withDefault("all").withOptions(QUERY_STATE_OPTIONS),
  );
  const [sortBy, setSortBy] = useQueryState(
    "sort",
    parseAsStringEnum<SortMode>(SORT_VALUES).withDefault("total-raised").withOptions(QUERY_STATE_OPTIONS),
  );

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

  const defaultTotals = useMemo(() => {
    if (!receipts) return null;
    return aggregateToLeaderboard(receipts, { period: "all", limit: 100, donorFilter: "all", sortBy: "total-raised" });
  }, [receipts]);

  const loading = receipts === null && !error;

  return (
    <>
      <div className="mb-4 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <DonorTypeTabs donorFilter={donorFilter} onDonorFilterChange={(nextDonorFilter) => void setDonorFilter(nextDonorFilter)} />
        <SortControl sortBy={sortBy} onSortChange={(nextSort) => void setSortBy(nextSort)} />
      </div>

      <div className="mb-4">
        <StatsSummary
          totalDonors={defaultTotals?.totalDonorsCount ?? 0}
          totalRaised={defaultTotals?.totalAmountSum ?? 0}
          totalProjectsSupported={defaultTotals?.totalProjectsSupported ?? 0}
          totalDonationCount={defaultTotals?.totalDonationCount ?? 0}
          loading={loading}
        />
      </div>

      {error ? (
        <LeaderboardError />
      ) : receipts === null ? (
        <LeaderboardSkeleton />
      ) : (
        <LeaderboardGrid entries={leaderboard?.entries ?? []} />
      )}
    </>
  );
}

function DonorTypeTabs({
  donorFilter,
  onDonorFilterChange,
}: {
  donorFilter: DonorFilter;
  onDonorFilterChange: (donorFilter: DonorFilter) => void;
}) {
  const t = useTranslations("marketplace.leaderboard");
  return (
    <div className="grid h-10 w-full grid-cols-3 rounded-full bg-muted/55 p-1 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
      {DONOR_FILTER_VALUES.map((value) => {
        const Icon = DONOR_FILTER_ICONS[value];
        const label = t(`donorFilters.${value}`);
        const shortLabel = t(`donorFiltersShort.${value}`);
        const isSelected = donorFilter === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onDonorFilterChange(value)}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[13px] font-medium transition-all duration-200 sm:px-3",
              isSelected
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <Icon className="hidden size-3.5 sm:block" />
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SortControl({ sortBy, onSortChange }: { sortBy: SortMode; onSortChange: (sortBy: SortMode) => void }) {
  const t = useTranslations("marketplace.leaderboard.sort");
  const sortOptions = SORT_VALUES.map((value) => ({ value, label: t(SORT_TRANSLATION_KEYS[value]) }));
  return (
    <div className="flex h-10 items-center justify-between gap-2 rounded-full bg-muted/55 py-1 pr-1 pl-3.5 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
      <span
        id="leaderboard-sort-label"
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-muted-foreground"
      >
        <ArrowDownWideNarrowIcon className="size-3.5" />
        {t("label")}
      </span>
      <Select
        value={sortBy}
        onValueChange={(value) => {
          if (isSortMode(value)) onSortChange(value);
        }}
      >
        <SelectTrigger
          aria-labelledby="leaderboard-sort-label"
          className="h-8 min-w-[9.5rem] rounded-full border-0 bg-background/70 px-3 text-[13px] font-medium text-foreground shadow-none ring-1 ring-foreground/5 focus:ring-1 focus:ring-ring"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" className="rounded-2xl">
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} className="rounded-xl">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatsSummary({
  totalDonors,
  totalRaised,
  totalProjectsSupported,
  totalDonationCount,
  loading,
}: {
  totalDonors: number;
  totalRaised: number;
  totalProjectsSupported: number;
  totalDonationCount: number;
  loading: boolean;
}) {
  const t = useTranslations("marketplace.leaderboard.stats");
  const locale = useLocale();
  if (loading) return null;

  const stats: { label: string; value: string; Icon: typeof LeafIcon; accent?: boolean }[] = [
    { label: t("totalRaised"), value: formatCompactUsd(totalRaised), Icon: LeafIcon, accent: true },
    { label: t("uniqueDonors"), value: formatCompactNumber(totalDonors, locale), Icon: UsersRoundIcon },
    { label: t("bumicertsFunded"), value: formatCompactNumber(totalProjectsSupported, locale), Icon: SproutIcon, accent: true },
    { label: t("donationCount"), value: formatCompactNumber(totalDonationCount, locale), Icon: GiftIcon },
  ];

  // Slim hairline-separated strip instead of four oversized tiles — the same
  // gap-px band the home hero uses, so the numbers read at a glance and the
  // controls + leaderboard stay above the fold.
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border/60 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 sm:grid-cols-4">
      {stats.map(({ label, value, Icon, accent }) => (
        <div key={label} className="flex items-center gap-2.5 bg-card/80 px-4 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-4">
            <Icon />
          </span>
          <div className="min-w-0">
            <div
              className={cn(
                "truncate text-lg font-semibold tracking-[-0.02em] tabular-nums sm:text-xl",
                accent ? "text-primary" : "text-foreground",
              )}
            >
              {value}
            </div>
            <p className="truncate text-[11px] leading-tight text-muted-foreground first-letter:uppercase">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function LeaderboardGrid({ entries }: { entries: LeaderboardEntry[] }) {
  const t = useTranslations("marketplace.leaderboard.empty");
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-card/75 py-16 text-center text-muted-foreground shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <TrophyIcon className="size-8 opacity-60" />
        </div>
        <p className="font-garamond text-3xl font-light text-foreground">{t("title")}</p>
        <p className="font-instrument max-w-sm text-base italic text-foreground/70">{t("description")}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50 overflow-hidden rounded-2xl bg-card/70 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
      {entries.map((entry) => (
        <DonorCard key={entry.donorId} entry={entry} />
      ))}
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="divide-y divide-border/50 overflow-hidden rounded-2xl bg-card/70 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
      {Array.from({ length: 9 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-[15px] w-36 max-w-full" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="h-4 w-14 shrink-0" />
          <Skeleton className="size-4 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function LeaderboardError() {
  const t = useTranslations("marketplace.leaderboard.error");
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-card/75 py-16 text-center text-muted-foreground shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <TrophyIcon className="size-8 opacity-60" />
      </div>
      <p className="font-garamond text-3xl font-light text-foreground">{t("title")}</p>
      <p className="font-instrument max-w-sm text-base italic text-foreground/70">{t("description")}</p>
    </div>
  );
}

const RANK_TIERS: Record<number, string> = {
  1: "bg-gradient-to-br from-amber-300/35 to-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  2: "bg-gradient-to-br from-slate-300/40 to-slate-400/10 text-slate-600 ring-slate-400/25 dark:text-slate-300",
  3: "bg-gradient-to-br from-orange-300/35 to-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-300",
};

function RankBadge({ rank }: { rank: number }) {
  const t = useTranslations("marketplace.leaderboard.card");
  return (
    <span
      aria-label={t("rankAriaLabel", { rank })}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums ring-1",
        RANK_TIERS[rank] ?? "bg-muted/50 text-muted-foreground ring-foreground/5",
      )}
    >
      {rank}
    </span>
  );
}

const RANK_BADGES: Record<number, { Icon: typeof CrownIcon; labelKey: "topDonor" | "consistentGiver" | "risingSupporter" }> = {
  1: { Icon: CrownIcon, labelKey: "topDonor" },
  2: { Icon: SparklesIcon, labelKey: "consistentGiver" },
  3: { Icon: SproutIcon, labelKey: "risingSupporter" },
};

function DonorBadge({ rank }: { rank: number }) {
  const t = useTranslations("marketplace.leaderboard.card");
  const badge = RANK_BADGES[rank];
  if (!badge) return null;
  const { Icon, labelKey } = badge;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium leading-none text-primary">
      <Icon className="size-3" />
      {t(labelKey)}
    </span>
  );
}

function DonorCard({ entry }: { entry: LeaderboardEntry }) {
  const t = useTranslations("marketplace.leaderboard.card");
  const locale = useLocale();
  const isWallet = entry.donorType === "wallet";
  const relativeTime = entry.lastDonatedAt ? formatRelativeTimeFromNow(new Date(entry.lastDonatedAt), locale) : null;
  const className = cn(
    "group flex items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 sm:py-3.5",
    entry.rank === 1 && "bg-primary/[0.035]",
  );
  const content = (
    <>
      <RankBadge rank={entry.rank} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {isWallet ? <WalletIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
          <span className="min-w-0 truncate text-[14.5px] font-semibold text-foreground">
            {isWallet ? t("anonymousSupporter") : <AuthorInline did={entry.donorId} />}
          </span>
          <DonorBadge rank={entry.rank} />
        </div>
        <p className="mt-0.5 truncate text-[12.5px] leading-snug text-muted-foreground">
          {relativeTime
            ? t("donationSummaryWithTime", { count: entry.donationCount, relativeTime })
            : t("donationSummary", { count: entry.donationCount })}
        </p>
      </div>

      <span className="shrink-0 whitespace-nowrap text-[15px] font-bold tabular-nums text-primary sm:text-base">
        {formatCompactUsd(entry.totalAmount)}
      </span>

      <ChevronRightIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </>
  );

  if (isWallet) {
    return (
      <a
        href={etherscanAddress(entry.donorId)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("openPayment")}
        className={className}
      >
        {content}
      </a>
    );
  }

  return (
    <PreferredAccountLink
      did={entry.donorId}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("openSupporter")}
      className={className}
    >
      {content}
    </PreferredAccountLink>
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
    totalDonationCount: usdOnly.filter((receipt) => receipt.from && donorMatchesFilter(receipt.from.type, options.donorFilter)).length,
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

function formatCompactNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: Math.abs(value) >= 1000 ? "compact" : "standard" }).format(value);
}

function formatRelativeTimeFromNow(date: Date, locale: string): string | null {
  if (Number.isNaN(date.getTime())) return null;
  const diffInSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffInSeconds);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 60) return formatter.format(diffInSeconds, "second");
  if (abs < 3600) return formatter.format(Math.round(diffInSeconds / 60), "minute");
  if (abs < 86400) return formatter.format(Math.round(diffInSeconds / 3600), "hour");
  if (abs < 2592000) return formatter.format(Math.round(diffInSeconds / 86400), "day");
  if (abs < 31536000) return formatter.format(Math.round(diffInSeconds / 2592000), "month");
  return formatter.format(Math.round(diffInSeconds / 31536000), "year");
}

function etherscanAddress(address: string): string {
  return `https://etherscan.io/address/${encodeURIComponent(address)}`;
}

function isSortMode(value: string): value is SortMode {
  return SORT_VALUES.includes(value as SortMode);
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
