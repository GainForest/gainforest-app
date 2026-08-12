/**
 * Data access for the Rewilding the Web grantee dashboard.
 *
 * The program structure here is real — it mirrors the Rewilding the Web
 * Program Handbook (Linear doc `program-handbook-ed23eb2f3242`): four
 * milestones (M1–M4) gating three payment tranches of a USD 1,000 grant, and
 * a 7,000-minute recording target per community toward the Klarna KPI.
 *
 * Milestone states and grant documents are real: GainForest confirms
 * milestones and uploads documents (the signed contract etc.) from the admin
 * panel's "Rewilding the Web" section, and this page reads them back for the
 * signed-in grantee. Recording stats and recorders still have no backing
 * records, so those figures start at zero; when they land, replace their
 * fetchers and drop `REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA`.
 */

import { GAINFOREST_MODERATION_REPO_DID } from "@/app/_lib/indexer";
import { resolveBlobUrl } from "@/app/_lib/pds";
import {
  REWILDING_AUDIO_TARGET_MINUTES,
  REWILDING_GRANT_AMOUNT_USD,
  REWILDING_MILESTONES,
  doneRewildingMilestoneIds,
  fetchRewildingDocuments,
  fetchRewildingMilestones,
} from "@/app/_lib/rewilding-milestones";
import type { GrantDocument, GrantOverview, Recorder } from "../_components/rewilding/model";

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
      title: definition.title,
      description: definition.description,
      state: done.has(definition.id) ? "done" : "todo",
      ...(definition.payout ? { payout: definition.payout } : {}),
      ...(definition.isRecorderInventory ? { isRecorderInventory: true } : {}),
    })),
  };
}

/** The grant documents GainForest uploaded for this grantee, newest first. */
export async function fetchGrantDocuments(viewerDid: string | null): Promise<GrantDocument[]> {
  if (!viewerDid) return [];
  const records = await fetchRewildingDocuments().catch(() => []);
  const own = records.filter((record) => record.subjectDid === viewerDid);
  return Promise.all(
    own.map(async (record) => ({
      id: record.rkey,
      title: record.title,
      fileName: record.fileName,
      url: await resolveBlobUrl(GAINFOREST_MODERATION_REPO_DID, record.fileCid).catch(() => null),
      uploadedAt: record.createdAt,
    })),
  );
}

export async function fetchRecorders(): Promise<Recorder[]> {
  return [];
}
