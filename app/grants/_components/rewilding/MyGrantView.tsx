"use client";

import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { GrantMilestone, GrantOverview, Recorder } from "./model";
import { countByOrigin, isDueDatePast } from "./model";
import { AudioPaceChart } from "./AudioPaceChart";
import { Sparkline } from "./Sparkline";

/**
 * "My grant" — the Rewilding the Web grantee's overview page: the one next
 * step, the headline numbers and the milestone list. Pure view: all data
 * arrives via props so the same component renders against live data or
 * fixtures.
 *
 * Milestones gate the grant's payment tranches, so the grantee cannot mark
 * one done here — GainForest confirms milestones from the admin panel, and
 * this page only reflects that state.
 */
export function MyGrantView({
  overview,
  recorders,
  onOpenRecorders,
}: {
  overview: GrantOverview;
  recorders: readonly Recorder[];
  /** Navigate to the "My recorders" page (next-step CTA + deployment milestone). */
  onOpenRecorders: () => void;
}) {
  const t = useTranslations("marketplace.grants.rewildingDashboard");
  const format = useFormatter();
  const originCounts = countByOrigin(recorders);
  const confirmedCount = overview.milestones.filter((m) => m.state === "done").length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {overview.projectName ?? t("grant.untitled")}
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("grant.amount", { amount: format.number(overview.grantAmountUsd) })}
          </span>
          {overview.granteeLabel ? (
            <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              {overview.granteeLabel}
            </span>
          ) : null}
        </div>
      </header>

      {overview.nextStep ? (
        <section
          aria-label={t("grant.nextStepEyebrow")}
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-amber-700 dark:text-amber-400">
              {t("grant.nextStepEyebrow")}
              {overview.nextStep.dueDate
                ? ` · ${t("grant.dueBy", { date: format.dateTime(new Date(overview.nextStep.dueDate), { weekday: "short" }) })}`
                : null}
            </span>
            <span className="text-base font-semibold text-foreground">{overview.nextStep.title}</span>
          </div>
          <button
            type="button"
            onClick={onOpenRecorders}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            {t("grant.openRecorders")}
            <ArrowRightIcon className="size-3.5" aria-hidden />
          </button>
        </section>
      ) : null}

      <section aria-label={t("grant.statsLabel")} className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("grant.stats.audioUploaded")}
          value={t("grant.stats.audioValue", { minutes: format.number(overview.audioMinutes) })}
          trend={overview.audioTrend}
        >
          <AudioTargetBar overview={overview} />
        </StatCard>
        <StatCard label={t("grant.stats.recorders")} value={format.number(recorders.length)}>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-medium text-primary">
              {t("grant.stats.recordersYours", { count: originCounts.owned })}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t("grant.stats.recordersShipped", { count: originCounts.gainforest })}
            </span>
          </div>
        </StatCard>
        <StatCard
          label={t("grant.stats.speciesTagged")}
          value={format.number(overview.speciesCount)}
          trend={overview.speciesTrend}
        />
      </section>

      {/* Pace against the recording target. Needs at least one upload to plot;
          before the window opens the chart still draws, presenting uploads as
          a head start rather than a pace verdict. */}
      {overview.audioSeries && overview.audioPace && overview.audioGrantStart ? (
        <AudioPaceChart
          series={overview.audioSeries}
          pace={overview.audioPace}
          grantStart={overview.audioGrantStart}
          deadline={overview.audioDeadline}
          targetMinutes={overview.audioTargetMinutes}
          currentMinutes={overview.audioMinutes}
        />
      ) : null}

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">{t("grant.milestones.title")}</h3>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {overview.milestones.length > 0
              ? t("grant.milestones.progress", { done: confirmedCount, total: overview.milestones.length })
              : t("grant.milestones.notStarted")}
          </span>
        </div>
        {overview.milestones.length > 0 ? (
          <>
            <ol className="flex flex-col gap-2">
              {overview.milestones.map((milestone) => (
                <MilestoneRow key={milestone.id} milestone={milestone} onOpenRecorders={onOpenRecorders} />
              ))}
            </ol>
            <p className="text-xs leading-5 text-muted-foreground">{t("grant.milestones.reviewNote")}</p>
          </>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">{t("grant.milestones.empty")}</p>
        )}
      </section>

    </div>
  );
}

/**
 * Progress toward the recording target, with the grant's closing date and
 * the pace it implies. The notch on the bar marks where a grantee on a
 * straight line to target would be today, so being behind is visible at a
 * glance rather than only in the number.
 */
function AudioTargetBar({ overview }: { overview: GrantOverview }) {
  const t = useTranslations("marketplace.grants.rewildingDashboard.grant.stats");
  const format = useFormatter();
  const { audioMinutes, audioTargetMinutes, audioDeadline, audioPace } = overview;

  const pct = (minutes: number) =>
    Math.min(100, Math.max(0, (minutes / Math.max(1, audioTargetMinutes)) * 100));
  // Where the straight line to target sits today: actual minus how far off it
  // the grantee is.
  const expectedMinutes = audioPace ? audioMinutes - audioPace.deltaVsPace : null;
  const behind = audioPace ? audioPace.deltaVsPace < 0 : false;

  // A calendar date, not a moment: formatted in UTC so the 30 Nov deadline
  // does not read as 1 December for viewers east of UTC.
  const deadlineLabel = format.dateTime(new Date(audioDeadline), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct(audioMinutes)}%` }}
        />
        {expectedMinutes !== null && audioPace?.status === "active" ? (
          <span
            className="absolute top-0 h-full w-0.5 -translate-x-1/2 rounded-full bg-amber-500"
            style={{ left: `${pct(expectedMinutes)}%` }}
          />
        ) : null}
      </div>

      <span className="text-[10px] font-medium text-muted-foreground">
        {t("audioTargetBy", {
          target: format.number(audioTargetMinutes),
          date: deadlineLabel,
        })}
      </span>

      {audioPace ? (
        <span
          className={cn(
            "text-[10px] font-medium",
            audioPace.status === "met"
              ? "text-primary"
              : audioPace.status === "active" && behind
                ? "text-amber-700 dark:text-amber-400"
                : "text-muted-foreground",
          )}
        >
          {audioPace.status === "met"
            ? t("audioTargetMet")
            : audioPace.status === "closed"
              ? t("audioGrantClosed")
              : audioPace.status === "upcoming"
                ? // Nobody is behind before the window opens — state when it
                  // does and the pace it will ask for.
                  t("audioStartsIn", {
                    days: audioPace.daysUntilStart,
                    rate: format.number(Math.round(audioPace.requiredPerDay ?? 0)),
                  })
                : t(behind ? "audioBehindPace" : "audioAheadPace", {
                    minutes: format.number(Math.abs(audioPace.deltaVsPace)),
                    days: audioPace.daysRemaining,
                  })}
        </span>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  children,
}: {
  label: string;
  value: string;
  trend?: readonly number[];
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
        {children}
      </div>
      {trend && trend.length > 1 ? <Sparkline values={trend} className="h-9 w-20 shrink-0" /> : null}
    </div>
  );
}

/** Milestone due dates are calendar dates: formatted in UTC — like the grant
 *  deadline — so the named day never shifts with the viewer's timezone. The
 *  year appears only when it isn't the current one. */
function formatDueDate(format: ReturnType<typeof useFormatter>, dueDate: string): string {
  const date = new Date(`${dueDate}T00:00:00.000Z`);
  const sameYear = dueDate.slice(0, 4) === new Date().toISOString().slice(0, 4);
  return format.dateTime(date, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

function MilestoneRow({
  milestone,
  onOpenRecorders,
}: {
  milestone: GrantMilestone;
  onOpenRecorders: () => void;
}) {
  const t = useTranslations("marketplace.grants.rewildingDashboard.grant.milestones");
  // Program milestones carry no title of their own — their name and
  // description are translated copy keyed by milestone id. Custom milestones
  // carry the name the grant team wrote for this grantee.
  const program = useTranslations("common.rewildingProgram.milestones");
  const format = useFormatter();
  const overdue =
    milestone.state !== "done" && !!milestone.dueDate && isDueDatePast(milestone.dueDate);
  // The grant team's wording wins; program milestones fall back to the
  // translated program copy. Custom milestones have no copy to fall back to.
  const title = milestone.title ?? (milestone.isCustom ? "" : program(`${milestone.id}.title`));
  const description =
    milestone.description ?? (milestone.isCustom ? null : program(`${milestone.id}.description`));

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-3",
        milestone.state === "done" && "border-primary/30 bg-primary/[0.04]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md border",
          milestone.state === "done"
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background",
        )}
      >
        {milestone.state === "done" ? <CheckIcon className="size-3.5" /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-[10px] font-semibold text-muted-foreground">{milestone.code}</span>
          <span
            className={cn(
              "text-sm font-medium",
              milestone.state === "done" ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {title}
          </span>
          {milestone.dueDate ? (
            <span
              className={cn(
                "rounded-full border px-2 py-px text-[10px] font-medium",
                overdue
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "border-border text-muted-foreground",
              )}
            >
              {overdue
                ? t("overdue", { date: formatDueDate(format, milestone.dueDate) })
                : t("dueOn", { date: formatDueDate(format, milestone.dueDate) })}
            </span>
          ) : null}
          {milestone.payout ? (
            <span className="rounded-full border border-border px-2 py-px text-[10px] font-medium text-muted-foreground">
              {t("payout", {
                amount: format.number(milestone.payout.amountUsd),
                tranche: milestone.payout.tranche,
              })}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
        {milestone.isRecorderInventory && milestone.state !== "done" ? (
          <button
            type="button"
            onClick={onOpenRecorders}
            className="group mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            {t("viewRecorders")}
            <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {milestone.state === "done" ? (
        <span className="shrink-0 rounded-full border border-primary/40 px-3 py-1 text-[11px] font-medium text-primary">
          {t("confirmed")}
        </span>
      ) : (
        <span className="shrink-0 rounded-full border border-border px-3 py-1 text-[11px] font-medium text-muted-foreground">
          {t("pending")}
        </span>
      )}
    </li>
  );
}
