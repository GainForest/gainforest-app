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

export type ArenaReport = {
  generatedAt: string;
  queues: ArenaQueueSummary[];
  /** Sorted by total, descending. */
  standings: ArenaAgentStanding[];
};
