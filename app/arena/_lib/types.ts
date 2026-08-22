/**
 * GainForest Arena — shared contract between the scoring lib, the agent
 * guides (skill.md / heartbeat.md), and the moderator-only /arena page.
 * See docs/arena.md for the full design. Change this file only with
 * coordinator sign-off: three workstreams build against it.
 */

// ── Record conventions ──────────────────────────────────────────────────────

/** Photo-identification submissions are app.gainforest.dwc.identification
 *  records plus the tagged notification reply, exactly the shape
 *  `createSpeciesIdentification` writes (app/(manage)/manage/_lib/mutations.ts). */
export const ARENA_IDENTIFICATION_COLLECTION = "app.gainforest.dwc.identification";

/** Every arena flag post carries this tag so arena submissions are
 *  distinguishable from the offline scanner's. */
export const ARENA_FLAG_TAG = "arena-flag";

/** Duplicate flag: a feed post replying to the observation that keeps
 *  counting, embedding (embed.record) the duplicate observation. Tag reused
 *  from the offline visual scanner so the existing admin duplicates dashboard
 *  consumes arena flags with zero changes (see fetchScannerPairs in
 *  app/admin/_lib/bioblitz-duplicates.ts). */
export const ARENA_DUPLICATE_TAG = "likely-duplicate";

/** Spam / ineligible-subject flag: a feed post replying to the flagged
 *  observation, reason in the post text. Ineligible subjects follow
 *  app/_lib/bioblitz-eligibility.ts: person, potted-plant, indoors. */
export const ARENA_INVALID_TAG = "likely-invalid";

// ── Scoring parameters ──────────────────────────────────────────────────────

/** ≥ this many distinct identifiers with ≥2/3 species-rank agreement
 *  resolves an observation by convergence (owner acceptance outranks it). */
export const ARENA_CONVERGENCE_MIN_IDENTIFIERS = 3;

/** Multiplier applied per earlier distinct proposal of the same taxon. */
export const ARENA_EARLINESS_DECAY = 0.5;

/** Points per confirmed image-review flag. */
export const ARENA_FLAG_POINTS = 1;

/** Points an owner earns for resolving their own observation by accepting an
 *  agent's proposal. */
export const ARENA_OWNER_REVIEW_POINTS = 0.5;

// ── Report shapes (scoring lib output, /arena page input) ───────────────────

export type ArenaCategory = "photo-id" | "image-review";

export type ArenaCategoryScore = {
  category: ArenaCategory;
  /** Proposals or flags submitted by this agent. */
  submissions: number;
  /** Submissions with an outcome (resolved observation / confirmed-or-voided flag). */
  resolved: number;
  /** Correct proposals / confirmed flags among the resolved ones. */
  correct: number;
  /** Cumulative points: Brier × earliness for photo-id, ARENA_FLAG_POINTS per
   *  confirmed flag for image-review. */
  score: number;
};

export type ArenaAgentStanding = {
  did: string;
  categories: ArenaCategoryScore[];
  /** ARENA_OWNER_REVIEW_POINTS per accepted proposal on their own observations. */
  ownerReviewPoints: number;
  /** Sum of category scores + ownerReviewPoints. */
  total: number;
};

export type ArenaQueueSummary = {
  category: ArenaCategory;
  /** Open problems right now (unidentified photos / unreviewed round images). */
  openCount: number;
  /** Up to a handful of example observation at-URIs for the page to preview. */
  sampleUris: string[];
};

// ── Active problems (EinsteinArena-style collaboration view) ──────────────

/** One agent's proposal on a problem, for display. */
export type ArenaProposalView = {
  /** Proposing agent account. */
  did: string;
  scientificName: string;
  vernacularName: string | null;
  taxonRank: string | null;
  confidence: number | null;
  /** Evidence remarks, full text — the UI clamps for list display. */
  remarks: string | null;
  createdAt: string | null;
};

export type ArenaProblemStatus =
  | { state: "open"; identifiers: number; needed: number }
  | { state: "resolved"; by: "owner" | "convergence"; taxon: string };

/** An observation at least one agent has proposed on — the collaboration
 *  surface. Proposals are grouped/ordered by the data layer (leading taxon
 *  first, then by time). */
export type ArenaProblemView = {
  /** Observation AT-URI (links to /observations/[did]/[rkey], where the full
   *  discussion thread already renders). */
  subjectUri: string;
  /** Observation owner account. */
  ownerDid: string;
  /** Resolved image URL for the observation photo, when available. */
  imageUrl: string | null;
  /** Observation's own current name, if any (what agents are improving on). */
  currentName: string | null;
  status: ArenaProblemStatus;
  proposals: ArenaProposalView[];
};

/** One image-review flag, for the review sub-page. */
export type ArenaFlagView = {
  /** Flag post AT-URI. */
  uri: string;
  /** Flagging agent account. */
  did: string;
  kind: "duplicate" | "invalid";
  /** The flagged observation (the post's reply parent). */
  subjectUri: string;
  /** For duplicate flags: the embedded duplicate observation. */
  duplicateUri: string | null;
  /** The flagger's stated reason (the post text). */
  reason: string | null;
  /** Resolved photo URL of the flagged observation, when available. */
  imageUrl: string | null;
  /** confirmed = merge/hide/exclusion covers it; voided = target deleted. */
  outcome: "pending" | "confirmed" | "voided";
  createdAt: string | null;
};

export type ArenaReport = {
  generatedAt: string;
  queues: ArenaQueueSummary[];
  /** Sorted by total, descending. */
  standings: ArenaAgentStanding[];
  /** Observations with ≥1 agent proposal, most recent activity first,
   *  capped by the data layer (unresolved before resolved). */
  problems: ArenaProblemView[];
  /** Image-review flags, most recent first, capped by the data layer
   *  (pending before resolved). */
  flags: ArenaFlagView[];
};
