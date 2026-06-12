/**
 * Reviews layer: third-party judgement attached to Bumicerts.
 *
 * Two record families, two indexers:
 *
 *  1. `org.hypercerts.context.evaluation` — the Hypercerts protocol's formal
 *     evaluation primitive (summary, optional numeric score, evaluator DIDs,
 *     report links). Indexed by the GainForest hyperindex we already use for
 *     everything else (`INDEXER_URL`). The GraphQL `where` input only exposes
 *     a presence filter on `subject`, so we drain the (small) collection once
 *     and index it by `subject.uri`, exactly like `funding-summary.ts` does
 *     for funding configs.
 *
 *  2. `org.impactindexer.review.comment` — lightweight threaded comments on
 *     any AT-URI. These are written by simocracy.org users and by AI sims via
 *     pi-simocracy (`simocracy_post_comment`). They are NOT ingested by the
 *     GainForest hyperindex, so we read them from the Simocracy indexer's
 *     generic `records(collection:)` endpoint. Sim authorship is carried in
 *     `org.simocracy.history` sidecars (`type === "comment"`, `subjectUri`
 *     pointing at the comment) — we join those so sim-authored comments can
 *     be labelled as such in the UI.
 *
 * Everything is cached for five minutes in-process; a Bumicert detail render
 * costs zero extra round-trips when the caches are warm.
 */

import { cachedAsync } from "./async-cache";
import { indexerQuery } from "./indexer";

const SIMOCRACY_INDEXER_URL = "https://simocracy-indexer.gainforest.id/graphql";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_DRAIN = 4000;
const PAGE_SIZE = 1000;

// ── Types ─────────────────────────────────────────────────────────────────

export type EvaluationScore = { min: number; max: number; value: number };

export type BumicertEvaluation = {
  uri: string;
  /** Repo owner — the account that published the evaluation. */
  did: string;
  subjectUri: string;
  summary: string;
  score: EvaluationScore | null;
  /** Links to detailed reports / methodology, when provided. */
  contentUris: string[];
  createdAt: string | null;
};

export type ReviewComment = {
  uri: string;
  /** Repo owner — for sim-authored comments this is the sim operator. */
  did: string;
  subjectUri: string;
  text: string;
  createdAt: string | null;
  /** Set when an `org.simocracy.history` sidecar attributes this comment to an AI sim. */
  sim: { name: string; uri: string | null } | null;
  replies: ReviewComment[];
};

export type BumicertReviews = {
  evaluations: BumicertEvaluation[];
  comments: ReviewComment[];
};

// ── Evaluations (GainForest hyperindex) ───────────────────────────────────

type EvaluationNode = {
  uri?: string | null;
  did?: string | null;
  summary?: string | null;
  createdAt?: string | null;
  subject?: { uri?: string | null } | null;
  score?: { min?: string | null; max?: string | null; value?: string | null } | null;
  content?: Array<{ uri?: string | null } | null> | null;
};

function parseScore(node: EvaluationNode["score"]): EvaluationScore | null {
  if (!node) return null;
  const min = Number.parseFloat(node.min ?? "");
  const max = Number.parseFloat(node.max ?? "");
  const value = Number.parseFloat(node.value ?? "");
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value)) return null;
  if (max <= min) return null;
  return { min, max, value };
}

type EvaluationPage = {
  orgHypercertsContextEvaluation?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    edges?: Array<{ node?: EvaluationNode | null } | null> | null;
  } | null;
};

async function loadEvaluationIndex(): Promise<Map<string, BumicertEvaluation[]>> {
  const index = new Map<string, BumicertEvaluation[]>();
  let cursor: string | null = null;

  for (let drained = 0; drained < MAX_DRAIN; ) {
    const data: EvaluationPage | null = await indexerQuery<EvaluationPage>(
      // NOTE: `evaluators { did }` is intentionally NOT requested — a single
      // malformed record nulls the whole connection (non-null bubbling). The
      // repo owner `did` is a reliable evaluator identity for display.
      `query EvaluationIndex($first: Int!, $after: String) {
        orgHypercertsContextEvaluation(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              uri
              did
              summary
              createdAt
              subject { uri }
              score { min max value }
              content { ... on OrgHypercertsDefsUri { uri } }
            }
          }
        }
      }`,
      { first: PAGE_SIZE, after: cursor },
    );

    // Explicit annotation: TS otherwise reports a false-positive TS7022
    // circularity (cursor -> data -> conn -> cursor narrowing loop).
    const conn: EvaluationPage["orgHypercertsContextEvaluation"] = data?.orgHypercertsContextEvaluation;
    const edges = conn?.edges ?? [];
    for (const edge of edges) {
      const node = edge?.node;
      const subjectUri = node?.subject?.uri;
      if (!node?.uri || !node.did || !subjectUri || !node.summary) continue;
      const evaluation: BumicertEvaluation = {
        uri: node.uri,
        did: node.did,
        subjectUri,
        summary: node.summary,
        score: parseScore(node.score),
        contentUris: (node.content ?? [])
          .map((item) => item?.uri ?? null)
          .filter((uri): uri is string => typeof uri === "string" && /^https?:\/\//.test(uri)),
        createdAt: node.createdAt ?? null,
      };
      const list = index.get(subjectUri);
      if (list) list.push(evaluation);
      else index.set(subjectUri, [evaluation]);
    }

    drained += edges.length;
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor || edges.length === 0) break;
    cursor = conn.pageInfo.endCursor;
  }

  for (const list of index.values()) {
    list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }
  return index;
}

export function fetchEvaluationIndex(signal?: AbortSignal): Promise<Map<string, BumicertEvaluation[]>> {
  return cachedAsync("reviews:evaluation-index", CACHE_TTL_MS, loadEvaluationIndex, signal);
}

// ── Comments (Simocracy indexer) ──────────────────────────────────────────

type SimocracyRecordNode = {
  uri?: string | null;
  did?: string | null;
  value?: Record<string, unknown> | null;
};

/** Drain a collection from the Simocracy indexer's generic records endpoint. */
async function drainSimocracyCollection(collection: string): Promise<SimocracyRecordNode[]> {
  const nodes: SimocracyRecordNode[] = [];
  let cursor: string | null = null;

  while (nodes.length < MAX_DRAIN) {
    const res = await fetch(SIMOCRACY_INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query DrainCollection($collection: String!, $first: Int, $after: String) {
          records(collection: $collection, first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            edges { node { uri did value } }
          }
        }`,
        variables: { collection, first: PAGE_SIZE, after: cursor },
      }),
    });
    if (!res.ok) throw new Error(`simocracy indexer ${res.status}`);
    const json = (await res.json()) as {
      data?: {
        records?: {
          pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
          edges?: Array<{ node?: SimocracyRecordNode | null } | null> | null;
        } | null;
      } | null;
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length && !json.data?.records) {
      throw new Error(json.errors[0]?.message ?? "simocracy indexer error");
    }

    const conn = json.data?.records;
    const edges = conn?.edges ?? [];
    for (const edge of edges) {
      if (edge?.node) nodes.push(edge.node);
    }
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor || edges.length === 0) break;
    cursor = conn.pageInfo.endCursor;
  }

  return nodes;
}

function readString(value: Record<string, unknown> | null | undefined, key: string): string | null {
  const raw = value?.[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** `subject` on a comment is `{ uri }` per the lexicon, but legacy records may hold a bare string. */
function readSubjectUri(value: Record<string, unknown> | null | undefined): string | null {
  const subject = value?.subject;
  if (typeof subject === "string") return subject;
  if (typeof subject === "object" && subject !== null) {
    const uri = (subject as Record<string, unknown>).uri;
    if (typeof uri === "string") return uri;
  }
  return null;
}

/**
 * Comment index: top-level comments grouped by the AT-URI they were posted
 * on, with one level of threading (replies whose subject is another comment)
 * and sim attribution joined from `org.simocracy.history` sidecars.
 */
async function loadCommentIndex(): Promise<Map<string, ReviewComment[]>> {
  const [commentNodes, historyNodes] = await Promise.all([
    drainSimocracyCollection("org.impactindexer.review.comment"),
    drainSimocracyCollection("org.simocracy.history"),
  ]);

  // commentUri -> sim attribution
  const simByCommentUri = new Map<string, { name: string; uri: string | null }>();
  for (const node of historyNodes) {
    const value = node.value;
    if (readString(value, "type") !== "comment") continue;
    const subjectUri = readString(value, "subjectUri");
    if (!subjectUri) continue;
    const simNames = Array.isArray(value?.simNames) ? (value?.simNames as unknown[]) : [];
    const simUris = Array.isArray(value?.simUris) ? (value?.simUris as unknown[]) : [];
    const name = typeof simNames[0] === "string" ? simNames[0] : null;
    if (!name) continue;
    simByCommentUri.set(subjectUri, {
      name,
      uri: typeof simUris[0] === "string" ? simUris[0] : null,
    });
  }

  const byUri = new Map<string, ReviewComment>();
  for (const node of commentNodes) {
    const text = readString(node.value, "text");
    const subjectUri = readSubjectUri(node.value);
    if (!node.uri || !node.did || !text || !subjectUri) continue;
    byUri.set(node.uri, {
      uri: node.uri,
      did: node.did,
      subjectUri,
      text,
      createdAt: readString(node.value, "createdAt"),
      sim: simByCommentUri.get(node.uri) ?? null,
      replies: [],
    });
  }

  // Thread: a comment whose subject is another comment becomes a reply
  // (flattened to one level so deep chains stay readable).
  const index = new Map<string, ReviewComment[]>();
  const byTime = (a: ReviewComment, b: ReviewComment) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  for (const comment of byUri.values()) {
    let parent = byUri.get(comment.subjectUri);
    let hops = 0;
    while (parent && byUri.has(parent.subjectUri) && hops < 10) {
      parent = byUri.get(parent.subjectUri);
      hops += 1;
    }
    if (parent && parent !== comment) {
      parent.replies.push(comment);
      continue;
    }
    if (byUri.has(comment.subjectUri)) continue; // self/cyclic reference — drop
    const list = index.get(comment.subjectUri);
    if (list) list.push(comment);
    else index.set(comment.subjectUri, [comment]);
  }
  for (const list of index.values()) {
    list.sort(byTime);
    for (const comment of list) comment.replies.sort(byTime);
  }
  return index;
}

export function fetchCommentIndex(signal?: AbortSignal): Promise<Map<string, ReviewComment[]>> {
  return cachedAsync("reviews:comment-index", CACHE_TTL_MS, loadCommentIndex, signal);
}

// ── Combined accessors ────────────────────────────────────────────────────

/** Everything reviewers have said about one Bumicert. Failures degrade to empty lists. */
export async function fetchReviewsForSubject(subjectUri: string, signal?: AbortSignal): Promise<BumicertReviews> {
  const [evaluations, comments] = await Promise.all([
    fetchEvaluationIndex(signal).then((index) => index.get(subjectUri) ?? [], () => []),
    fetchCommentIndex(signal).then((index) => index.get(subjectUri) ?? [], () => []),
  ]);
  return { evaluations, comments };
}

export type ReviewCounts = { evaluations: number; comments: number };

/** Cheap counts for badges/chips. Counts replies too — they are voices, not metadata. */
export async function fetchReviewCounts(subjectUri: string, signal?: AbortSignal): Promise<ReviewCounts> {
  const { evaluations, comments } = await fetchReviewsForSubject(subjectUri, signal);
  let commentCount = 0;
  for (const comment of comments) commentCount += 1 + comment.replies.length;
  return { evaluations: evaluations.length, comments: commentCount };
}
