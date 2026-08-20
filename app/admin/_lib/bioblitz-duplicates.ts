import "server-only";

import {
  bioblitzObservationPoints,
  isEligibleBioblitzDescription,
} from "@/app/_lib/bioblitz-eligibility";
import {
  fetchBioblitzRoundRegistrants,
  isWithinRoundUploadWindow,
  type BioblitzRound,
} from "@/app/_lib/bioblitz";
import {
  effectiveBioblitzMergeRecords,
  fetchBioblitzMergeRecords,
  type BioblitzMergeRecord,
} from "@/app/_lib/bioblitz-merges";
import {
  fetchHiddenRecordUris,
  fetchPublicHiddenAccountDids,
  GAINFOREST_MODERATION_REPO_DID,
  indexerQueryStrict,
} from "@/app/_lib/indexer";
import { normaliseRef, resolveBlobUrl } from "@/app/_lib/pds";
import {
  clusterDuplicateCandidates,
  planExactDuplicateMerges,
  type BioblitzDuplicateSignal,
  type DuplicateCandidateRecord,
  type ExactDuplicateMergePlan,
} from "./bioblitz-duplicate-clusters";
import { resolveBioblitzAdminRound } from "./bioblitz-dashboard";

/** Tag the offline visual scanner puts on its duplicate-warning feed posts. */
const SCANNER_DUPLICATE_TAG = "likely-duplicate";
const SCANNER_POSTS_LIMIT = 500;
const OCCURRENCE_PAGE_SIZE = 1000;
const MAX_OCCURRENCE_PAGES = 6;
const IMAGE_URL_CONCURRENCY = 8;

// ── Serializable dashboard payload ──────────────────────────────────────────

export type BioblitzDuplicateObservationView = {
  uri: string;
  rkey: string;
  createdAt: string;
  imageUrl: string | null;
  associatedMedia: string | null;
  scientificName: string | null;
  vernacularName: string | null;
  points: number;
  /** True for the observation that keeps counting after a merge. */
  canonical: boolean;
  /** True when an active merge already stops this observation from counting. */
  mergedAway: boolean;
};

export type BioblitzDuplicateClusterView = {
  /** Stable id derived from the member URIs (safe as a React key). */
  id: string;
  did: string;
  displayName: string | null;
  avatarUrl: string | null;
  signals: BioblitzDuplicateSignal[];
  observations: BioblitzDuplicateObservationView[];
  canonicalUri: string;
  pointsBefore: number;
  pointsAfter: number;
  /** Active merge covering this cluster's canonical, when one exists. */
  merge: { rkey: string; createdAt: string; mergedUriCount: number } | null;
  /** True when some members are not yet covered by the active merge (new
   *  uploads since the merge), so "merge" is still actionable. */
  hasUnmergedMembers: boolean;
};

export type BioblitzDuplicateReport = {
  roundId: number;
  /** Observations scanned for this round (registered collectors only). */
  scannedObservations: number;
  clusters: BioblitzDuplicateClusterView[];
  /** Points the round board currently over-counts across unmerged clusters. */
  suspectedExtraPoints: number;
  /** Identical-image groups the one-click auto-merge would merge right now. */
  autoMergeableGroups: number;
};

// ── Round occurrence walk ───────────────────────────────────────────────────

type RawOccurrenceNode = {
  uri?: string | null;
  did?: string | null;
  rkey?: string | null;
  createdAt?: string | null;
  associatedMedia?: string | null;
  occurrenceRemarks?: string | null;
  fieldNotes?: string | null;
  scientificName?: string | null;
  vernacularName?: string | null;
  kingdom?: string | null;
  imageEvidence?: { file?: { ref?: string | null } | null } | null;
};

type RoundOccurrencesResponse = {
  appGainforestDwcOccurrence?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    edges?: Array<{ node?: RawOccurrenceNode | null } | null> | null;
  } | null;
};

const ROUND_OCCURRENCES_QUERY = `
  query BioblitzDuplicateScan($first: Int!, $after: String, $where: AppGainforestDwcOccurrenceWhereInput) {
    appGainforestDwcOccurrence(
      first: $first
      after: $after
      where: $where
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          uri did rkey createdAt associatedMedia
          occurrenceRemarks fieldNotes scientificName vernacularName kingdom
          imageEvidence { file { ref } }
        }
      }
    }
  }
`;

type CandidateWithDescription = DuplicateCandidateRecord & { eligible: boolean };

async function fetchRoundCandidates(
  round: BioblitzRound,
  participantDids: ReadonlySet<string>,
  signal?: AbortSignal,
): Promise<CandidateWithDescription[]> {
  const [hiddenAccounts, hiddenRecords] = await Promise.all([
    fetchPublicHiddenAccountDids(signal).catch(() => new Set<string>()),
    fetchHiddenRecordUris(signal).catch(() => new Set<string>()),
  ]);
  const startMs = Date.parse(round.start);
  const endMs = Date.parse(round.end);
  const candidates: CandidateWithDescription[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_OCCURRENCE_PAGES; page += 1) {
    const data: RoundOccurrencesResponse | null = await indexerQueryStrict<RoundOccurrencesResponse>(
      ROUND_OCCURRENCES_QUERY,
      {
        first: OCCURRENCE_PAGE_SIZE,
        after,
        where: {
          imageEvidence: { isNull: false },
          createdAt: { gte: round.start, lte: round.end },
        },
      },
      signal,
    );
    const connection: RoundOccurrencesResponse["appGainforestDwcOccurrence"] =
      data?.appGainforestDwcOccurrence;
    if (!connection) throw new Error("Could not load this round's observations.");

    for (const edge of connection.edges ?? []) {
      const node = edge?.node;
      const uri = node?.uri?.trim();
      const did = node?.did?.trim();
      const rkey = node?.rkey?.trim();
      const createdAt = node?.createdAt?.trim();
      if (!uri || !did || !rkey || !createdAt) continue;
      if (!participantDids.has(did)) continue;
      if (hiddenAccounts.has(did) || hiddenRecords.has(uri)) continue;
      const createdMs = Date.parse(createdAt);
      if (!Number.isFinite(createdMs) || createdMs < startMs || createdMs > endMs) continue;
      if (!isWithinRoundUploadWindow(rkey, endMs)) continue;
      const imageCid = normaliseRef(node?.imageEvidence?.file?.ref);
      if (!imageCid) continue;

      const description = {
        notes: node?.occurrenceRemarks?.trim() || node?.fieldNotes?.trim() || null,
        scientificName: node?.scientificName ?? null,
        vernacularName: node?.vernacularName ?? null,
        kingdom: node?.kingdom ?? null,
      };
      const eligible = isEligibleBioblitzDescription(description);
      candidates.push({
        uri,
        did,
        rkey,
        createdAt,
        imageCid,
        associatedMedia: node?.associatedMedia?.trim() || null,
        scientificName: node?.scientificName?.trim() || null,
        vernacularName: node?.vernacularName?.trim() || null,
        points: bioblitzObservationPoints(description),
        eligible,
      });
    }

    if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return candidates;
}

// ── Scanner feed posts ──────────────────────────────────────────────────────

type ScannerPostNode = {
  reply?: { parent?: { uri?: string | null } | null } | null;
  embed?: unknown;
};

type ScannerPostsResponse = {
  appGainforestFeedPost?: {
    edges?: Array<{ node?: ScannerPostNode | null } | null> | null;
  } | null;
};

const SCANNER_POSTS_QUERY = `
  query BioblitzScannerDuplicates($first: Int!, $tag: String!) {
    appGainforestFeedPost(
      first: $first
      where: { tags: { any: { eq: $tag } } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node { embed reply { parent { uri } } } }
    }
  }
`;

function embeddedRecordUri(embed: unknown): string | null {
  if (!embed || typeof embed !== "object") return null;
  const record = (embed as { record?: unknown }).record;
  if (!record || typeof record !== "object") return null;
  const uri = (record as { uri?: unknown }).uri;
  return typeof uri === "string" && uri ? uri : null;
}

/** Pairs the offline visual scanner has published, best-effort. */
async function fetchScannerPairs(signal?: AbortSignal): Promise<[string, string][]> {
  const data = await indexerQueryStrict<ScannerPostsResponse>(
    SCANNER_POSTS_QUERY,
    { first: SCANNER_POSTS_LIMIT, tag: SCANNER_DUPLICATE_TAG },
    signal,
  ).catch(() => null);
  const pairs: [string, string][] = [];
  for (const edge of data?.appGainforestFeedPost?.edges ?? []) {
    const parent = edge?.node?.reply?.parent?.uri?.trim();
    const embedded = embeddedRecordUri(edge?.node?.embed);
    if (parent && embedded && parent !== embedded) pairs.push([parent, embedded]);
  }
  return pairs;
}

// ── Report assembly ─────────────────────────────────────────────────────────

function clusterId(uris: readonly string[]): string {
  // FNV-1a over the sorted member URIs: stable across reloads, no crypto import.
  const text = [...uris].sort().join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `dup-${(hash >>> 0).toString(16).padStart(8, "0")}-${uris.length}`;
}

/** The active merge whose canonical observation belongs to this cluster. */
function activeMergeForCluster(
  merges: readonly BioblitzMergeRecord[],
  roundId: number,
  memberUris: ReadonlySet<string>,
): BioblitzMergeRecord | null {
  return (
    merges.find((merge) => merge.roundId === roundId && memberUris.has(merge.canonicalUri)) ?? null
  );
}

/** Everything both the report and the auto-merge plan need for one round. */
type RoundDuplicateContext = {
  roundId: number;
  registrantByDid: Map<string, { displayName: string | null; avatarUrl: string | null }>;
  eligibleCandidates: CandidateWithDescription[];
  scannerPairs: [string, string][];
  /** Current active merges (all rounds). */
  activeMerges: ReturnType<typeof effectiveBioblitzMergeRecords>;
  /** URIs an active merge already stops from counting, for this round. */
  roundMergedAway: Set<string>;
};

async function loadRoundDuplicateContext(
  roundId: number,
  signal?: AbortSignal,
): Promise<RoundDuplicateContext> {
  const round = resolveBioblitzAdminRound(roundId);
  const registrants = await fetchBioblitzRoundRegistrants(round, signal);
  const registrantByDid = new Map(registrants.map((registrant) => [registrant.did, registrant]));

  const [candidates, scannerPairs, mergeRecords] = await Promise.all([
    fetchRoundCandidates(round, new Set(registrantByDid.keys()), signal),
    fetchScannerPairs(signal),
    fetchBioblitzMergeRecords(GAINFOREST_MODERATION_REPO_DID, signal),
  ]);
  const activeMerges = effectiveBioblitzMergeRecords(mergeRecords);
  const roundMergedAway = new Set(
    activeMerges
      .filter((merge) => merge.roundId === round.id)
      .flatMap((merge) => merge.duplicateUris),
  );

  return {
    roundId: round.id,
    registrantByDid,
    // Only observations that can earn points are worth clustering; ineligible
    // photos never contribute to the board in the first place.
    eligibleCandidates: candidates.filter((candidate) => candidate.eligible),
    scannerPairs,
    activeMerges,
    roundMergedAway,
  };
}

/**
 * Build the automatic duplicate report for one round: every registered
 * collector's observations, clustered by the metadata heuristics and the
 * visual scanner's published warnings, joined with the current merge state.
 */
export async function loadBioblitzDuplicateReport(
  roundId: number,
  signal?: AbortSignal,
): Promise<BioblitzDuplicateReport> {
  const { roundId: resolvedRoundId, registrantByDid, eligibleCandidates, scannerPairs, activeMerges, roundMergedAway } =
    await loadRoundDuplicateContext(roundId, signal);
  const clusters = clusterDuplicateCandidates(eligibleCandidates, scannerPairs);

  const views: BioblitzDuplicateClusterView[] = [];
  let suspectedExtraPoints = 0;
  for (const cluster of clusters) {
    const memberUris = new Set(cluster.records.map((record) => record.uri));
    const merge = activeMergeForCluster(activeMerges, resolvedRoundId, memberUris);
    const canonicalUri = merge?.canonicalUri ?? cluster.canonicalUri;
    const hasUnmergedMembers = cluster.records.some(
      (record) => record.uri !== canonicalUri && !roundMergedAway.has(record.uri),
    );
    if (!merge) suspectedExtraPoints += cluster.pointsBefore - cluster.pointsAfter;

    const registrant = registrantByDid.get(cluster.did);
    views.push({
      id: clusterId(cluster.records.map((record) => record.uri)),
      did: cluster.did,
      displayName: registrant?.displayName ?? null,
      avatarUrl: registrant?.avatarUrl ?? null,
      signals: cluster.signals,
      observations: cluster.records.map((record) => ({
        uri: record.uri,
        rkey: record.rkey,
        createdAt: record.createdAt,
        imageUrl: null,
        associatedMedia: record.associatedMedia,
        scientificName: record.scientificName,
        vernacularName: record.vernacularName,
        points: record.points,
        canonical: record.uri === canonicalUri,
        mergedAway: roundMergedAway.has(record.uri),
      })),
      canonicalUri,
      pointsBefore: cluster.pointsBefore,
      pointsAfter: cluster.pointsAfter,
      merge: merge
        ? { rkey: merge.rkey, createdAt: merge.createdAt, mergedUriCount: merge.duplicateUris.length }
        : null,
      hasUnmergedMembers,
    });
  }

  await resolveClusterImages(views, eligibleCandidates, signal);

  return {
    roundId: resolvedRoundId,
    scannedObservations: eligibleCandidates.length,
    clusters: views,
    suspectedExtraPoints: Math.round(suspectedExtraPoints * 2) / 2,
    autoMergeableGroups: planExactDuplicateMerges(eligibleCandidates, roundMergedAway).length,
  };
}

export type BioblitzAutoMergePlan = {
  roundId: number;
  entries: ExactDuplicateMergePlan[];
};

/**
 * The merges the one-click "auto-merge identical files" action would perform
 * right now: one merge per group of same-collector observations that share
 * the exact same image blob and are not already handled by an active merge.
 */
export async function loadBioblitzAutoMergePlan(
  roundId: number,
  signal?: AbortSignal,
): Promise<BioblitzAutoMergePlan> {
  const context = await loadRoundDuplicateContext(roundId, signal);
  return {
    roundId: context.roundId,
    entries: planExactDuplicateMerges(context.eligibleCandidates, context.roundMergedAway),
  };
}

/** Fill in blob URLs for every cluster member, with bounded concurrency. */
async function resolveClusterImages(
  views: BioblitzDuplicateClusterView[],
  candidates: readonly (DuplicateCandidateRecord & { eligible: boolean })[],
  signal?: AbortSignal,
): Promise<void> {
  const cidByUri = new Map(candidates.map((candidate) => [candidate.uri, candidate.imageCid]));
  const tasks: Array<{ view: BioblitzDuplicateObservationView; did: string; cid: string }> = [];
  for (const cluster of views) {
    for (const observation of cluster.observations) {
      const cid = cidByUri.get(observation.uri);
      if (cid) tasks.push({ view: observation, did: cluster.did, cid });
    }
  }
  let cursor = 0;
  const workers = Array.from({ length: Math.min(IMAGE_URL_CONCURRENCY, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      if (signal?.aborted) return;
      const task = tasks[cursor++]!;
      task.view.imageUrl = await resolveBlobUrl(task.did, task.cid).catch(() => null);
    }
  });
  await Promise.all(workers);
}
