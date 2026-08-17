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

/**
 * Milestones gate the grant's payment tranches, so only GainForest may mark
 * one done — that happens in the admin panel's "Rewilding the Web" section,
 * never from this dashboard. The grantee's view is read-only.
 */
export type GrantMilestoneState =
  /** Not confirmed yet. */
  | "todo"
  /** Confirmed by GainForest. The tranche it gates can be released. */
  | "done";

export type GrantMilestone = {
  /** Program milestone id ("m1"…"m4"). Also the key its name and description
   *  are looked up under in `common.rewildingProgram.milestones`. */
  id: string;
  /** Short program code, e.g. "M2". Shown as-is; not translated. */
  code: string;
  state: GrantMilestoneState;
  /** The payment tranche this milestone releases, when it gates one. M3 shares
   *  M2's tranche, so it carries no payout of its own. */
  payout?: { tranche: number; amountUsd: number };
  /** Milestones about the devices link through to the "My recorders" page. */
  isRecorderInventory?: boolean;
};

/** A daily cumulative series: ISO days (oldest → newest) and the value at the
 *  end of each. Minutes of audio, for the pace chart. */
export type AudioSeries = {
  /** ISO dates (YYYY-MM-DD), oldest → newest. */
  days: string[];
  /** Cumulative value at the end of each day. Same length as `days`. */
  values: number[];
};

/**
 * Where a grantee stands against the recording target and the grant
 * deadline: what has actually been uploaded, against the straight line from
 * the grant start to the target on the closing date.
 */
export type AudioPace = {
  /** "upcoming" before the grant period opens, "active" while it runs, "met"
   *  once the target is reached, "closed" when the window shut without it. */
  status: "upcoming" | "active" | "met" | "closed";
  targetMinutes: number;
  /** Minutes still to record; 0 once the target is met. */
  remainingMinutes: number;
  /** Whole days left until the deadline, floored at 0. */
  daysRemaining: number;
  /** Whole days until the grant period opens; 0 once it has. */
  daysUntilStart: number;
  /** Minutes/day needed to hit the target: spread across the days left once
   *  the grant is running, or across the whole window before it opens. Null
   *  once the target is met or the window has closed. */
  requiredPerDay: number | null;
  /** Minutes/day achieved since the grant started. */
  actualPerDay: number;
  /** Where the current pace lands by the deadline. */
  projectedMinutes: number;
  /** Minutes ahead (+) or behind (−) the straight line to target as of today. */
  deltaVsPace: number;
};

export type GrantOverview = {
  /** Project title, e.g. "Sounds of the Savannah". Null until a grant record
   *  names it — the view shows a generic heading rather than inventing one. */
  projectName: string | null;
  /** Grantee label chip, e.g. "SORALO · Kenya". Null when unknown. */
  granteeLabel: string | null;
  /** The single next thing to do, or null when the grantee is all caught up. */
  nextStep: { title: string; dueDate?: string } | null;
  audioMinutes: number;
  /** Per-community recording target for the program, in minutes. */
  audioTargetMinutes: number;
  /** ISO date the recording target must be met by — the grant's closing date. */
  audioDeadline: string;
  /** Progress against the target and the deadline. Null when the grant has no
   *  known start (an admin preview, say), so the view simply omits the pace. */
  audioPace: AudioPace | null;
  /** ISO date the grant clock started for this account (its enrollment day).
   *  Null when unknown — the pace chart is then omitted. */
  audioGrantStart: string | null;
  /** Daily cumulative uploaded minutes, backing the pace chart. */
  audioSeries: AudioSeries | null;
  /** Total grant value in USD. */
  grantAmountUsd: number;
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
