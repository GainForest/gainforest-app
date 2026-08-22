/**
 * GainForest Arena — IO layer. Walks the keyless indexer GraphQL plus public
 * PDS reads and feeds the pure scorer in ./scoring.ts. Everything here is
 * best-effort per source: a failing optional source degrades to an empty set
 * rather than sinking the whole report.
 *
 * Discovery paths:
 * - Photo-id submissions: the indexer does NOT index
 *   app.gainforest.dwc.identification, so proposals are discovered through
 *   their tagged notification feed posts (`species-identification` tag carrying
 *   the `identification:<rkey>` ref tag) and the lexicon record is then read
 *   from the author's PDS. A dedicated reader is used instead of
 *   fetchSpeciesIdentification because owner-acceptance detection needs the
 *   subject strongRef CID, which that helper drops.
 * - Image-review submissions: feed posts tagged `arena-flag` plus
 *   `likely-duplicate` / `likely-invalid`.
 */

import "server-only";

import { featuredRound, bioblitzRoundIdAt } from "@/app/_lib/bioblitz";
import {
  fetchBioblitzExclusions,
  indexBioblitzExclusions,
} from "@/app/_lib/bioblitz-exclusions";
import {
  effectiveBioblitzMergeRecords,
  fetchBioblitzMerges,
  indexBioblitzMerges,
} from "@/app/_lib/bioblitz-merges";
import {
  fetchHiddenAccountDids,
  fetchHiddenRecordUris,
  indexerQueryStrict,
} from "@/app/_lib/indexer";
import { normaliseRef, resolveBlobUrl, resolvePdsHost } from "@/app/_lib/pds";
import {
  identificationRkeyFromTags,
  SPECIES_IDENTIFICATION_TAG,
} from "@/app/_lib/species-identifications";

import {
  assembleReport,
  buildProblemViews,
  buildStandings,
  dedupeIdentifications,
  imageReviewQueueSummary,
  isArenaPhotoProblem,
  photoIdQueueSummary,
  scoreImageReviewCategory,
  scorePhotoIdCategory,
  type ArenaFlagInput,
  type ArenaIdentificationInput,
  type ArenaOccurrenceInput,
} from "./scoring";
import {
  ARENA_DUPLICATE_TAG,
  ARENA_FLAG_TAG,
  ARENA_IDENTIFICATION_COLLECTION,
  ARENA_INVALID_TAG,
  type ArenaProblemView,
  type ArenaQueueSummary,
  type ArenaReport,
} from "./types";

// ── Tuning ──────────────────────────────────────────────────────────────────

const INDEXER_PAGE_SIZE = 1000;
/** Page caps keep worst-case latency bounded; counts below them are exact. */
const PROBLEM_WALK_MAX_PAGES = 8;
const ROUND_WALK_MAX_PAGES = 4;
const TAGGED_POSTS_LIMIT = 1000;
const PDS_CONCURRENCY = 8;
/** Upper bound on single-occurrence lookups for flags and problem subjects
 *  that were not in any walked page (deleted records fail fast and cheap). */
const OCCURRENCE_LOOKUP_LIMIT = 60;
/** How many collaboration problems the report list carries. */
const PROBLEM_VIEW_CAP = 12;

/** Internal walk record: scoring input plus the blob ref for image resolution. */
type IndexedOccurrence = ArenaOccurrenceInput & { imageRef: string | null };

// ── GraphQL ─────────────────────────────────────────────────────────────────

type TaggedPostNode = {
  uri?: string | null;
  did?: string | null;
  createdAt?: string | null;
  tags?: string[] | null;
  reply?: { root?: { uri?: string | null } | null; parent?: { uri?: string | null } | null } | null;
  embed?: unknown;
};

type TaggedPostsResponse = {
  appGainforestFeedPost?: {
    edges?: Array<{ node?: TaggedPostNode | null } | null> | null;
  } | null;
};

const TAGGED_POSTS_QUERY = `
  query ArenaTaggedPosts($first: Int!, $tag: String!) {
    appGainforestFeedPost(
      first: $first
      where: { tags: { any: { eq: $tag } } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges {
        node {
          uri did createdAt tags
          reply { root { uri } parent { uri } }
          embed
        }
      }
    }
  }
`;

type RawOccurrenceNode = {
  uri?: string | null;
  did?: string | null;
  cid?: string | null;
  rkey?: string | null;
  createdAt?: string | null;
  scientificName?: string | null;
  kingdom?: string | null;
  imageEvidence?: { file?: { ref?: string | null } | null } | null;
};

type OccurrencesResponse = {
  appGainforestDwcOccurrence?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    edges?: Array<{ node?: RawOccurrenceNode | null } | null> | null;
  } | null;
};

const OCCURRENCES_QUERY = `
  query ArenaOccurrences($first: Int!, $after: String, $where: AppGainforestDwcOccurrenceWhereInput) {
    appGainforestDwcOccurrence(first: $first, after: $after, where: $where, sortBy: createdAt, sortDirection: DESC) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          uri did rkey cid createdAt scientificName kingdom
          imageEvidence { file { ref } }
        }
      }
    }
  }
`;

type OccurrenceByUriResponse = {
  appGainforestDwcOccurrenceByUri?: {
    uri?: string | null;
    did?: string | null;
    cid?: string | null;
    createdAt?: string | null;
    scientificName?: string | null;
    imageEvidence?: { file?: { ref?: string | null } | null } | null;
  } | null;
};

const OCCURRENCE_BY_URI_QUERY = `
  query ArenaOccurrenceByUri($uri: String!) {
    appGainforestDwcOccurrenceByUri(uri: $uri) {
      uri did cid createdAt scientificName
      imageEvidence { file { ref } }
    }
  }
`;

async function fetchTaggedPosts(tag: string, signal?: AbortSignal): Promise<TaggedPostNode[]> {
  const data = await indexerQueryStrict<TaggedPostsResponse>(
    TAGGED_POSTS_QUERY,
    { first: TAGGED_POSTS_LIMIT, tag },
    signal,
  ).catch(() => null);
  return (data?.appGainforestFeedPost?.edges ?? [])
    .map((edge) => edge?.node)
    .filter((n): n is TaggedPostNode => Boolean(n?.uri && n?.did));
}

async function walkOccurrences(
  where: Record<string, unknown>,
  maxPages: number,
  signal?: AbortSignal,
): Promise<IndexedOccurrence[]> {
  const out: IndexedOccurrence[] = [];
  let after: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const data: OccurrencesResponse | null = await indexerQueryStrict<OccurrencesResponse>(
      OCCURRENCES_QUERY,
      { first: INDEXER_PAGE_SIZE, after, where },
      signal,
    );
    const connection: OccurrencesResponse["appGainforestDwcOccurrence"] =
      data?.appGainforestDwcOccurrence;
    if (!connection) break;
    for (const edge of connection.edges ?? []) {
      const node = edge?.node;
      if (!node) continue;
      const uri = node.uri?.trim();
      const did = node.did?.trim();
      if (!uri || !did) continue;
      out.push({
        uri,
        did,
        cid: node.cid?.trim() || null,
        scientificName: node.scientificName?.trim() || null,
        createdAt: node.createdAt?.trim() || null,
        imageRef: normaliseRef(node.imageEvidence?.file?.ref),
      });
    }
    if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }
  return out;
}

// ── PDS reads ───────────────────────────────────────────────────────────────

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type IdentifiedRecord = {
  uri: string;
  subjectUri: string;
  /** Subject strongRef CID — pins the occurrence version the agent evaluated. */
  subjectCid: string | null;
  scientificName: string;
  vernacularName: string | null;
  taxonRank: string | null;
  confidence: number | null;
  identificationRemarks: string | null;
  createdAt: string | null;
};

/**
 * Read one identification record from its author's PDS, keeping the subject
 * strongRef CID. Same record shape as fetchSpeciesIdentification in
 * app/_lib/species-identifications.ts, which cannot be reused here because it
 * drops the CID (needed for the owner-acceptance rule).
 */
export async function fetchIdentificationWithSubject(
  did: string,
  rkey: string,
  signal?: AbortSignal,
): Promise<IdentifiedRecord | null> {
  try {
    const host = await resolvePdsHost(did, signal);
    if (!host) return null;
    const params = new URLSearchParams({ repo: did, collection: ARENA_IDENTIFICATION_COLLECTION, rkey });
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      uri?: unknown;
      value?: {
        $type?: unknown;
        subject?: { uri?: unknown; cid?: unknown } | null;
        scientificName?: unknown;
        vernacularName?: unknown;
        taxonRank?: unknown;
        confidence?: unknown;
        identificationRemarks?: unknown;
        createdAt?: unknown;
      };
    };
    const uri = nonEmptyString(data.uri);
    const scientificName = nonEmptyString(data.value?.scientificName);
    const subjectUri = nonEmptyString(data.value?.subject?.uri);
    if (
      data.value?.$type !== ARENA_IDENTIFICATION_COLLECTION ||
      !uri ||
      !scientificName ||
      !subjectUri
    ) {
      return null;
    }
    return {
      uri,
      subjectUri,
      subjectCid: nonEmptyString(data.value.subject?.cid),
      scientificName,
      vernacularName: nonEmptyString(data.value.vernacularName),
      taxonRank: nonEmptyString(data.value.taxonRank),
      confidence:
        typeof data.value.confidence === "number" &&
        Number.isInteger(data.value.confidence)
          ? Math.min(100, Math.max(0, data.value.confidence))
          : null,
      // Full text — the UI clamps for display.
      identificationRemarks: nonEmptyString(data.value.identificationRemarks),
      createdAt: nonEmptyString(data.value.createdAt),
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return null;
  }
}

/** Bounded-concurrency map, same shape as the admin dashboard's workers. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await worker(items[index]!);
    }
  });
  await Promise.all(runners);
  return out;
}

// ── Report assembly ─────────────────────────────────────────────────────────

function embeddedRecordUri(embed: unknown): string | null {
  if (!embed || typeof embed !== "object") return null;
  const record = (embed as { record?: unknown }).record;
  if (!record || typeof record !== "object") return null;
  return nonEmptyString((record as { uri?: unknown }).uri);
}

async function fetchIdentificationSubmissions(
  posts: readonly TaggedPostNode[],
  signal?: AbortSignal,
): Promise<ArenaIdentificationInput[]> {
  const targets = posts
    .map((post) => ({
      post,
      rkey: identificationRkeyFromTags(post.tags),
    }))
    .filter((t): t is { post: TaggedPostNode; rkey: string } => Boolean(t.rkey));

  const records = await mapWithConcurrency(targets, PDS_CONCURRENCY, async ({ post, rkey }) => {
    const did = post.did!.trim();
    const record = await fetchIdentificationWithSubject(did, rkey, signal).catch(() => null);
    return record ? { did, record, indexedAt: post.createdAt?.trim() ?? null } : null;
  });

  return records
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map(({ did, record, indexedAt }) => ({
      uri: record.uri,
      did,
      subjectUri: record.subjectUri,
      subjectCid: record.subjectCid,
      scientificName: record.scientificName,
      vernacularName: record.vernacularName,
      taxonRank: record.taxonRank,
      confidence: record.confidence,
      remarks: record.identificationRemarks,
      createdAt: record.createdAt,
      indexedAt,
    }));
}

async function lookupOccurrenceByUri(
  uri: string,
  signal?: AbortSignal,
): Promise<IndexedOccurrence | null> {
  const data = await indexerQueryStrict<OccurrenceByUriResponse>(
    OCCURRENCE_BY_URI_QUERY,
    { uri },
    signal,
  ).catch(() => null);
  const node = data?.appGainforestDwcOccurrenceByUri;
  if (!node?.did?.trim()) return null;
  return {
    uri,
    did: node.did.trim(),
    cid: node.cid?.trim() || null,
    scientificName: node.scientificName?.trim() || null,
    createdAt: node.createdAt?.trim() || null,
    imageRef: normaliseRef(node.imageEvidence?.file?.ref),
  };
}

/**
 * Build the full arena report. With today's production data (zero
 * species-identification posts so far) this returns empty standings and honest
 * queue counts — never throws on missing arena activity.
 */
export async function loadArenaReport(signal?: AbortSignal): Promise<ArenaReport> {
  const round = featuredRound();

  const [problemAll, roundAll, idPosts, flagPosts, mergesRaw, exclusionsRaw, hiddenRecords, hiddenAccounts] =
    await Promise.all([
      walkOccurrences({ imageEvidence: { isNull: false } }, PROBLEM_WALK_MAX_PAGES, signal),
      walkOccurrences(
        { imageEvidence: { isNull: false }, createdAt: { gte: round.start, lte: round.end } },
        ROUND_WALK_MAX_PAGES,
        signal,
      ),
      fetchTaggedPosts(SPECIES_IDENTIFICATION_TAG, signal),
      fetchTaggedPosts(ARENA_FLAG_TAG, signal),
      fetchBioblitzMerges(signal).catch(() => []),
      fetchBioblitzExclusions(signal).catch(() => []),
      fetchHiddenRecordUris(signal).catch(() => new Set<string>()),
      fetchHiddenAccountDids(signal).catch(() => new Set<string>()),
    ]);

  // Occurrence index shared by flag enrichment and the known-record universe.
  const occurrenceByUri = new Map<string, ArenaOccurrenceInput>();
  for (const o of [...problemAll, ...roundAll]) occurrenceByUri.set(o.uri, o);

  // ── Submissions ─────────────────────────────────────────────────────────
  // (The GraphQL layer has no OR, so the "missing OR coarse name" problem
  // filter cannot be pushed down; problem status is judged locally in the
  // queue step. Identified photos stay in the walked set because flags can
  // point at them. The page cap means openCount is a floor once the photo
  // stream outgrows the walk.)
  const submissions = await fetchIdentificationSubmissions(idPosts, signal);

  // Make sure every proposed-on observation is known (owner/current name are
  // required to render a problem). Misses share the bounded lookup budget.
  let problemLookups = 0;
  for (const subjectUri of new Set(submissions.map((s) => s.subjectUri))) {
    if (occurrenceByUri.has(subjectUri)) continue;
    if (problemLookups >= OCCURRENCE_LOOKUP_LIMIT) break;
    problemLookups += 1;
    const target = await lookupOccurrenceByUri(subjectUri, signal);
    if (target) occurrenceByUri.set(target.uri, target);
  }

  // ── Problems (collaboration view) ────────────────────────────────────
  // Cap first, then resolve image URLs — only for the capped list.
  const cappedProblems = buildProblemViews(occurrenceByUri, submissions).slice(0, PROBLEM_VIEW_CAP);
  await mapWithConcurrency(cappedProblems, PDS_CONCURRENCY, async (problem) => {
    const indexed = occurrenceByUri.get(problem.subjectUri) as IndexedOccurrence | undefined;
    if (!indexed?.imageRef) return;
    problem.imageUrl = await resolveBlobUrl(indexed.did, indexed.imageRef, signal).catch(() => null);
  });
  const problems: ArenaProblemView[] = cappedProblems;

  // ── Flags ───────────────────────────────────────────────────────────────
  const activeMerges = effectiveBioblitzMergeRecords(mergesRaw);
  const excludedDidsByRound = indexBioblitzExclusions(exclusionsRaw);
  const mergedAwayUrisByRound = indexBioblitzMerges(mergesRaw);

  const flagCandidates = flagPosts
    .map((post) => {
      const tags = new Set((post.tags ?? []).map((t) => t.trim().toLowerCase()));
      if (!tags.has(ARENA_FLAG_TAG)) return null;
      const kind = tags.has(ARENA_DUPLICATE_TAG)
        ? ("duplicate" as const)
        : tags.has(ARENA_INVALID_TAG)
          ? ("invalid" as const)
          : null;
      if (!kind) return null;
      const parentUri = post.reply?.parent?.uri?.trim();
      if (!parentUri) return null;
      return {
        uri: post.uri!.trim(),
        did: post.did!.trim(),
        kind,
        parentUri,
        duplicateUri: kind === "duplicate" ? embeddedRecordUri(post.embed) : null,
        createdAt: post.createdAt?.trim() ?? null,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  // Enrich flags whose target observation was not in any walked page. Deleted
  // records miss here too, but lookups are capped so a flood of dead flags
  // cannot turn into unbounded queries.
  let lookups = 0;
  const enrichedFlags: ArenaFlagInput[] = [];
  for (const flag of flagCandidates) {
    let target = occurrenceByUri.get(flag.parentUri) ?? null;
    if (!target && lookups < OCCURRENCE_LOOKUP_LIMIT) {
      lookups += 1;
      target = await lookupOccurrenceByUri(flag.parentUri, signal);
      if (target) occurrenceByUri.set(target.uri, target);
    }
    enrichedFlags.push({
      ...flag,
      flaggedOwnerDid: target?.did ?? null,
      roundId: bioblitzRoundIdAt(Date.parse(target?.createdAt ?? "")),
    });  }

  // ── Score ───────────────────────────────────────────────────────────────
  const knownObservationUris = new Set(occurrenceByUri.keys());
  const photoId = scorePhotoIdCategory(problemAll, dedupeIdentifications(submissions));
  const imageReview = scoreImageReviewCategory(enrichedFlags, {
    merges: activeMerges,
    hiddenRecordUris: hiddenRecords,
    hiddenAccountDids: hiddenAccounts,
    excludedDidsByRound,
    knownObservationUris,
  });

  // ── Queues ──────────────────────────────────────────────────────────────
  const queues: ArenaQueueSummary[] = [
    photoIdQueueSummary(
      problemAll.filter((o) =>
        isArenaPhotoProblem({
          hasImageEvidence: true,
          scientificName: o.scientificName,
          kingdom: null,
        }),
      ),
    ),
    imageReviewQueueSummary({
      roundObservations: roundAll,
      flaggedParentUris: new Set(flagCandidates.map((f) => f.parentUri)),
      mergedAwayUris: mergedAwayUrisByRound.get(round.id) ?? new Set<string>(),
      hiddenRecordUris: hiddenRecords,
      hiddenAccountDids: hiddenAccounts,
    }),
  ];

  return assembleReport(queues, buildStandings(photoId, imageReview), problems);
}
