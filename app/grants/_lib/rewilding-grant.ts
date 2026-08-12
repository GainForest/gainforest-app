/**
 * Data access for the Rewilding the Web grantee dashboard.
 *
 * There is no record type behind a "recorder" or a grant milestone yet, so
 * these return an honest empty state — zeros and empty lists — rather than
 * invented sample content. A page full of made-up numbers reads as a real
 * grant to anyone who lands on it; zeros read as "nothing recorded yet",
 * which is exactly what is true today.
 *
 * When the backing records land, replace the bodies of these two functions
 * (taking the viewer's DID or grant) and drop
 * `REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA`. Nothing else needs to change:
 * the views already render whatever they are handed.
 */

import type { GrantOverview, Recorder } from "../_components/rewilding/model";

/** True while the functions below return an empty state instead of real
 *  records. The page shell uses it to tell the viewer what they are seeing. */
export const REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA = true;

export async function fetchGrantOverview(): Promise<GrantOverview> {
  return {
    // Unknown until a grant record exists — the view falls back to a generic
    // heading rather than inventing a project name.
    projectName: null,
    granteeLabel: null,
    nextStep: null,
    audioMinutes: 0,
    audioTrend: [],
    speciesCount: 0,
    speciesTrend: [],
    milestones: [],
  };
}

export async function fetchRecorders(): Promise<Recorder[]> {
  return [];
}
