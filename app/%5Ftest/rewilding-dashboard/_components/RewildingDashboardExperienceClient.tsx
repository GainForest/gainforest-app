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
  REWILDING_GRANT_START_ISO,
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

const GRANT_START = REWILDING_GRANT_START_ISO;
/** The fixture "today": mid-grant, so the pace chart has a window to draw.
 *  Fixed rather than taken from the clock so the scenarios never drift. */
const LAST_DAY = Date.parse("2026-10-15T12:00:00.000Z");
/** A date before the window opens, for the not-yet-started scenario. */
const BEFORE_START = Date.parse("2026-08-13T12:00:00.000Z");
const DAY_MS = 86_400_000;

/** One upload per day at a steady rate over a span. */
function dailyUploads(minutesPerDay: number, from: number, to: number) {
  const events: { t: number; seconds: number }[] = [];
  for (let t = from; t <= to; t += DAY_MS) {
    events.push({ t, seconds: minutesPerDay * 60 });
  }
  return events;
}

function scenario(minutesPerDay: number, now: number = LAST_DAY): GrantOverview {
  // Before the window opens the only uploads are earlier ones, so the fixture
  // records them over the fortnight leading up to "now".
  const from = now < Date.parse(GRANT_START) ? now - 13 * DAY_MS : Date.parse(GRANT_START);
  const events = dailyUploads(minutesPerDay, from, now);
  const totalMinutes = Math.round(events.reduce((sum, e) => sum + e.seconds, 0) / 60);
  const series = buildAudioSeries(events, now);

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
      now,
    }),
    grantAmountUsd: REWILDING_GRANT_AMOUNT_USD,
    speciesCount: 0,
    speciesTrend: [],
    // Due dates and the custom milestone mirror what an admin can now set per
    // grantee. M2's date is fixed in the past so the overdue chip always
    // shows; the program milestones carry the handbook payments (with their
    // tranche numbers), and the custom row carries its own admin-written name,
    // description and a custom payment — shown with no tranche — and continues
    // the numbering after the program milestones.
    milestones: [
      { id: "m1", code: "M1", state: "done", dueDate: "2026-09-08", payout: { tranche: 1, amountUsd: 333 } },
      { id: "m2", code: "M2", state: "todo", dueDate: "2026-08-01", isRecorderInventory: true },
      { id: "m3", code: "M3", state: "todo", dueDate: "2026-10-20", payout: { tranche: 2, amountUsd: 333 } },
      { id: "m4", code: "M4", state: "todo", payout: { tranche: 3, amountUsd: 334 } },
      {
        id: "cpreview1",
        code: "M5",
        title: "Community training session",
        description: "Half-day session with local rangers on deploying recorders and uploading data.",
        isCustom: true,
        state: "todo",
        dueDate: "2026-11-10",
        payout: { amountUsd: 150 },
      },
    ],
  };
}

/** Before the window opens: the chart draws the uploads as a head start,
 *  with the required line flat at zero — never a pace verdict. */
const UPCOMING = scenario(20, BEFORE_START);
/** A few minutes a day — far off the pace the window demands. */
const BEHIND = scenario(4);
/** Comfortably past the line the grant needs. */
const AHEAD = scenario(90);
/** Target already met — the chart stops asking for a pace. */
const MET = scenario(200);
/** No uploads at all: the chart is omitted rather than drawn empty. */
const NO_AUDIO: GrantOverview = {
  ...scenario(0),
  audioMinutes: 0,
  audioSeries: null,
};

const SCENARIOS = [
  { key: "upcoming", overview: UPCOMING },
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
