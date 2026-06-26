"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  BinocularsIcon,
  CameraIcon,
  ClockIcon,
  CrownIcon,
  MapPinnedIcon,
  ScanSearchIcon,
  TrophyIcon,
  UploadIcon,
  UsersRoundIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthorInline } from "../_components/AuthorChip";
import { PreferredAccountLink } from "../_components/PreferredLinks";
import { StatsTileGrid, type StatsTileItem } from "../_components/StatsTile";
import { formatNumber } from "../_lib/format";
import {
  BIOBLITZ_PRIZES,
  countdownTo,
  endedRounds,
  featuredRound,
  fetchRoundCollectors,
  roundStatus,
  type BioblitzRound,
  type RoundBoard,
  type RoundStatus,
} from "../_lib/bioblitz";

export function BioblitzClient() {
  // Resolve "now"-dependent state after mount so the server-rendered shell
  // can't disagree with the first client paint (countdown / round selection).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Resolve the featured round, but keep its object identity stable while the
  // same round stays active — so the once-a-minute `now` tick (which drives the
  // countdown) doesn't reset the live board to a skeleton every minute.
  const [round, setRound] = useState<BioblitzRound>(() => featuredRound());
  useEffect(() => {
    const next = featuredRound(now ?? Date.now());
    setRound((prev) => (prev.id === next.id ? prev : next));
  }, [now]);

  const status = now != null ? roundStatus(round, now) : "live";
  const past = useMemo(() => endedRounds(now ?? Date.now()), [now]);

  const [board, setBoard] = useState<RoundBoard | null>(null);
  const [error, setError] = useState(false);

  // Reset to the loading state whenever the active round changes.
  useEffect(() => {
    setBoard(null);
    setError(false);
  }, [round.id]);

  // Load on round change, then refresh silently every two minutes so the live
  // standings stay current without flashing the skeleton.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const load = () => {
      fetchRoundCollectors(round, controller.signal)
        .then((result) => {
          if (!cancelled) {
            setBoard(result);
            setError(false);
          }
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          if (!cancelled) setError(true);
        });
    };
    load();
    const id = setInterval(load, 120_000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [round]);

  return (
    <section className="relative overflow-hidden pb-20 pt-0 md:pb-28">
      <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/[0.10] via-transparent to-transparent dark:from-primary/[0.14]" />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <Hero round={round} status={status} now={now} />

        <Prizes />

        <HowItWorks />

        <Board round={round} status={status} board={board} error={error} now={now} />

        {past.length > 0 ? <Winners rounds={past} /> : null}
      </div>
    </section>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero({
  round,
  status,
  now,
}: {
  round: BioblitzRound;
  status: RoundStatus;
  now: number | null;
}) {
  const t = useTranslations("marketplace.bioblitz");
  const locale = useLocale();
  const dates = formatDateRange(round.start, round.end, locale);

  return (
    <motion.header
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex flex-col pb-8 pt-[64px]"
    >
      <span className="font-instrument text-sm uppercase tracking-[0.22em] text-primary/80">
        {t("hero.eyebrow")}
      </span>
      <h1 className="font-garamond mt-3 max-w-4xl text-4xl font-light leading-[0.98] tracking-[-0.035em] text-foreground sm:text-5xl md:text-6xl">
        {t("hero.titlePrefix")}{" "}
        <span className="font-instrument italic text-foreground/85">{t("hero.titleEmphasis")}</span>
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
        {t("hero.description")}
      </p>

      {/* Round chip: label + dates + live status / countdown */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-card/70 px-4 py-3 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur sm:px-5">
        <StatusChip status={status} />
        <span className="font-medium text-foreground">{round.label}</span>
        <span aria-hidden className="hidden text-muted-foreground/50 sm:inline">
          •
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">{dates}</span>
        <span className="ml-auto">
          <Countdown round={round} status={status} now={now} />
        </span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground/80">{t("hero.program")}</p>
    </motion.header>
  );
}

function StatusChip({ status }: { status: RoundStatus }) {
  const t = useTranslations("marketplace.bioblitz.status");
  const styles: Record<RoundStatus, string> = {
    live: "bg-primary/12 text-primary",
    upcoming: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    ended: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status === "live" ? (
        <span aria-hidden className="relative flex size-2">
          <span className="absolute inline-flex size-2 animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
      ) : null}
      {t(status)}
    </span>
  );
}

function Countdown({
  round,
  status,
  now,
}: {
  round: BioblitzRound;
  status: RoundStatus;
  now: number | null;
}) {
  const t = useTranslations("marketplace.bioblitz.round");
  if (now == null) return null;
  if (status === "ended") {
    return <span className="text-sm font-medium text-muted-foreground">{t("ended")}</span>;
  }
  const target = status === "upcoming" ? round.start : round.end;
  const { days, hours, minutes } = countdownTo(target, now);
  const label = status === "upcoming" ? t("startsIn") : t("endsIn");
  const parts =
    days > 0
      ? [t("days", { count: days }), t("hours", { count: hours })]
      : [t("hours", { count: hours }), t("minutes", { count: minutes })];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <ClockIcon className="size-3.5 text-primary" aria-hidden />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{parts.join(" · ")}</span>
    </span>
  );
}

// ── Prizes ───────────────────────────────────────────────────────────────────

function Prizes() {
  const t = useTranslations("marketplace.bioblitz.prizes");
  const locale = useLocale();
  return (
    <section className="mt-10">
      <h2 className="font-garamond text-2xl font-light text-foreground sm:text-3xl">{t("title")}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PrizeCard
          amount={formatPrize(BIOBLITZ_PRIZES.mostObservations, locale)}
          icon={<TrophyIcon />}
          title={t("mostObservations.title")}
          blurb={t("mostObservations.blurb")}
        />
        <PrizeCard
          amount={formatPrize(BIOBLITZ_PRIZES.bestPicture, locale)}
          icon={<CameraIcon />}
          title={t("bestPicture.title")}
          blurb={t("bestPicture.blurb")}
        />
      </div>
      <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <BadgeCheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
        {t("badgeNote")}
      </p>
    </section>
  );
}

function PrizeCard({
  amount,
  icon,
  title,
  blurb,
}: {
  amount: string;
  icon: ReactNode;
  title: string;
  blurb: string;
}) {
  return (
    <div className="relative flex items-start gap-4 overflow-hidden rounded-3xl bg-card/70 p-5 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur sm:p-6">
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
      <span className="font-garamond text-4xl font-light tabular-nums text-primary sm:text-5xl">
        {amount}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex shrink-0 items-center text-primary [&_svg]:size-4">{icon}</span>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{blurb}</p>
      </div>
    </div>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────

function HowItWorks() {
  const t = useTranslations("marketplace.bioblitz.how");
  const steps = [
    { key: "outside", icon: <MapPinnedIcon /> },
    { key: "upload", icon: <UploadIcon /> },
    { key: "review", icon: <ScanSearchIcon /> },
  ] as const;
  return (
    <section className="mt-12">
      <h2 className="font-garamond text-2xl font-light text-foreground sm:text-3xl">{t("title")}</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="relative overflow-hidden rounded-3xl bg-card/70 p-5 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold tabular-nums text-primary">
                {index + 1}
              </span>
              <span className="flex items-center text-primary [&_svg]:size-5">{step.icon}</span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-foreground">
              {t(`steps.${step.key}.title`)}
            </h3>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">
              {t(`steps.${step.key}.blurb`)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

function Board({
  round,
  status,
  board,
  error,
  now,
}: {
  round: BioblitzRound;
  status: RoundStatus;
  board: RoundBoard | null;
  error: boolean;
  now: number | null;
}) {
  const t = useTranslations("marketplace.bioblitz.board");
  const subtitle =
    status === "ended"
      ? t("subtitleEnded")
      : status === "upcoming"
        ? t("subtitleUpcoming")
        : t("subtitleLive");

  const timeLeft = useMemo(() => {
    if (now == null || status === "ended") return "—";
    const { days, hours } = countdownTo(status === "upcoming" ? round.start : round.end, now);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  }, [now, status, round]);

  const stats: StatsTileItem[] = [
    {
      label: t("stats.observations"),
      value: board ? formatNumber(board.totalObservations) : "—",
      icon: <BinocularsIcon />,
      accent: true,
    },
    {
      label: t("stats.collectors"),
      value: board ? formatNumber(board.collectorCount) : "—",
      icon: <UsersRoundIcon />,
    },
    {
      label: t("stats.timeLeft"),
      value: timeLeft,
      icon: <ClockIcon />,
    },
  ];

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-garamond text-2xl font-light text-foreground sm:text-3xl">{t("title")}</h2>
        {status === "live" ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-current opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-current" />
            </span>
            {t("live")}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

      <div className="mt-4">
        <StatsTileGrid items={stats} columns={3} />
      </div>

      <div className="mt-4">
        {board ? (
          board.collectors.length === 0 ? (
            <BoardMessage icon={<BinocularsIcon />} title={t("empty.title")} description={t("empty.description")} />
          ) : (
            <div className="divide-y divide-border/60 overflow-hidden rounded-3xl bg-card/70 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
              {board.collectors.slice(0, 20).map((collector, index) => (
                <CollectorRow
                  key={collector.did}
                  rank={index + 1}
                  did={collector.did}
                  name={collector.displayName}
                  avatarRef={collector.avatarRef}
                  count={collector.count}
                />
              ))}
            </div>
          )
        ) : error ? (
          <BoardMessage icon={<TrophyIcon />} title={t("error.title")} description={t("error.description")} />
        ) : (
          <BoardSkeleton />
        )}
      </div>

      <Link
        href="/manage/observations"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary-dark"
      >
        {t("cta")}
        <ArrowRightIcon className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

const RANK_TIERS: Record<number, string> = {
  1: "bg-gradient-to-br from-amber-300/35 to-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  2: "bg-gradient-to-br from-slate-300/40 to-slate-400/10 text-slate-600 ring-slate-400/25 dark:text-slate-300",
  3: "bg-gradient-to-br from-orange-300/35 to-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-300",
};

function CollectorRow({
  rank,
  did,
  name,
  avatarRef,
  count,
}: {
  rank: number;
  did: string;
  name: string | null;
  avatarRef: string | null;
  count: number;
}) {
  const t = useTranslations("marketplace.bioblitz.board");
  return (
    <PreferredAccountLink
      did={did}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("openCollector")}
      className="group flex items-center gap-3.5 px-4 py-[18px] transition-colors duration-200 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-4 sm:px-5 sm:py-5"
    >
      <span
        aria-label={t("rankAriaLabel", { rank })}
        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ring-1 ${
          RANK_TIERS[rank] ?? "bg-muted/50 text-muted-foreground ring-foreground/5"
        }`}
      >
        {rank}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <AuthorInline did={did} nameOverride={name} avatarRefOverride={avatarRef} />
        </span>
        {rank === 1 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium leading-none text-primary">
            <CrownIcon className="size-3" />
            {t("leader")}
          </span>
        ) : null}
      </div>

      <span className="shrink-0 whitespace-nowrap text-right text-sm font-medium text-muted-foreground">
        <span className="block text-[17px] font-bold tabular-nums text-primary">{formatNumber(count)}</span>
        {t("observations", { count })}
      </span>

      <ArrowRightIcon
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </PreferredAccountLink>
  );
}

function BoardSkeleton() {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-3xl bg-card/70 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3.5 px-4 py-[18px] sm:gap-4 sm:px-5 sm:py-5">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-[18px] w-40 max-w-full" />
            <Skeleton className="h-4 w-24 max-w-full" />
          </div>
          <Skeleton className="h-6 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function BoardMessage({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-card/75 py-16 text-center text-muted-foreground shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-8 [&_svg]:opacity-60">
        {icon}
      </div>
      <p className="font-garamond text-3xl font-light text-foreground">{title}</p>
      <p className="font-instrument max-w-sm text-base italic text-foreground/70">{description}</p>
    </div>
  );
}

// ── Past winners ─────────────────────────────────────────────────────────────

function Winners({ rounds }: { rounds: BioblitzRound[] }) {
  const t = useTranslations("marketplace.bioblitz.winners");
  const locale = useLocale();
  return (
    <section className="mt-12">
      <h2 className="font-garamond text-2xl font-light text-foreground sm:text-3xl">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>

      <div className="mt-4 space-y-3">
        {rounds.map((round) => (
          <div
            key={round.id}
            className="rounded-3xl bg-card/70 p-5 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur sm:p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold text-foreground">{round.label}</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDateRange(round.start, round.end, locale)}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <WinnerSlot
                icon={<TrophyIcon />}
                label={t("mostObservations")}
                winner={round.mostObservations}
                pending={t("pending")}
              />
              <WinnerSlot
                icon={<CameraIcon />}
                label={t("bestPicture")}
                winner={round.bestPicture}
                pending={t("pending")}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WinnerSlot({
  icon,
  label,
  winner,
  pending,
}: {
  icon: ReactNode;
  label: string;
  winner: BioblitzRound["mostObservations"];
  pending: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-foreground/5 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm font-semibold text-foreground">
          {winner?.did ? (
            <AuthorInline did={winner.did} />
          ) : (
            <span className="text-muted-foreground">{pending}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPrize(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateRange(startIso: string, endIso: string, locale: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(start);
  const endFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(end);
  return `${startFmt} → ${endFmt}`;
}
