"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  BadgeCheckIcon,
  BinocularsIcon,
  Building2Icon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CameraIcon,
  ChevronRightIcon,
  ClockIcon,
  CrownIcon,
  MapPinnedIcon,
  MessagesSquareIcon,
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
  BIOBLITZ_LINKS,
  BIOBLITZ_PRIZES,
  countdownTo,
  endedRounds,
  featuredRound,
  fetchCollectorOrgs,
  fetchRoundCollectors,
  roundStatus,
  type BioblitzRound,
  type BoardScope,
  type CollectorOrg,
  type RoundBoard,
  type RoundStatus,
} from "../_lib/bioblitz";

// Shared easing for entrance motion — a soft, confident ease-out.
const EASE = [0.22, 1, 0.36, 1] as const;
const IMG_SIZES = "(min-width: 768px) calc(100vw - 15rem), 100vw";

/** Org-type tokens we have a friendly translated label for; anything else
 *  falls back to the generic "Organization" label. */
const KNOWN_ORG_TYPES = new Set([
  "nonprofit",
  "business",
  "company",
  "community",
  "government",
  "academic",
]);

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
  // Which window the board tallies: the active round, or all-time.
  const [scope, setScope] = useState<BoardScope>("round");
  // Organisation membership per collector account, resolved after the board
  // loads and merged in progressively so the standings never wait on it.
  const [orgs, setOrgs] = useState<Map<string, CollectorOrg>>(new Map());

  // Reset to the loading state whenever the active round or scope changes.
  useEffect(() => {
    setBoard(null);
    setError(false);
    setOrgs(new Map());
  }, [round.id, scope]);

  // Resolve organisation labels for the collectors currently on the board.
  useEffect(() => {
    if (!board || board.collectors.length === 0) return;
    const dids = board.collectors.slice(0, BOARD_LIMIT).map((c) => c.did);
    const ctrl = new AbortController();
    let cancelled = false;
    fetchCollectorOrgs(dids, ctrl.signal)
      .then((map) => {
        if (!cancelled) setOrgs(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [board]);

  // Load on round change, then refresh silently every two minutes so the live
  // standings stay current without flashing the skeleton.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const load = () => {
      fetchRoundCollectors(round, scope, controller.signal)
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
  }, [round, scope]);

  return (
    <section className="relative -mt-14 overflow-hidden pb-32">
      <HeroBackdrop />

      <div className="relative z-10 mx-auto max-w-5xl px-6">
        <Hero round={round} status={status} now={now} />

        <Prizes />

        <HowItWorks />

        <Board
          round={round}
          status={status}
          board={board}
          orgs={orgs}
          error={error}
          now={now}
          scope={scope}
          onScope={setScope}
        />

        {past.length > 0 ? <Winners rounds={past} /> : null}

        <ClosingInvite />
      </div>
    </section>
  );
}

/** A full nature banner behind the hero, fading into the page. Real imagery
 *  carries the atmosphere so the type can stay sparse. */
function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] overflow-hidden">
      <Image
        src="/assets/media/images/observations/observations-hero-light@2x.webp"
        alt=""
        fill
        priority
        quality={95}
        sizes={IMG_SIZES}
        className="object-cover object-center dark:hidden"
      />
      <Image
        src="/assets/media/images/observations/observations-hero-dark@2x.webp"
        alt=""
        fill
        priority
        quality={95}
        sizes={IMG_SIZES}
        className="hidden object-cover object-center dark:block"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/70 to-background" />
    </div>
  );
}

/** Centered section title with a brand accent mark above it. No kicker text. */
function SectionHeading({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span aria-hidden className="h-1 w-12 rounded-full bg-primary/40" />
      <h2 className="font-instrument text-3xl font-light italic leading-none tracking-[-0.02em] text-foreground sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}

/** Scroll-triggered reveal for below-the-fold sections. */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.section
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.section>
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
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE }}
      className="flex flex-col items-center pb-4 pt-32 text-center"
    >
      <h1 className="font-instrument max-w-3xl text-6xl font-light italic leading-[0.92] tracking-[-0.035em] text-foreground sm:text-7xl md:text-[5.5rem]">
        {t("hero.titlePrefix")} <span className="text-primary">{t("hero.titleEmphasis")}</span>
      </h1>
      <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">{t("hero.description")}</p>

      {/* Live status + round identity, centered. */}
      <div className="mt-9 flex flex-col items-center gap-3">
        <StatusChip status={status} />
        <p className="font-instrument text-2xl italic leading-tight text-foreground sm:text-3xl">{round.label}</p>
        <p className="text-sm tabular-nums text-muted-foreground">{dates}</p>
      </div>

      <Countdown round={round} status={status} now={now} />

      {round.rsvpUrl && status !== "ended" ? (
        <motion.a
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
          href={round.rsvpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-10 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-dark"
        >
          <CalendarCheckIcon className="size-4" aria-hidden />
          {t("rsvp.button")}
        </motion.a>
      ) : null}

      <HelpLinks />
      <p className="mt-12 text-xs text-muted-foreground/70">{t("hero.program")}</p>
    </motion.header>
  );
}

function HelpLinks() {
  const t = useTranslations("marketplace.bioblitz.help");
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
      <a
        href={BIOBLITZ_LINKS.officeHours}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
      >
        <CalendarClockIcon className="size-4" aria-hidden />
        {t("officeHours")}
      </a>
      <a
        href={BIOBLITZ_LINKS.community}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
      >
        <MessagesSquareIcon className="size-4" aria-hidden />
        {t("community")}
      </a>
    </div>
  );
}

function StatusChip({ status }: { status: RoundStatus }) {
  const t = useTranslations("marketplace.bioblitz.status");
  const styles: Record<RoundStatus, string> = {
    live: "bg-primary/15 text-primary",
    upcoming: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    ended: "bg-foreground/10 text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ${styles[status]}`}
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

/** Large segmented countdown — the two most-significant units as centered
 *  tiles. Shows placeholders until "now" resolves on the client. */
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

  if (status === "ended") {
    return (
      <p className="font-instrument mt-8 text-2xl italic text-muted-foreground sm:text-3xl">{t("ended")}</p>
    );
  }

  // Hold the countdown back until the client resolves "now", so it animates in
  // cleanly rather than flashing placeholder values.
  if (now == null) return null;

  const label = status === "upcoming" ? t("startsIn") : t("endsIn");
  const target = status === "upcoming" ? round.start : round.end;
  const { days, hours, minutes } = countdownTo(target, now);
  const parts =
    days > 0
      ? [t("days", { count: days }), t("hours", { count: hours })]
      : [t("hours", { count: hours }), t("minutes", { count: minutes })];

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <ClockIcon className="size-4 text-primary" aria-hidden />
        {label}
      </span>
      <div className="flex items-stretch justify-center gap-3">
        {parts.map((part, index) => (
          <span
            key={index}
            className="rounded-2xl bg-foreground/[0.06] px-5 py-3 text-2xl font-semibold tabular-nums tracking-tight text-foreground backdrop-blur sm:text-3xl"
          >
            {part}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Prizes ───────────────────────────────────────────────────────────────────

function Prizes() {
  const t = useTranslations("marketplace.bioblitz.prizes");
  const locale = useLocale();
  return (
    <Reveal className="mt-32">
      <SectionHeading title={t("title")} />
      <div className="mx-auto mt-10 grid max-w-3xl gap-5 sm:grid-cols-2">
        <PrizeCard
          featured
          amount={formatPrize(BIOBLITZ_PRIZES.mostObservations, locale)}
          icon={<TrophyIcon />}
          title={t("mostObservations.title")}
        />
        <PrizeCard
          amount={formatPrize(BIOBLITZ_PRIZES.bestPicture, locale)}
          icon={<CameraIcon />}
          title={t("bestPicture.title")}
        />
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <BadgeCheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
        {t("badgeNote")}
      </p>
    </Reveal>
  );
}

function PrizeCard({
  amount,
  icon,
  title,
  featured = false,
}: {
  amount: string;
  icon: ReactNode;
  title: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col items-center gap-5 overflow-hidden rounded-[28px] px-6 py-10 text-center backdrop-blur transition-colors ${
        featured
          ? "bg-gradient-to-b from-primary/[0.18] via-primary/[0.06] to-transparent hover:from-primary/[0.24]"
          : "bg-foreground/5 hover:bg-foreground/[0.08]"
      }`}
    >
      {featured ? (
        <Image
          src="/assets/media/images/create-bumicert/plant-light.png"
          alt=""
          width={160}
          height={200}
          aria-hidden
          className="pointer-events-none absolute -bottom-6 -right-6 w-28 opacity-20 dark:hidden"
        />
      ) : null}
      {featured ? (
        <Image
          src="/assets/media/images/create-bumicert/plant-dark.png"
          alt=""
          width={160}
          height={200}
          aria-hidden
          className="pointer-events-none absolute -bottom-6 -right-6 hidden w-28 opacity-25 dark:block"
        />
      ) : null}
      <span
        className={`relative flex size-12 items-center justify-center rounded-2xl text-primary [&_svg]:size-5 ${
          featured ? "bg-primary/15" : "bg-primary/10"
        }`}
      >
        {icon}
      </span>
      <div className="relative">
        <div
          className={`font-instrument italic leading-none tracking-tight text-primary ${
            featured ? "text-7xl" : "text-6xl"
          }`}
        >
          {amount}
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
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
    <Reveal className="mt-32">
      <SectionHeading title={t("title")} />
      <ol className="mx-auto mt-10 grid max-w-3xl gap-5 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="relative flex flex-col items-center gap-4 overflow-hidden rounded-[28px] bg-foreground/5 px-6 py-9 text-center backdrop-blur transition-colors hover:bg-foreground/[0.08]"
          >
            <span
              aria-hidden
              className="font-instrument pointer-events-none absolute -top-4 right-3 select-none text-8xl italic leading-none text-primary/[0.07]"
            >
              {index + 1}
            </span>
            <span className="relative flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-6">
              {step.icon}
            </span>
            <h3 className="relative text-base font-semibold text-foreground">{t(`steps.${step.key}.title`)}</h3>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

/** How many collectors the board renders (and resolves org labels for). */
const BOARD_LIMIT = 20;

/** Segmented "This round / All time" control for the board window. */
function ScopeToggle({
  scope,
  onScope,
}: {
  scope: BoardScope;
  onScope: (scope: BoardScope) => void;
}) {
  const t = useTranslations("marketplace.bioblitz.board.scope");
  const options: BoardScope[] = ["round", "all"];
  return (
    <div className="inline-flex rounded-full bg-muted/60 p-0.5 ring-1 ring-foreground/5">
      {options.map((option) => {
        const selected = scope === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onScope(option)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selected
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(option)}
          </button>
        );
      })}
    </div>
  );
}

function Board({
  round,
  status,
  board,
  orgs,
  error,
  now,
  scope,
  onScope,
}: {
  round: BioblitzRound;
  status: RoundStatus;
  board: RoundBoard | null;
  orgs: Map<string, CollectorOrg>;
  error: boolean;
  now: number | null;
  scope: BoardScope;
  onScope: (scope: BoardScope) => void;
}) {
  const t = useTranslations("marketplace.bioblitz.board");
  const subtitle =
    scope === "all"
      ? t("subtitleAll")
      : status === "ended"
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
      label: scope === "all" ? t("stats.observationsAll") : t("stats.observations"),
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

  const collectors = board?.collectors.slice(0, BOARD_LIMIT) ?? [];
  const [leader, ...rest] = collectors;

  return (
    <Reveal className="mt-32">
      <SectionHeading title={t("title")} />
      <p className="mx-auto mt-4 max-w-md text-center text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {scope === "round" && status === "live" ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-current opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-current" />
            </span>
            {t("live")}
          </span>
        ) : null}
        <ScopeToggle scope={scope} onScope={onScope} />
      </div>

      <div className="mx-auto mt-10 max-w-3xl">
        <StatsTileGrid items={stats} columns={3} />
      </div>

      <div className="mx-auto mt-6 max-w-3xl">
        {board ? (
          collectors.length === 0 ? (
            <BoardMessage icon={<BinocularsIcon />} title={t("empty.title")} description={t("empty.description")} />
          ) : (
            <div className="space-y-4">
              {leader ? (
                <LeaderCard
                  did={leader.did}
                  name={leader.displayName}
                  avatarRef={leader.avatarRef}
                  count={leader.count}
                  org={orgs.get(leader.did)}
                />
              ) : null}
              {rest.length > 0 ? (
                <div className="space-y-1.5">
                  {rest.map((collector, index) => (
                    <CollectorRow
                      key={collector.did}
                      rank={index + 2}
                      did={collector.did}
                      name={collector.displayName}
                      avatarRef={collector.avatarRef}
                      count={collector.count}
                      org={orgs.get(collector.did)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )
        ) : error ? (
          <BoardMessage icon={<TrophyIcon />} title={t("error.title")} description={t("error.description")} />
        ) : (
          <BoardSkeleton />
        )}
      </div>
    </Reveal>
  );
}

/** The round leader, given a centered champion card so the board reads as a
 *  contest with a clear front-runner. */
function LeaderCard({
  did,
  name,
  avatarRef,
  count,
  org,
}: {
  did: string;
  name: string | null;
  avatarRef: string | null;
  count: number;
  org?: CollectorOrg;
}) {
  const t = useTranslations("marketplace.bioblitz.board");
  return (
    <PreferredAccountLink
      did={did}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("openCollector")}
      className="group relative flex flex-col items-center gap-3 overflow-hidden rounded-[28px] bg-gradient-to-b from-primary/[0.18] via-primary/[0.06] to-transparent px-6 py-9 text-center backdrop-blur transition-colors hover:from-primary/[0.24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary [&_svg]:size-7">
        <CrownIcon aria-label={t("rankAriaLabel", { rank: 1 })} />
      </span>
      <div className="flex min-w-0 items-center gap-1.5 text-lg font-semibold text-foreground">
        <AuthorInline did={did} nameOverride={name} avatarRefOverride={avatarRef} />
      </div>
      <OrgLabel org={org} />
      <div className="font-instrument text-6xl italic leading-none tabular-nums text-primary">
        {formatNumber(count)}
      </div>
      <div className="text-sm text-muted-foreground">{t("observations", { count })}</div>
    </PreferredAccountLink>
  );
}

const RANK_TIERS: Record<number, string> = {
  2: "bg-slate-400/25 text-slate-600 dark:text-slate-300",
  3: "bg-orange-400/20 text-orange-700 dark:text-orange-300",
};

function CollectorRow({
  rank,
  did,
  name,
  avatarRef,
  count,
  org,
}: {
  rank: number;
  did: string;
  name: string | null;
  avatarRef: string | null;
  count: number;
  org?: CollectorOrg;
}) {
  const t = useTranslations("marketplace.bioblitz.board");
  return (
    <PreferredAccountLink
      did={did}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("openCollector")}
      className="group flex items-center gap-3.5 rounded-2xl bg-foreground/5 px-4 py-3.5 transition-colors duration-200 hover:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-4 sm:px-5"
    >
      <span
        aria-label={t("rankAriaLabel", { rank })}
        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
          RANK_TIERS[rank] ?? "bg-foreground/10 text-muted-foreground"
        }`}
      >
        {rank}
      </span>

      <div className="min-w-0 flex-1 space-y-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <AuthorInline did={did} nameOverride={name} avatarRefOverride={avatarRef} />
        </span>
        <OrgLabel org={org} />
      </div>

      <span className="shrink-0 whitespace-nowrap text-right">
        <span className="block text-[17px] font-bold tabular-nums text-primary">{formatNumber(count)}</span>
        <span className="text-xs text-muted-foreground">{t("observations", { count })}</span>
      </span>

      <ChevronRightIcon
        aria-hidden
        className="size-5 shrink-0 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </PreferredAccountLink>
  );
}

/** Subtle organisation-membership chip shown under a collector's name: the
 *  account's organisation type (when known) plus its member-roster size. Only
 *  rendered for accounts that resolve to an organisation; degrades to nothing
 *  while the label is still loading or when the account isn't an org. */
function OrgLabel({ org }: { org?: CollectorOrg }) {
  const t = useTranslations("marketplace.bioblitz.board.org");
  if (!org || !org.isOrganization) return null;
  const typeLabel =
    org.orgType && KNOWN_ORG_TYPES.has(org.orgType) ? t(`types.${org.orgType}`) : t("label");
  const parts = [typeLabel];
  if (org.memberCount > 0) parts.push(t("members", { count: org.memberCount }));
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
      <Building2Icon className="size-3 shrink-0" aria-hidden />
      {parts.join(" · ")}
    </span>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-[28px] bg-foreground/5 px-6 py-9">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-5 w-44 max-w-full" />
        <Skeleton className="h-12 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3.5 rounded-2xl bg-foreground/5 px-4 py-3.5 sm:gap-4 sm:px-5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[18px] w-40 max-w-full" />
            </div>
            <Skeleton className="h-6 w-12 shrink-0" />
          </div>
        ))}
      </div>
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
    <div className="flex flex-col items-center gap-3 rounded-[28px] bg-foreground/5 py-16 text-center text-muted-foreground backdrop-blur">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-8 [&_svg]:opacity-60">
        {icon}
      </div>
      <p className="font-instrument text-3xl font-light italic text-foreground">{title}</p>
      <p className="max-w-sm text-base text-muted-foreground">{description}</p>
    </div>
  );
}

// ── Past winners ─────────────────────────────────────────────────────────────

function Winners({ rounds }: { rounds: BioblitzRound[] }) {
  const t = useTranslations("marketplace.bioblitz.winners");
  const locale = useLocale();
  return (
    <Reveal className="mt-32">
      <SectionHeading title={t("title")} />

      <div className="mx-auto mt-10 max-w-3xl space-y-4">
        {rounds.map((round) => (
          <div key={round.id} className="rounded-[28px] bg-foreground/5 p-7 backdrop-blur">
            <div className="flex flex-col items-center gap-1 text-center">
              <h3 className="font-instrument text-xl italic text-foreground">{round.label}</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDateRange(round.start, round.end, locale)}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
    </Reveal>
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
    <div className="flex items-center gap-3 rounded-2xl bg-background/40 px-4 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
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

// ── Closing invite ─────────────────────────────────────────────────────────────

/** An immersive rainforest band that closes the page on the primary action. */
function ClosingInvite() {
  const t = useTranslations("marketplace.bioblitz.board");
  return (
    <Reveal className="relative mt-32 flex min-h-[18rem] items-center justify-center overflow-hidden rounded-[40px] px-6 py-16 text-center">
      <Image
        src="/assets/media/images/landing/hero-rainforest@2x.webp"
        alt=""
        fill
        quality={95}
        sizes={IMG_SIZES}
        aria-hidden
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/45 to-black/35" />
      <Link
        href="/manage/observations"
        className="group relative inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-dark"
      >
        {t("cta")}
        <ChevronRightIcon className="size-5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </Reveal>
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
  return `${startFmt} to ${endFmt}`;
}
