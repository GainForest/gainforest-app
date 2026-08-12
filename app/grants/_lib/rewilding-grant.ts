/**
 * Data access for the Rewilding the Web grantee dashboard.
 *
 * ⚠️ PLACEHOLDER DATA. There is no record type behind a "recorder" yet, so
 * nothing here is read from a PDS or the indexer — the two dashboard routes are
 * admin-gated precisely because this is a stand-in. The shapes are the ones the
 * views already consume, so wiring the real source later means replacing the
 * bodies of these two functions and nothing else.
 *
 * When the backing records land, each function should take the viewer's DID (or
 * the grant they belong to) and read it the way the rest of the app does —
 * `indexerQuery` for aggregates, the owner's PDS for their own records.
 */

import type { GrantOverview, Recorder } from "../_components/rewilding/model";

/** Set false once these functions read live records; the UI uses it to be
 *  honest with the viewer about what they are looking at. */
export const REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA = true;

function inDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function fetchGrantOverview(): Promise<GrantOverview> {
  return {
    projectName: "Sounds of the Savannah",
    granteeLabel: "SORALO · Kenya",
    nextStep: { title: "Tell us which recorders you already have", dueDate: inDays(4) },
    audioMinutes: 412,
    audioTrend: [12, 40, 74, 96, 150, 231, 305, 412],
    speciesCount: 27,
    speciesTrend: [2, 5, 9, 11, 16, 19, 24, 27],
    milestones: [
      { id: "m1", title: "Grant agreement signed", state: "done" },
      { id: "m2", title: "Project registered on GainForest", state: "done" },
      { id: "m3", title: "First test recording uploaded", state: "done" },
      {
        id: "m4",
        title: "Recorder inventory — register the devices you already have",
        state: "active",
        isRecorderInventory: true,
      },
      { id: "m5", title: "All recorders deployed in the field", state: "todo" },
      { id: "m6", title: "First month of monitoring data published", state: "todo" },
    ],
  };
}

export async function fetchRecorders(): Promise<Recorder[]> {
  return [
    {
      id: "r1",
      deviceType: "AudioMoth 1.2.0",
      site: "Olkiramatian ridge",
      origin: "owned",
      status: "recording",
      weeklyMinutes: [18, 42, 35, 61, 48, 74],
    },
    {
      id: "r2",
      deviceType: "Song Meter Micro",
      site: "Shompole swamp",
      origin: "owned",
      status: "recording",
      weeklyMinutes: [9, 21, 16, 33, 27, 41],
    },
    {
      id: "r3",
      deviceType: "AudioMoth 1.2.0",
      site: null,
      origin: "gainforest",
      status: "inTransit",
      arrivalEstimate: inDays(10),
      weeklyMinutes: [],
    },
    {
      id: "r4",
      deviceType: "AudioMoth 1.2.0",
      site: null,
      origin: "gainforest",
      status: "requested",
      weeklyMinutes: [],
    },
  ];
}
