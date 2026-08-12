/**
 * Rewilding the Web grantee dashboard — shared model.
 *
 * The dashboard is two pages ("My grant" overview + "My recorders" inventory)
 * plus an add-a-recorder form. Views are adapter-driven: callers supply the
 * data and the mutation callbacks, so the same components render against live
 * data or against the `/_test/rewilding-dashboard` registry fixtures.
 */

/** Where a recorder came from: the grantee's own device, or one GainForest ships. */
export type RecorderOrigin = "owned" | "gainforest";

export type RecorderStatus =
  /** Deployed and producing uploads. */
  | "recording"
  /** Registered but not deployed (or not currently working). */
  | "idle"
  /** GainForest shipment on its way. */
  | "inTransit"
  /** Requested from GainForest, not yet shipped. */
  | "requested";

export type Recorder = {
  id: string;
  /** Device model, e.g. "AudioMoth 1.2.0". Product names are not translated. */
  deviceType: string;
  /** Where it listens — a site name or landmark. Null while in transit/requested. */
  site: string | null;
  origin: RecorderOrigin;
  status: RecorderStatus;
  /** ISO date of the estimated arrival, when status is `inTransit`. */
  arrivalEstimate?: string;
  /** Recent upload activity (minutes per week, oldest → newest). */
  weeklyMinutes: number[];
};

export type GrantMilestoneState = "done" | "active" | "todo";

export type GrantMilestone = {
  id: string;
  title: string;
  state: GrantMilestoneState;
  /** The recorder-inventory milestone links through to the "My recorders" page. */
  isRecorderInventory?: boolean;
};

export type GrantOverview = {
  /** Project title, e.g. "Sounds of the Savannah". */
  projectName: string;
  /** Grantee label chip, e.g. "SORALO · Kenya". */
  granteeLabel: string;
  /** The single next thing to do, or null when the grantee is all caught up. */
  nextStep: { title: string; dueDate?: string } | null;
  audioMinutes: number;
  /** Cumulative uploaded minutes over recent weeks (oldest → newest), for the sparkline. */
  audioTrend: number[];
  speciesCount: number;
  speciesTrend: number[];
  milestones: GrantMilestone[];
};

export type RecorderCondition = "fieldWorking" | "working" | "needsRepair";

export type NewRecorderInput = {
  /** "owned" registers a device the grantee already has; "request" asks GainForest to ship one. */
  source: "owned" | "request";
  deviceType: string;
  quantity: number;
  /** Only meaningful when source is "owned". */
  condition: RecorderCondition;
  /** Where it listens. Optional — shipments may not have a site yet. */
  site: string;
};

/** Known device models offered in the add-recorder form. Product names, untranslated. */
export const RECORDER_DEVICE_TYPES = ["AudioMoth 1.2.0", "HydroMoth", "Song Meter Micro"] as const;

export const RECORDER_CONDITIONS: readonly RecorderCondition[] = ["fieldWorking", "working", "needsRepair"];

export function countByOrigin(recorders: readonly Recorder[]): { owned: number; gainforest: number } {
  let owned = 0;
  let gainforest = 0;
  for (const recorder of recorders) {
    if (recorder.origin === "owned") owned += 1;
    else gainforest += 1;
  }
  return { owned, gainforest };
}
