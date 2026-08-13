"use client";

import Link from "next/link";
import { ArrowLeftIcon, FlaskConicalIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { MyGrantView } from "@/app/grants/_components/rewilding/MyGrantView";
import type { GrantOverview } from "@/app/grants/_components/rewilding/model";
import { buildAudioPace, buildAudioSeries } from "@/app/grants/_lib/rewilding-audio";
import {
  REWILDING_AUDIO_TARGET_MINUTES,
  REWILDING_GRANT_AMOUNT_USD,
  REWILDING_GRANT_END_ISO,
} from "@/app/_lib/rewilding-milestones";

/**
 * "My grant" in each state its audio pace chart can be in.
 *
 * `MyGrantView` — chart included — is the production component; only the
 * grant data is fixture. Dates are fixed rather than derived from the clock
 * so the scenarios stay stable, and the pace math is the real
 * `buildAudioPace`/`buildAudioSeries`, so a change to either shows up here.
 * Nothing on this route reads the indexer or a viewer's enrollment.
 */

const GRANT_START = "2026-06-01T00:00:00.000Z";
/** The fixture "today" — the last day the series carries data. */
const LAST_DAY = Date.parse("2026-08-13T12:00:00.000Z");
const DAY_MS = 86_400_000;

/** One upload per day at a steady rate, from the grant start to the fixture's
 *  today. Deterministic, so the scenarios never drift. */
function dailyUploads(minutesPerDay: number) {
  const start = Date.parse(GRANT_START);
  const events: { t: number; seconds: number }[] = [];
  for (let t = start; t <= LAST_DAY; t += DAY_MS) {
    events.push({ t, seconds: minutesPerDay * 60 });
  }
  return events;
}

function scenario(minutesPerDay: number): GrantOverview {
  const events = dailyUploads(minutesPerDay);
  const totalMinutes = Math.round(events.reduce((sum, e) => sum + e.seconds, 0) / 60);
  const series = buildAudioSeries(events, LAST_DAY);

  return {
    projectName: null,
    granteeLabel: "Preview organization",
    nextStep: null,
    audioMinutes: totalMinutes,
    audioTrend: [],
    audioTargetMinutes: REWILDING_AUDIO_TARGET_MINUTES,
    audioDeadline: REWILDING_GRANT_END_ISO,
    audioGrantStart: GRANT_START,
    audioSeries: series,
    audioPace: buildAudioPace({
      audioMinutes: totalMinutes,
      targetMinutes: REWILDING_AUDIO_TARGET_MINUTES,
      startMs: Date.parse(GRANT_START),
      endMs: Date.parse(REWILDING_GRANT_END_ISO),
      now: LAST_DAY,
    }),
    grantAmountUsd: REWILDING_GRANT_AMOUNT_USD,
    speciesCount: 0,
    speciesTrend: [],
    milestones: [
      { id: "m1", code: "M1", state: "done", payout: { tranche: 1, amountUsd: 333 } },
      { id: "m2", code: "M2", state: "todo", isRecorderInventory: true },
      { id: "m3", code: "M3", state: "todo", payout: { tranche: 2, amountUsd: 333 } },
      { id: "m4", code: "M4", state: "todo", payout: { tranche: 3, amountUsd: 334 } },
    ],
  };
}

/** Roughly the real-world figure today: a few minutes a day, far off pace. */
const BEHIND = scenario(4);
/** Comfortably past the line the grant needs. */
const AHEAD = scenario(45);
/** Target already met — the chart stops asking for a pace. */
const MET = scenario(100);
/** No uploads at all: the chart is omitted rather than drawn empty. */
const NO_AUDIO: GrantOverview = {
  ...scenario(0),
  audioMinutes: 0,
  audioSeries: null,
};

const SCENARIOS = [
  { key: "behind", overview: BEHIND },
  { key: "ahead", overview: AHEAD },
  { key: "met", overview: MET },
  { key: "noAudio", overview: NO_AUDIO },
] as const;

export function RewildingDashboardExperienceClient() {
  const t = useTranslations("cart.testRegistry");
  const scenarioCopy = useTranslations("cart.testRegistry.rewildingDashboard");

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/_test"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {t("backToRegistry")}
        </Link>

        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2 text-primary">
            <FlaskConicalIcon className="size-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">{t("scenarioLabel")}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {scenarioCopy("title")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            {scenarioCopy("description")}
          </p>
        </div>

        <aside className="mt-7 flex items-start gap-3 rounded-3xl border border-primary/20 bg-primary/[0.06] p-5">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheckIcon className="size-5" aria-hidden />
          </div>
          <p className="text-sm leading-6 text-foreground/75">{scenarioCopy("safetyNote")}</p>
        </aside>

        <div className="mt-10 flex flex-col gap-12">
          {SCENARIOS.map(({ key, overview }) => (
            <section key={key} className="flex flex-col gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">{scenarioCopy(`${key}.title`)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{scenarioCopy(`${key}.description`)}</p>
              </div>
              <div className="rounded-3xl border border-border bg-background p-4 sm:p-6">
                <MyGrantView overview={overview} recorders={[]} onOpenRecorders={() => {}} />
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
