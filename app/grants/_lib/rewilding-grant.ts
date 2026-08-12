/**
 * Data access for the Rewilding the Web grantee dashboard.
 *
 * The program structure here is real — it mirrors the Rewilding the Web
 * Program Handbook (Linear doc `program-handbook-ed23eb2f3242`): four
 * milestones (M1–M4) gating three payment tranches of a USD 1,000 grant, and
 * a 7,000-minute recording target per community toward the Klarna KPI.
 *
 * The grantee's *state* against that structure is not real yet: milestone
 * check-offs, recorders and recording minutes have no backing records, so
 * progress starts at zero and marking a milestone is switched off. When the
 * backing records land, replace the bodies of the fetchers and pass a real
 * `onMarkMilestoneDone` writer; drop
 * `REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA` at the same time.
 */

import type { GrantOverview, Recorder } from "../_components/rewilding/model";

/** True while grantee progress below is a stand-in rather than read from
 *  records. The page shell uses it to tell the viewer what they are seeing. */
export const REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA = true;

/** Program constants from the handbook. */
export const REWILDING_GRANT_AMOUNT_USD = 1000;
export const REWILDING_AUDIO_TARGET_MINUTES = 7000;

export async function fetchGrantOverview(): Promise<GrantOverview> {
  return {
    // Unknown until a grant record exists — the view falls back to a generic
    // heading rather than inventing a project name.
    projectName: null,
    granteeLabel: null,
    nextStep: null,
    audioMinutes: 0,
    audioTrend: [],
    audioTargetMinutes: REWILDING_AUDIO_TARGET_MINUTES,
    grantAmountUsd: REWILDING_GRANT_AMOUNT_USD,
    speciesCount: 0,
    speciesTrend: [],
    // The four contract milestones, verbatim from the Program Handbook.
    // Titles/descriptions are program copy every grantee sees in their
    // contract, so they are data, not UI strings to translate ad hoc.
    milestones: [
      {
        id: "m1",
        code: "M1",
        title: "Contract signed",
        description: "Agreement in place; first payment released.",
        state: "todo",
        payout: { tranche: 1, amountUsd: 333 },
      },
      {
        id: "m2",
        code: "M2",
        title: "AudioMoth deployed",
        description: "Sensors placed in the field and actively recording.",
        state: "todo",
        isRecorderInventory: true,
      },
      {
        id: "m3",
        code: "M3",
        title: "First data uploaded",
        description: "Recordings uploaded to GainForest.app.",
        state: "todo",
        // Tranche 2 releases when M2 *and* M3 are confirmed — the handbook
        // hangs the payout on the pair, so it is shown on the later of the two.
        payout: { tranche: 2, amountUsd: 333 },
      },
      {
        id: "m4",
        code: "M4",
        title: "Project complete",
        description: "Data labelled and at least one public update posted on Bumicerts.",
        state: "todo",
        payout: { tranche: 3, amountUsd: 334 },
      },
    ],
  };
}

export async function fetchRecorders(): Promise<Recorder[]> {
  return [];
}
