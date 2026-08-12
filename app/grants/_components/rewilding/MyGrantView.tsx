"use client";

import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { GrantMilestone, GrantOverview, Recorder } from "./model";
import { countByOrigin } from "./model";
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
          <div className="mt-2 flex flex-col gap-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.min(100, (overview.audioMinutes / Math.max(1, overview.audioTargetMinutes)) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">
              {t("grant.stats.audioTarget", { target: format.number(overview.audioTargetMinutes) })}
            </span>
          </div>
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

function MilestoneRow({
  milestone,
  onOpenRecorders,
}: {
  milestone: GrantMilestone;
  onOpenRecorders: () => void;
}) {
  const t = useTranslations("marketplace.grants.rewildingDashboard.grant.milestones");
  // Each milestone's name and description are program copy, translated per
  // locale and keyed by milestone id.
  const program = useTranslations("common.rewildingProgram.milestones");
  const format = useFormatter();

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
            {program(`${milestone.id}.title`)}
          </span>
          {milestone.payout ? (
            <span className="rounded-full border border-border px-2 py-px text-[10px] font-medium text-muted-foreground">
              {t("payout", {
                amount: format.number(milestone.payout.amountUsd),
                tranche: milestone.payout.tranche,
              })}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {program(`${milestone.id}.description`)}
        </p>
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
