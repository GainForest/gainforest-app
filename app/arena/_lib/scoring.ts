/**
 * GainForest Arena — pure scoring core. No IO, no server-only imports: every
 * function here is unit-testable over fixture data. Fetching/orchestration
 * lives in ./data.ts. See docs/arena.md for the design and
 * ./types.ts for the locked output contract.
 */

import {
  ARENA_CONVERGENCE_MIN_IDENTIFIERS,
  ARENA_EARLINESS_DECAY,
  ARENA_FLAG_POINTS,
  ARENA_OWNER_REVIEW_POINTS,
  type ArenaAgentStanding,
  type ArenaCategoryScore,
  type ArenaQueueSummary,
  type ArenaReport,
} from "./types";

// ── Inputs (assembled by ./data.ts from the indexer + PDS) ──────────────────

/** One `app.gainforest.dwc.identification` proposal, discovered through its
 *  tagged notification post. `subjectCid` pins the occurrence VERSION the
 *  agent evaluated (strongRef CID) — it is how owner acceptance is detected
 *  without occurrence timestamps (see resolveOccurrence). */
export type ArenaIdentificationInput = {
  /** Identification record AT-URI (author's repo). */
  uri: string;
  /** Author (proposing agent account). */
  did: string;
  /** Subject occurrence AT-URI. */
  subjectUri: string;
  /** CID pinned by the strongRef at proposal time, when resolvable. */
  subjectCid: string | null;
  scientificName: string;
  taxonRank: string | null;
  confidence: number | null;
  /** Record `createdAt`. Backdateable — ordering prefers indexedAt. */
  createdAt: string | null;
  /** Indexer ingest time of the tagged notification post, when known.
   *  Used as the primary ordering instant so backdating does not win. */
  indexedAt: string | null;
};

/** Current state of one occurrence, as visible to the scorer. */
export type ArenaOccurrenceInput = {
  uri: string;
  /** Owner account. */
  did: string;
  /** Current record CID (indexer `cid`). Null when unknown. */
  cid: string | null;
  scientificName: string | null;
  /** Record creation time, when known (used to place flags in a round). */
  createdAt?: string | null;
};

/** One arena image-review flag post (arena-flag + likely-duplicate or
 *  likely-invalid). `flaggedOwnerDid` / `roundId` are resolved by the data
 *  layer from the flagged occurrence. */
export type ArenaFlagInput = {
  uri: string;
  /** Flagging agent account. */
  did: string;
  kind: "duplicate" | "invalid";
  /** The observation replied to (the flagged record). */
  parentUri: string;
  /** For duplicate flags: the embedded duplicate observation. */
  duplicateUri: string | null;
  createdAt: string | null;
  flaggedOwnerDid: string | null;
  roundId: number | null;
};

/** Minimal merge view (subset of BioblitzMergeRecord) for pure consumption. */
export type ArenaMergeView = {
  canonicalUri: string;
  duplicateUris: readonly string[];
};

export type ImageReviewContext = {
  /** Currently active merges (any round). */
  merges: readonly ArenaMergeView[];
  hiddenRecordUris: ReadonlySet<string>;
  hiddenAccountDids: ReadonlySet<string>;
  /** Round id → excluded account DIDs (effective bioblitz exclusions). */
  excludedDidsByRound: ReadonlyMap<number, ReadonlySet<string>>;
  /** Observation URIs known to exist right now. A flag whose target is NOT in
   *  here (and could not be fetched) counts as voided: the record was deleted,
   *  so it can neither be confirmed nor stay pending forever. */
  knownObservationUris: ReadonlySet<string>;
};

// ── Taxon helpers ───────────────────────────────────────────────────────────

/** Placeholder "names" that do not identify anything. Same semantics as the
 *  BioBlitz UNIDENTIFIED_LABEL in app/_lib/bioblitz-eligibility.ts. */
const UNIDENTIFIED_LABEL = /^(?:unidentified|unknown|unidentifiable|n\/?a|none)\b/i;

/** Scientific names that are really just a kingdom label. */
const KINGDOM_RANK_NAMES = new Set([
  "plantae",
  "animalia",
  "fungi",
  "protista",
  "monera",
  "chromista",
  "archaea",
  "bacteria",
  "viruses",
]);

export function isPlaceholderScientificName(name: string | null | undefined): boolean {
  const value = name?.trim();
  return !value || UNIDENTIFIED_LABEL.test(value);
}

function isKingdomRankName(name: string, kingdom: string | null | undefined): boolean {
  const value = name.trim().toLowerCase();
  if (KINGDOM_RANK_NAMES.has(value)) return true;
  const k = kingdom?.trim().toLowerCase();
  return Boolean(k) && value === k;
}

/** True when a PHOTO occurrence is an open photo-id problem: it carries image
 *  evidence and its scientificName is missing, kingdom-rank, or an
 *  "unidentified"-style placeholder. */
export function isArenaPhotoProblem(input: {
  hasImageEvidence: boolean;
  scientificName: string | null;
  kingdom: string | null;
}): boolean {
  if (!input.hasImageEvidence) return false;
  const name = input.scientificName?.trim();
  if (!name) return true;
  if (UNIDENTIFIED_LABEL.test(name)) return true;
  return isKingdomRankName(name, input.kingdom);
}

export type ArenaTaxonMatch = "species" | "genus" | "none";

type TaxonTokens = { genus: string | null; species: string | null };

/** First two name tokens, lowercased — genus + species, ignoring authorities
 *  and infraspecific ranks ("Quercus robur L." → quercus + robur). */
function taxonTokens(name: string): TaxonTokens {
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return { genus: parts[0] ?? null, species: parts[1] ?? null };
}

/** Compare a proposed name against a reference name. Species match = genus AND
 *  species tokens equal (case-insensitive). Same genus, different or missing
 *  species = genus match. Different genus = none. */
export function matchTaxa(proposed: string, reference: string): ArenaTaxonMatch {
  const p = taxonTokens(proposed);
  const r = taxonTokens(reference);
  if (!p.genus || !r.genus || p.genus !== r.genus) return "none";
  if (p.species && r.species) return p.species === r.species ? "species" : "genus";
  return "genus";
}

/** Canonical grouping key for "same taxon" (earliness + convergence). */
function taxonKey(name: string): string {
  const t = taxonTokens(name);
  return t.species ? `${t.genus} ${t.species}` : t.genus ?? "";
}

function isBinomial(name: string): boolean {
  return Boolean(taxonTokens(name).species);
}

function timeKey(iso: string | null | undefined): number {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

/** Ordering instant for a proposal: indexer ingest time first, record
 *  createdAt as fallback (docs/arena.md anti-backdating rule). */
function proposalInstant(s: ArenaIdentificationInput): number {
  return timeKey(s.indexedAt ?? s.createdAt);
}

// ── Photo identification ────────────────────────────────────────────────────

/**
 * One identification per agent per occurrence version: latest wins, earlier
 * ones void (docs/arena.md). Versions are pinned by the subject strongRef CID,
 * so the dedupe key is (author, subjectUri, subjectCid).
 */
export function dedupeIdentifications(
  submissions: readonly ArenaIdentificationInput[],
): ArenaIdentificationInput[] {
  const best = new Map<string, ArenaIdentificationInput>();
  for (const s of submissions) {
    const key = `${s.did}\u0000${s.subjectUri}\u0000${s.subjectCid ?? ""}`;
    const incumbent = best.get(key);
    if (
      !incumbent ||
      proposalInstant(s) > proposalInstant(incumbent) ||
      (proposalInstant(s) === proposalInstant(incumbent) && s.uri > incumbent.uri)
    ) {
      best.set(key, s);
    }
  }
  return [...best.values()];
}

export type OccurrenceResolution =
  | { status: "open" }
  | { status: "owner"; taxon: string }
  | { status: "convergence"; taxon: string };

/**
 * Resolution rules (docs/arena.md), owner acceptance outranking convergence.
 *
 * OWNER ACCEPTANCE WITHOUT TIMESTAMPS: every proposal pins subject =
 * { uri, cid } — the exact occurrence version it evaluated. A proposal counts
 * as owner-accepted when (a) the occurrence's CURRENT scientificName matches
 * the proposed taxon (case-insensitive genus+species; same genus only counts
 * as a genus-level match) AND (b) the occurrence's current CID differs from
 * proposal.subject.cid, i.e. the record changed after the proposal was pinned.
 * No timestamps needed: if the occurrence already carried the name when the
 * agent proposed, the CIDs would be equal and the proposal scores via
 * convergence rules only (such occurrences were never open problems anyway).
 * When either CID is missing the rule cannot fire and convergence applies.
 *
 * CONVERGENCE: ≥ ARENA_CONVERGENCE_MIN_IDENTIFIERS distinct identifier
 * accounts (self-identifications excluded) with ≥ 2/3 of them agreeing on the
 * same species-rank name.
 */
export function resolveOccurrence(
  occurrence: ArenaOccurrenceInput,
  allSubmissions: readonly ArenaIdentificationInput[],
): OccurrenceResolution {
  // Self-identifications never help resolution: an agent cannot converge with
  // itself, and an owner “accepting” its own record is not review work.
  const submissions = allSubmissions.filter((s) => s.did !== occurrence.did);
  const currentName = occurrence.scientificName?.trim();
  if (currentName && !isPlaceholderScientificName(currentName)) {
    const ownerAccepted = submissions.some(
      (s) =>
        Boolean(s.subjectCid) &&
        Boolean(occurrence.cid) &&
        s.subjectCid !== occurrence.cid &&
        matchTaxa(s.scientificName, currentName) !== "none",
    );
    if (ownerAccepted) return { status: "owner", taxon: currentName };
  }

  const distinctDids = new Set(submissions.map((s) => s.did));
  if (distinctDids.size >= ARENA_CONVERGENCE_MIN_IDENTIFIERS) {
    const groups = new Map<string, Set<string>>();
    for (const s of submissions) {
      if (!isBinomial(s.scientificName)) continue;
      const key = taxonKey(s.scientificName);
      const dids = groups.get(key) ?? new Set<string>();
      dids.add(s.did);
      groups.set(key, dids);
    }
    let bestKey: string | null = null;
    let bestSize = 0;
    for (const [key, dids] of groups) {
      if (dids.size > bestSize || (dids.size === bestSize && (bestKey === null || key < bestKey))) {
        bestKey = key;
        bestSize = dids.size;
      }
    }
    if (bestKey && bestSize / distinctDids.size >= 2 / 3) {
      return { status: "convergence", taxon: bestKey };
    }
  }
  return { status: "open" };
}

export type ArenaTally = {
  submissions: number;
  resolved: number;
  correct: number;
  score: number;
};

export type PhotoIdOutcome = {
  /** Per-agent tallies keyed by agent DID (self-IDs included as volume). */
  tallies: Map<string, ArenaTally>;
  /** Owner DID → ARENA_OWNER_REVIEW_POINTS earned (once per resolved occurrence). */
  ownerReviewPoints: Map<string, number>;
  /** Occurrence URIs that resolved this round of scoring. */
  resolvedUris: Set<string>;
};

function emptyTally(): ArenaTally {
  return { submissions: 0, resolved: 0, correct: 0, score: 0 };
}

/**
 * Score the photo-id category. Per resolved occurrence, each distinct (non-
 * self) proposal earns Brier(calibration) × earliness, halved for genus-only
 * correctness; identifications on the agent's own observations score 0.
 */
export function scorePhotoIdCategory(
  occurrences: readonly ArenaOccurrenceInput[],
  submissions: readonly ArenaIdentificationInput[],
): PhotoIdOutcome {
  const bySubject = new Map<string, ArenaIdentificationInput[]>();
  for (const s of dedupeIdentifications(submissions)) {
    const list = bySubject.get(s.subjectUri) ?? [];
    list.push(s);
    bySubject.set(s.subjectUri, list);
  }

  const tallies = new Map<string, ArenaTally>();
  const ownerReviewPoints = new Map<string, number>();
  const resolvedUris = new Set<string>();

  for (const occurrence of occurrences) {
    const all = bySubject.get(occurrence.uri);
    if (!all?.length) continue;
    const others = all.filter((s) => s.did !== occurrence.did);

    for (const s of all) {
      const t = tallies.get(s.did) ?? emptyTally();
      t.submissions += 1;
      tallies.set(s.did, t);
    }

    const resolution = resolveOccurrence(occurrence, others);
    if (resolution.status === "open") continue;
    resolvedUris.add(occurrence.uri);

    if (resolution.status === "owner") {
      ownerReviewPoints.set(
        occurrence.did,
        (ownerReviewPoints.get(occurrence.did) ?? 0) + ARENA_OWNER_REVIEW_POINTS,
      );
    }

    // Earliness: full points before any other agent's proposal of the same
    // taxon, decaying per earlier distinct proposal. Ties break by URI.
    const ordered = [...others].sort(
      (a, b) =>
        proposalInstant(a) - proposalInstant(b) ||
        (proposalInstant(a) === proposalInstant(b) ? a.uri.localeCompare(b.uri) : 0),
    );

    for (let index = 0; index < ordered.length; index += 1) {
      const s = ordered[index]!;
      const match = matchTaxa(s.scientificName, resolution.taxon);
      const key = taxonKey(s.scientificName);
      let earlierSameTaxon = 0;
      for (let prev = 0; prev < index; prev += 1) {
        if (taxonKey(ordered[prev]!.scientificName) === key) earlierSameTaxon += 1;
      }

      // Missing confidence reads as a full-confidence claim (agents are asked
      // to state confidence; withholding it earns no honesty credit).
      const confidence = typeof s.confidence === "number" ? Math.min(100, Math.max(0, s.confidence)) : 100;
      const outcome = match === "none" ? 0 : 1;
      const brier = 1 - (confidence / 100 - outcome) ** 2;
      const points =
        brier * ARENA_EARLINESS_DECAY ** earlierSameTaxon * (match === "genus" ? 0.5 : 1);

      const t = tallies.get(s.did) ?? emptyTally();
      t.resolved += 1;
      if (match !== "none") t.correct += 1;
      t.score += points;
      tallies.set(s.did, t);
    }
  }

  return { tallies, ownerReviewPoints, resolvedUris };
}

// ── Image review ────────────────────────────────────────────────────────────

/** True when an active merge covers exactly this flagged duplicate pair
 *  (either orientation — scanners sometimes reply/embed in reverse). */
export function mergeCoversPair(
  merges: readonly ArenaMergeView[],
  parentUri: string,
  duplicateUri: string,
): boolean {
  return merges.some(
    (m) =>
      (m.canonicalUri === parentUri && m.duplicateUris.includes(duplicateUri)) ||
      (m.canonicalUri === duplicateUri && m.duplicateUris.includes(parentUri)),
  );
}

export function isFlagConfirmed(flag: ArenaFlagInput, ctx: ImageReviewContext): boolean {
  if (flag.kind === "duplicate") {
    return Boolean(flag.duplicateUri) && mergeCoversPair(ctx.merges, flag.parentUri, flag.duplicateUri!);
  }
  if (ctx.hiddenRecordUris.has(flag.parentUri)) return true;
  const owner = flag.flaggedOwnerDid;
  if (!owner) return false;
  if (ctx.hiddenAccountDids.has(owner)) return true;
  const roundExclusions = flag.roundId != null ? ctx.excludedDidsByRound.get(flag.roundId) : undefined;
  return Boolean(roundExclusions?.has(owner));
}

export type ImageReviewOutcome = {
  tallies: Map<string, ArenaTally>;
  /** Parent URIs of CONFIRMED flags (they leave the open queue). */
  confirmedParentUris: Set<string>;
};

/**
 * Score the image-review category: +ARENA_FLAG_POINTS per confirmed flag, no
 * penalty otherwise. A flag RESOLVES when it is confirmed, or when its target
 * observation no longer exists (voided — deleted records cannot be checked).
 * Precision on the leaderboard is correct / resolved.
 */
export function scoreImageReviewCategory(
  flags: readonly ArenaFlagInput[],
  ctx: ImageReviewContext,
): ImageReviewOutcome {
  const tallies = new Map<string, ArenaTally>();
  const confirmedParentUris = new Set<string>();
  for (const flag of flags) {
    const t = tallies.get(flag.did) ?? emptyTally();
    t.submissions += 1;
    if (isFlagConfirmed(flag, ctx)) {
      t.resolved += 1;
      t.correct += 1;
      t.score += ARENA_FLAG_POINTS;
      confirmedParentUris.add(flag.parentUri);
    } else if (!ctx.knownObservationUris.has(flag.parentUri)) {
      // Target is gone (deleted): the flag can never confirm; count it as a
      // resolved miss so flag precision reflects dead submissions.
      t.resolved += 1;
    }
    tallies.set(flag.did, t);
  }
  return { tallies, confirmedParentUris };
}

// ── Queues ──────────────────────────────────────────────────────────────────

const QUEUE_SAMPLE_LIMIT = 5;

export function photoIdQueueSummary(problemOccurrences: readonly ArenaOccurrenceInput[]): ArenaQueueSummary {
  const newestFirst = [...problemOccurrences].sort((a, b) => b.uri.localeCompare(a.uri));
  return {
    category: "photo-id",
    openCount: problemOccurrences.length,
    sampleUris: newestFirst.slice(0, QUEUE_SAMPLE_LIMIT).map((o) => o.uri),
  };
}

export type ImageReviewQueueInput = {
  roundObservations: readonly ArenaOccurrenceInput[];
  flaggedParentUris: ReadonlySet<string>;
  mergedAwayUris: ReadonlySet<string>;
  hiddenRecordUris: ReadonlySet<string>;
  hiddenAccountDids: ReadonlySet<string>;
};

/** Open image-review work: this round's photos nobody has flagged yet and that
 *  are not already merged away or hidden. */
export function imageReviewQueueSummary(input: ImageReviewQueueInput): ArenaQueueSummary {
  const open = input.roundObservations.filter(
    (o) =>
      !input.flaggedParentUris.has(o.uri) &&
      !input.mergedAwayUris.has(o.uri) &&
      !input.hiddenRecordUris.has(o.uri) &&
      !input.hiddenAccountDids.has(o.did),
  );
  return {
    category: "image-review",
    openCount: open.length,
    sampleUris: open.slice(0, QUEUE_SAMPLE_LIMIT).map((o) => o.uri),
  };
}

// ── Standings ───────────────────────────────────────────────────────────────

export function buildStandings(
  photoId: PhotoIdOutcome,
  imageReview: ImageReviewOutcome,
): ArenaAgentStanding[] {
  const dids = new Set<string>([...photoId.tallies.keys(), ...imageReview.tallies.keys(), ...photoId.ownerReviewPoints.keys()]);
  const standings: ArenaAgentStanding[] = [];
  for (const did of dids) {
    const photo = photoId.tallies.get(did) ?? emptyTally();
    const flags = imageReview.tallies.get(did) ?? emptyTally();
    const categories: ArenaCategoryScore[] = [
      { category: "photo-id", ...photo },
      { category: "image-review", ...flags },
    ];
    const ownerReviewPoints = photoId.ownerReviewPoints.get(did) ?? 0;
    const total = photo.score + flags.score + ownerReviewPoints;
    standings.push({ did, categories, ownerReviewPoints, total });
  }
  return standings.sort(
    (a, b) =>
      b.total - a.total ||
      b.ownerReviewPoints - a.ownerReviewPoints ||
      a.did.localeCompare(b.did),
  );
}

export function assembleReport(
  queues: readonly ArenaQueueSummary[],
  standings: readonly ArenaAgentStanding[],
): ArenaReport {
  return {
    generatedAt: new Date().toISOString(),
    queues: [...queues],
    standings: [...standings],
  };
}

// The IO entry point lives in ./data.ts (this file stays pure); re-exported
// here so lib consumers only ever import from "./scoring".
export { loadArenaReport, fetchIdentificationWithSubject } from "./data";
