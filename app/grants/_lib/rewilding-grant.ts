/**
 * Data access for the Rewilding the Web grantee dashboard.
 *
 * The program structure here is real — it mirrors the Rewilding the Web
 * Program Handbook (Linear doc `program-handbook-ed23eb2f3242`): four
 * milestones (M1–M4) gating three payment tranches of a USD 1,000 grant, and
 * a 7,000-minute recording target per community toward the Klarna KPI.
 *
 * Milestone states are real: GainForest confirms milestones from the admin
 * panel's "Rewilding the Web" section, and this page reads them back for the
 * signed-in grantee. Recording stats and recorders still have no backing
 * records, so those figures start at zero; when they land, replace their
 * fetchers and drop `REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA`.
 *
 * Grant documents are intentionally absent here. They are private to the
 * admin group for now (private object storage, no public URL), so nothing on
 * this page can surface them until we decide how a grantee should see their
 * own contract.
 */

import {
  REWILDING_AUDIO_TARGET_MINUTES,
  REWILDING_GRANT_AMOUNT_USD,
  REWILDING_MILESTONES,
  doneRewildingMilestoneIds,
  fetchRewildingMilestones,
} from "@/app/_lib/rewilding-milestones";
import type { GrantOverview, Recorder } from "../_components/rewilding/model";

/** True while the recording stats below are stand-ins rather than read from
 *  records. The page shell uses it to tell the viewer what they are seeing. */
export const REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA = true;

export { REWILDING_AUDIO_TARGET_MINUTES, REWILDING_GRANT_AMOUNT_USD };

/**
 * The grant overview for one grantee. Milestone states come from the
 * confirmations GainForest wrote in the admin panel; a null/unknown viewer
 * simply sees every milestone still to do.
 */
export async function fetchGrantOverview(viewerDid: string | null): Promise<GrantOverview> {
  const milestoneRecords = viewerDid ? await fetchRewildingMilestones().catch(() => []) : [];
  const done = viewerDid ? doneRewildingMilestoneIds(milestoneRecords, viewerDid) : new Set<string>();

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
    milestones: REWILDING_MILESTONES.map((definition) => ({
      id: definition.id,
      code: definition.code,
      state: done.has(definition.id) ? "done" : "todo",
      ...(definition.payout ? { payout: definition.payout } : {}),
      ...(definition.isRecorderInventory ? { isRecorderInventory: true } : {}),
    })),
  };
}

export async function fetchRecorders(): Promise<Recorder[]> {
  return [];
}
