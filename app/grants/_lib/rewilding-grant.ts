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
 * signed-in grantee. The "Audio uploaded" stat is real too: it counts the
 * grant account's `app.gainforest.ac.audio` records from the hyperindex (see
 * `rewilding-audio.ts`), the same records Bumiscan's Klarna scorecard tracks.
 * Recorders and species still have no backing records, so those figures start
 * at zero; when they land, replace their fetchers and drop
 * `REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA`.
 *
 * Grant documents are intentionally absent here. They are private to the
 * admin group for now (private object storage, no public URL), so nothing on
 * this page can surface them until we decide how a grantee should see their
 * own contract.
 */

import {
  REWILDING_AUDIO_TARGET_MINUTES,
  REWILDING_GRANT_AMOUNT_USD,
  REWILDING_GRANT_END_ISO,
  REWILDING_GRANT_START_ISO,
  doneRewildingMilestoneIds,
  fetchRewildingMilestonePlans,
  fetchRewildingMilestones,
  resolveRewildingMilestonePlan,
} from "@/app/_lib/rewilding-milestones";
import { EMPTY_AUDIO_STATS, buildAudioPace, fetchGranteeAudioStats } from "./rewilding-audio";
import type { GrantOverview, Recorder } from "../_components/rewilding/model";

/** True while the recorder and species stats below are stand-ins rather than
 *  read from records. The page shell uses it to tell the viewer what they are
 *  seeing. Audio-upload figures are already live. */
export const REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA = true;

export {
  REWILDING_AUDIO_TARGET_MINUTES,
  REWILDING_GRANT_AMOUNT_USD,
  REWILDING_GRANT_END_ISO,
  REWILDING_GRANT_START_ISO,
};

/**
 * The grant overview for one grantee. Milestone states come from the
 * confirmations GainForest wrote in the admin panel; a null/unknown viewer
 * simply sees every milestone still to do.
 */
export async function fetchGrantOverview(viewerDid: string | null): Promise<GrantOverview> {
  // Audio figures degrade to zero on indexer failure rather than breaking the
  // page — milestones are the load-bearing content here.
  const [milestoneRecords, milestonePlanRecords, audio] = await Promise.all([
    viewerDid ? fetchRewildingMilestones().catch(() => []) : Promise.resolve([]),
    viewerDid ? fetchRewildingMilestonePlans().catch(() => []) : Promise.resolve([]),
    viewerDid ? fetchGranteeAudioStats(viewerDid).catch(() => EMPTY_AUDIO_STATS) : Promise.resolve(EMPTY_AUDIO_STATS),
  ]);
  const done = viewerDid ? doneRewildingMilestoneIds(milestoneRecords, viewerDid) : new Set<string>();
  // The grantee's own plan: program milestones with any due dates the grant
  // team set, plus milestones added just for them.
  const plan = resolveRewildingMilestonePlan(milestonePlanRecords, viewerDid ?? "");

  // One program-wide window, the same for every grantee.
  const audioPace = buildAudioPace({
    audioMinutes: audio.audioMinutes,
    targetMinutes: REWILDING_AUDIO_TARGET_MINUTES,
    startMs: Date.parse(REWILDING_GRANT_START_ISO),
    endMs: Date.parse(REWILDING_GRANT_END_ISO),
  });

  return {
    // Unknown until a grant record exists — the view falls back to a generic
    // heading rather than inventing a project name.
    projectName: null,
    granteeLabel: null,
    nextStep: null,
    audioMinutes: audio.audioMinutes,
    audioTrend: audio.audioTrend,
    audioTargetMinutes: REWILDING_AUDIO_TARGET_MINUTES,
    audioDeadline: REWILDING_GRANT_END_ISO,
    audioPace,
    audioGrantStart: REWILDING_GRANT_START_ISO,
    audioSeries: audio.audioSeries,
    grantAmountUsd: REWILDING_GRANT_AMOUNT_USD,
    speciesCount: 0,
    speciesTrend: [],
    milestones: plan.map((resolved) => ({
      id: resolved.id,
      code: resolved.code,
      ...(resolved.title ? { title: resolved.title } : {}),
      ...(resolved.dueDate ? { dueDate: resolved.dueDate } : {}),
      state: done.has(resolved.id) ? "done" : "todo",
      ...(resolved.payout ? { payout: resolved.payout } : {}),
      ...(resolved.isRecorderInventory ? { isRecorderInventory: true } : {}),
    })),
  };
}

export async function fetchRecorders(): Promise<Recorder[]> {
  return [];
}
