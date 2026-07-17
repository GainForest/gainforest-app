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
import { BioblitzGallery } from "./BioblitzGallery";
import { RoundAwardControl, useBioblitzAwardState } from "./BioblitzAwardControls";
import { BioblitzBestPicture } from "./BioblitzBestPicture";
import { BioblitzObservationsMap } from "./BioblitzObservationsMap";
import { RegisterButton } from "./BioblitzRegister";
import { AuthorInline } from "../_components/AuthorChip";
import { AwardEmblems, displayAwardKeys } from "../account/_components/AccountAwards";
import { fetchRecognitionBadgesForDids } from "../_lib/indexer";
import { PreferredAccountLink } from "../_components/PreferredLinks";
import { formatNumber } from "../_lib/format";
import {
  BIOBLITZ_LINKS,
  BIOBLITZ_PRIZES,
  bioblitzRounds,
  countdownTo,
  endedRounds,
  featuredRound,
  fetchCollectorOrgs,
  fetchRoundCollectors,
  fetchRoundTopLiked,
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

/** How many collectors to fetch org labels for / render on the compact board. */
const BOARD_LIMIT = 12;
/** How many rows the single-screen board shows before it clips. */
const DISPLAY_LIMIT = 8;

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

type WinnerAccount = {
  did: string;
  name: string | null;
  avatarRef: string | null;
  count: number;
};

type PastRoundSummary = {
  round: BioblitzRound;
  mostSubmitted: WinnerAccount | null;
  mostLiked: WinnerAccount | null;
};

export function BioblitzClient() {
  // Resolve "now"-dependent state after mount so the server-rendered shell
  // can't disagree with the first client paint (countdown / round selection).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const snapshotNow = now ?? Date.now();
  const rounds = useMemo(() => bioblitzRounds(snapshotNow, 0), [snapshotNow]);
  const currentRound = useMemo(() => featuredRound(snapshotNow), [snapshotNow]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const round = useMemo(
    () => rounds.find((item) => item.id === (selectedRoundId ?? currentRound.id)) ?? currentRound,
    [rounds, selectedRoundId, currentRound],
  );

  useEffect(() => {
    if (selectedRoundId != null && !rounds.some((item) => item.id === selectedRoundId)) {
      setSelectedRoundId(null);
    }
  }, [rounds, selectedRoundId]);

  const status = now != null ? roundStatus(round, now) : roundStatus(round);

  const [board, setBoard] = useState<RoundBoard | null>(null);
  const [error, setError] = useState(false);
  // Which window the board tallies: the active round, or all-time.
  const [scope, setScope] = useState<BoardScope>("round");
  // Organisation membership per collector account, resolved after the board
  // loads and merged in progressively so the standings never wait on it.
  const [orgs, setOrgs] = useState<Map<string, CollectorOrg>>(new Map());
  // Recognition awards (previous BioBlitz wins, grants) per collector account,
  // shown as small emblems on the board rows. Same progressive pattern.
  const [awards, setAwards] = useState<Map<string, string[]>>(new Map());
  const pastRounds = useMemo(() => endedRounds(snapshotNow).slice(0, 4), [snapshotNow]);
  const pastRoundsKey = pastRounds.map((item) => item.id).join(",");
  const [pastWinners, setPastWinners] = useState<PastRoundSummary[] | null>(null);

  // Reset to the loading state whenever the active round or scope changes.
  useEffect(() => {
    setBoard(null);
    setError(false);
    setOrgs(new Map());
    setAwards(new Map());
  }, [round.id, scope]);

  // Resolve organisation labels + recognition awards for the collectors
  // currently on the board (one cached award-index read serves all rows).
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
    fetchRecognitionBadgesForDids(dids, ctrl.signal)
      .then((map) => {
        if (cancelled) return;
        setAwards(new Map([...map].map(([did, keys]) => [did, displayAwardKeys(keys)])));
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
  }, [round.id, round.start, round.end, scope]);

  useEffect(() => {
    if (pastRounds.length === 0) {
      setPastWinners([]);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setPastWinners(null);
    Promise.all(
      pastRounds.map(async (pastRound): Promise<PastRoundSummary> => {
        const [pastBoard, liked] = await Promise.all([
          fetchRoundCollectors(pastRound, "round", controller.signal).catch(() => null),
          fetchRoundTopLiked(pastRound, 1, controller.signal).catch(() => []),
        ]);
        const topCollector = pastBoard?.collectors[0] ?? null;
        const topLiked = liked[0] ?? null;
        return {
          round: pastRound,
          mostSubmitted: topCollector
            ? {
                did: topCollector.did,
                name: topCollector.displayName,
                avatarRef: topCollector.avatarRef,
                count: topCollector.count,
              }
            : null,
          mostLiked: topLiked
            ? {
                did: topLiked.record.did,
                name: topLiked.record.creatorName,
                avatarRef: topLiked.record.creatorAvatarRef,
                count: topLiked.likeCount,
              }
            : null,
        };
      }),
    )
      .then((result) => {
        if (!cancelled) setPastWinners(result);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError" && !cancelled) setPastWinners([]);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastRoundsKey]);

  return (
    <>
    <section className="relative -mt-14 flex min-h-[100dvh] shrink-0 flex-col overflow-hidden lg:min-h-[100dvh]">
      <BackgroundWash />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 pb-4 pt-[calc(3.5rem+0.75rem)] sm:px-6">
        <HeroBand round={round} status={status} />

        <RoundNavigator
          rounds={rounds}
          selectedId={round.id}
          currentId={currentRound.id}
          now={snapshotNow}
          onSelect={(id) => setSelectedRoundId(id === currentRound.id ? null : id)}
        />

        <ProofNote />

        <div className="grid flex-1 gap-4 lg:min-h-[34rem] lg:grid-cols-[minmax(0,5fr)_1px_minmax(0,7fr)]">
          <div className="flex flex-col gap-4 lg:min-h-0">
            <Prizes />
            <PastWinners rounds={pastRounds} summaries={pastWinners} />
            <Separator />
            <HowItWorks />
            <Separator />
            <CtaBlock />
          </div>

          <Separator orientation="vertical" className="hidden lg:block" />

          <div className="lg:min-h-0">
            <Board
              round={round}
              status={status}
              board={board}
              orgs={orgs}
              awards={awards}
              error={error}
              now={now}
              scope={scope}
              onScope={setScope}
            />
          </div>
        </div>
      </div>
    </section>

      <BioblitzGallery round={round} />

      <BioblitzBestPicture round={round} />

      <BioblitzObservationsMap round={round} />
    </>
  );
}

/** A faint nature wash at the top of the page — atmosphere without height. */
function BackgroundWash() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden opacity-60">
      <Image
        src="/assets/media/images/observations/observations-hero-light@2x.webp"
        alt=""
        fill
        priority
        quality={90}
        sizes={IMG_SIZES}
        className="object-cover object-center dark:hidden"
      />
      <Image
        src="/assets/media/images/observations/observations-hero-dark@2x.webp"
        alt=""
        fill
        priority
        quality={90}
        sizes={IMG_SIZES}
        className="hidden object-cover object-center dark:block"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background" />
    </div>
  );
}

/** Lightweight entrance fade — no scroll triggers, everything is on screen. */
function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

function Separator({
  orientation = "horizontal",
  className,
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`${orientation === "vertical" ? "h-full w-px" : "h-px w-full"} bg-border/60 ${className ?? ""}`}
    />
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-5 items-center justify-center text-primary [&_svg]:size-4">{icon}</span>
      <h2 className="font-instrument text-xl font-light italic leading-none text-foreground">{title}</h2>
    </div>
  );
}

// ── Hero band ─────────────────────────────────────────────────────────────────

function HeroBand({
  round,
  status,
}: {
  round: BioblitzRound;
  status: RoundStatus;
}) {
  const t = useTranslations("marketplace.bioblitz");
  const locale = useLocale();
  const dates = formatDateRange(round.start, round.end, locale);

  return (
    <FadeIn className="flex flex-col gap-5 px-1 py-4 md:flex-row md:items-center md:justify-between md:gap-10">
      <div className="min-w-0">
        <h1 className="font-instrument text-3xl font-light italic leading-[0.95] tracking-[-0.02em] text-foreground sm:text-4xl">
          {t("hero.titlePrefix")} <span className="text-primary">{t("hero.titleEmphasis")}</span>
        </h1>
        <p className="mt-2 max-w-md text-sm leading-snug text-muted-foreground">{t("hero.description")}</p>
        <div className="mt-3">
          <StatusChip status={status} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-instrument text-lg italic leading-none text-foreground">{round.label}</span>
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">{dates}</span>
        <RegisterButton round={round} status={status} />
      </div>
    </FadeIn>
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
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>
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

function RoundNavigator({
  rounds,
  selectedId,
  currentId,
  now,
  onSelect,
}: {
  rounds: BioblitzRound[];
  selectedId: number;
  currentId: number;
  now: number;
  onSelect: (id: number) => void;
}) {
  const t = useTranslations("marketplace.bioblitz.rounds");
  const statusT = useTranslations("marketplace.bioblitz.status");
  const locale = useLocale();
  const newestFirst = useMemo(() => [...rounds].sort((a, b) => b.id - a.id), [rounds]);

  return (
    <FadeIn delay={0.03} className="-mt-2">
      <div className="flex items-center gap-3 overflow-hidden rounded-2xl border border-border/60 bg-background/70 p-2 backdrop-blur">
        <div className="hidden shrink-0 pl-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:block">
          {t("title")}
        </div>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
          {newestFirst.map((item) => {
            const selected = item.id === selectedId;
            const isCurrent = item.id === currentId;
            const itemStatus = roundStatus(item, now);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-pressed={selected}
                className={`flex min-w-[9rem] shrink-0 flex-col rounded-xl border px-3 py-2 text-left transition-colors ${
                  selected
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-transparent bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                }`}
              >
                <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="truncate">{item.label}</span>
                  {isCurrent ? (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                      {t("current")}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 truncate text-[11px] tabular-nums opacity-80">
                  {formatDateRange(item.start, item.end, locale)}
                </span>
                <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] opacity-70">
                  {statusT(itemStatus)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </FadeIn>
  );
}

// ── Prizes ───────────────────────────────────────────────────────────────────

function Prizes() {
  const t = useTranslations("marketplace.bioblitz.prizes");
  const locale = useLocale();
  return (
    <FadeIn delay={0.05}>
      <Card>
        <SectionTitle icon={<TrophyIcon />} title={t("title")} />
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <PrizeTile
            featured
            amount={formatPrize(BIOBLITZ_PRIZES.mostObservations, locale)}
            icon={<TrophyIcon />}
            title={t("mostObservations.title")}
          />
          <PrizeTile
            amount={formatPrize(BIOBLITZ_PRIZES.bestPicture, locale)}
            icon={<CameraIcon />}
            title={t("bestPicture.title")}
          />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BadgeCheckIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
          {t("badgeNote")}
        </p>
      </Card>
    </FadeIn>
  );
}

function PrizeTile({
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
      className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3 text-center ${
        featured ? "bg-gradient-to-b from-primary/[0.16] via-primary/[0.05] to-transparent" : "bg-foreground/5"
      }`}
    >
      <span
        className={`flex size-8 items-center justify-center rounded-xl text-primary [&_svg]:size-4 ${
          featured ? "bg-primary/15" : "bg-primary/10"
        }`}
      >
        {icon}
      </span>
      <span className="font-instrument text-3xl italic leading-none text-primary">{amount}</span>
      <span className="text-xs font-semibold text-foreground">{title}</span>
    </div>
  );
}

function PastWinners({
  rounds,
  summaries,
}: {
  rounds: BioblitzRound[];
  summaries: PastRoundSummary[] | null;
}) {
  const t = useTranslations("marketplace.bioblitz.winners");
  const boardT = useTranslations("marketplace.bioblitz.board");
  const bestT = useTranslations("marketplace.bioblitz.bestPicture");
  const locale = useLocale();
  // Moderator-only round badge awarding; renders nothing for regular viewers.
  const awardHook = useBioblitzAwardState();
  if (rounds.length === 0) return null;
  const rows = summaries ?? rounds.map((round) => ({ round, mostSubmitted: null, mostLiked: null }));

  return (
    <FadeIn delay={0.08}>
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionTitle icon={<CrownIcon />} title={t("title")} />
          <span className="rounded-full bg-foreground/5 px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {t("compact")}
          </span>
        </div>
        <ul className="space-y-1.5">
          {rows.map((summary) => (
            <li key={summary.round.id} className="rounded-2xl bg-foreground/5 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{summary.round.label}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {formatDateRange(summary.round.start, summary.round.end, locale)}
                </span>
              </div>
              <div className="mt-1.5 grid gap-1 text-[11px] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <WinnerPill
                  icon={<TrophyIcon />}
                  label={t("mostSubmitted")}
                  winner={summary.mostSubmitted}
                  countLabel={summary.mostSubmitted ? boardT("observations", { count: summary.mostSubmitted.count }) : null}
                  pending={summaries == null ? "…" : t("pending")}
                />
                <WinnerPill
                  icon={<CameraIcon />}
                  label={t("mostLiked")}
                  winner={summary.mostLiked}
                  countLabel={summary.mostLiked ? bestT("likes", { count: summary.mostLiked.count }) : null}
                  pending={summaries == null ? "…" : t("pending")}
                />
              </div>
              <RoundAwardControl
                roundId={summary.round.id}
                hook={awardHook}
                hasWinners={Boolean(summary.mostSubmitted || summary.mostLiked)}
              />
            </li>
          ))}
        </ul>
      </Card>
    </FadeIn>
  );
}

function WinnerPill({
  icon,
  label,
  winner,
  countLabel,
  pending,
}: {
  icon: ReactNode;
  label: string;
  winner: WinnerAccount | null;
  countLabel: string | null;
  pending: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-background/70 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground [&_svg]:size-3">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      {winner ? (
        <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            <AuthorInline did={winner.did} nameOverride={winner.name} avatarRefOverride={winner.avatarRef} />
          </span>
          {countLabel ? <span className="shrink-0 text-[10px] text-muted-foreground">{countLabel}</span> : null}
        </div>
      ) : (
        <div className="mt-1 text-xs font-medium text-muted-foreground">{pending}</div>
      )}
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
    <FadeIn delay={0.1}>
      <Card>
        <SectionTitle icon={<BinocularsIcon />} title={t("title")} />
        <ol className="mt-2.5 space-y-1.5">
          {steps.map((step, index) => (
            <li key={step.key} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-3.5">
                {step.icon}
              </span>
              <span className="text-sm font-medium text-foreground">
                <span className="text-muted-foreground">{index + 1}.</span> {t(`steps.${step.key}.title`)}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </FadeIn>
  );
}

// ── Data-as-proof wide card ───────────────────────────────────────────────────

function ProofNote() {
  const t = useTranslations("marketplace.bioblitz.how.proof");
  return (
    <FadeIn delay={0.05}>
      <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-foreground sm:text-lg">{t("title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("uses")}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("outro")}</p>
      </div>
    </FadeIn>
  );
}

// ── Left-column call to action ────────────────────────────────────────────────

function CtaBlock() {
  const t = useTranslations("marketplace.bioblitz");
  const tHelp = useTranslations("marketplace.bioblitz.help");
  return (
    <FadeIn delay={0.15} className="mt-auto flex flex-col gap-2">
      <Link
        href="/manage/observations"
        className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-dark"
      >
        {t("board.cta")}
        <ChevronRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <a
          href={BIOBLITZ_LINKS.officeHours}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
        >
          <CalendarClockIcon className="size-3.5" aria-hidden />
          {tHelp("officeHours")}
        </a>
        <a
          href={BIOBLITZ_LINKS.community}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
        >
          <MessagesSquareIcon className="size-3.5" aria-hidden />
          {tHelp("community")}
        </a>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground/70">{t("hero.program")}</p>
    </FadeIn>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

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
    <div className="inline-flex rounded-full bg-muted/60 p-0.5">
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
                ? "bg-primary text-primary-foreground"
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
  awards,
  error,
  now,
  scope,
  onScope,
}: {
  round: BioblitzRound;
  status: RoundStatus;
  board: RoundBoard | null;
  orgs: Map<string, CollectorOrg>;
  awards: Map<string, string[]>;
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

  const stats: { label: string; value: string; icon: ReactNode; accent?: boolean }[] = [
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

  const collectors = board?.collectors.slice(0, DISPLAY_LIMIT) ?? [];

  return (
    <FadeIn delay={0.1} className="h-full">
      <Card className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-instrument text-xl italic leading-none text-foreground">{t("title")}</h2>
          </div>
          <ScopeToggle scope={scope} onScope={onScope} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3 text-center ${
                stat.accent ? "bg-gradient-to-b from-primary/[0.16] via-primary/[0.05] to-transparent" : "bg-foreground/5"
              }`}
            >
              <span
                className={`flex size-8 items-center justify-center rounded-xl text-primary [&_svg]:size-4 ${
                  stat.accent ? "bg-primary/15" : "bg-primary/10"
                }`}
              >
                {stat.icon}
              </span>
              <div className="font-instrument text-2xl italic leading-none tabular-nums text-primary">{stat.value}</div>
              <div className="text-[10px] font-semibold leading-tight text-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {board ? (
            collectors.length === 0 ? (
              <BoardMessage icon={<BinocularsIcon />} title={t("empty.title")} description={t("empty.description")} />
            ) : (
              <ul className="flex flex-col gap-1.5 rounded-2xl bg-muted p-2">
                {collectors.map((collector, index) => (
                  <CollectorRow
                    key={collector.did}
                    rank={index + 1}
                    leader={index === 0}
                    did={collector.did}
                    name={collector.displayName}
                    avatarRef={collector.avatarRef}
                    count={collector.count}
                    org={orgs.get(collector.did)}
                    awards={awards.get(collector.did)}
                  />
                ))}
              </ul>
            )
          ) : error ? (
            <BoardMessage icon={<TrophyIcon />} title={t("error.title")} description={t("error.description")} />
          ) : (
            <BoardSkeleton />
          )}
        </div>
      </Card>
    </FadeIn>
  );
}

const RANK_TIERS: Record<number, string> = {
  2: "bg-slate-400/25 text-slate-600 dark:text-slate-300",
  3: "bg-orange-400/20 text-orange-700 dark:text-orange-300",
};

const TOP_ROW_BORDERS: Record<number, string> = {
  1: "border-primary",
  2: "border-primary/60",
  3: "border-primary/30",
};

function CollectorRow({
  rank,
  leader,
  did,
  name,
  avatarRef,
  count,
  org,
  awards,
}: {
  rank: number;
  leader: boolean;
  did: string;
  name: string | null;
  avatarRef: string | null;
  count: number;
  org?: CollectorOrg;
  awards?: string[];
}) {
  const t = useTranslations("marketplace.bioblitz.board");
  return (
    <li>
      <PreferredAccountLink
        did={did}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("openCollector")}
        className={`group flex items-center gap-3 rounded-2xl border-[3px] bg-background px-3 py-2 text-foreground transition-colors duration-200 hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_.truncate]:text-foreground/85 ${
          TOP_ROW_BORDERS[rank] ?? "border-transparent"
        }`}
      >
        <span
          aria-label={t("rankAriaLabel", { rank })}
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
            leader ? "bg-primary/15 text-primary" : RANK_TIERS[rank] ?? "bg-foreground/10 text-muted-foreground"
          }`}
        >
          {leader ? <CrownIcon className="size-3.5" aria-hidden /> : rank}
        </span>

        <div className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-lg font-medium text-foreground">
            <AuthorInline did={did} nameOverride={name} avatarRefOverride={avatarRef} />
            {awards && awards.length > 0 ? <AwardEmblems badges={awards} size="sm" /> : null}
          </span>
          <OrgLabel org={org} />
        </div>

        <span className="shrink-0 text-right">
          <span className="font-instrument block text-sm italic leading-none tabular-nums text-primary">{formatNumber(count)}</span>
        </span>

        <ChevronRightIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </PreferredAccountLink>
    </li>
  );
}

/** Subtle organisation-membership chip shown under a collector's name. */
function OrgLabel({ org }: { org?: CollectorOrg }) {
  const t = useTranslations("marketplace.bioblitz.board.org");
  if (!org || !org.isOrganization) {
    return <span className="mt-0.5 inline-flex text-[11px] font-medium leading-none text-muted-foreground">{t("account")}</span>;
  }
  const typeLabel =
    org.orgType && KNOWN_ORG_TYPES.has(org.orgType) ? t(`types.${org.orgType}`) : t("label");
  const parts = [typeLabel];
  if (org.memberCount > 0) parts.push(t("members", { count: org.memberCount }));
  return (
    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium leading-none text-muted-foreground">
      <Building2Icon className="size-3 shrink-0" aria-hidden />
      {parts.join(" · ")}
    </span>
  );
}

function BoardSkeleton() {
  return (
    <ul className="flex flex-col gap-1.5">
      {Array.from({ length: 6 }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 rounded-2xl bg-foreground/5 px-3 py-2.5">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-36 max-w-full" />
          </div>
          <Skeleton className="h-4 w-10 shrink-0" />
        </li>
      ))}
    </ul>
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
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl bg-foreground/5 px-6 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-6 [&_svg]:opacity-60">
        {icon}
      </div>
      <p className="font-instrument text-2xl font-light italic text-foreground">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
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
  return `${startFmt} to ${endFmt}`;
}
