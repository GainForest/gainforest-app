/**
 * Reviews layer: third-party judgement attached to Bumicerts.
 *
 * Two record families, one indexer (the GainForest hyperindex, `INDEXER_URL`):
 *
 *  1. `org.hypercerts.context.evaluation` — the Hypercerts protocol's formal
 *     evaluation primitive (summary, optional numeric score, evaluator DIDs,
 *     report links). The GraphQL `where` input only exposes a presence filter
 *     on `subject`, so we drain the (small) collection once and index it by
 *     `subject.uri`, exactly like `funding-summary.ts` does for funding
 *     configs.
 *
 *  2. `app.gainforest.feed.post` reply-posts — the same comment records the
 *     feed's like + comment bar writes (a post carrying a `reply` ref whose
 *     root is the subject). One query per subject pulls the whole thread,
 *     since every comment and nested reply shares the same `reply.root`.
 *
 * Everything is cached for five minutes in-process; a Bumicert detail render
 * costs zero extra round-trips when the caches are warm.
 */

import { cachedAsync } from "./async-cache";
import { indexerQuery } from "./indexer";

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
  /** Repo owner — the account that posted the comment. */
  did: string;
  subjectUri: string;
  text: string;
  createdAt: string | null;
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

// ── Comments (GainForest hyperindex feed reply-posts) ─────────────────────

type FeedCommentNode = {
  uri?: string | null;
  did?: string | null;
  text?: string | null;
  createdAt?: string | null;
  reply?: { parent?: { uri?: string | null } | null } | null;
};

// Match by thread root so one query yields the subject's top-level comments
// AND every nested reply (all of which carry `reply.root == subject`).
const COMMENTS_FOR_SUBJECT_QUERY = `
  query ReviewCommentsForSubject($uri: String!) {
    appGainforestFeedPost(first: 200, where: { reply: { root: { uri: { eq: $uri } } } }) {
      edges {
        node {
          uri did text createdAt
          reply { parent { uri } }
        }
      }
    }
  }
`;

/**
 * The comment thread for one subject: top-level comments (replies directly to
 * the subject) with one level of threading — deeper reply chains are flattened
 * onto their top-level ancestor so long discussions stay readable.
 */
async function loadCommentsForSubject(subjectUri: string): Promise<ReviewComment[]> {
  const data = await indexerQuery<{
    appGainforestFeedPost?: { edges?: Array<{ node?: FeedCommentNode | null } | null> | null } | null;
  }>(COMMENTS_FOR_SUBJECT_QUERY, { uri: subjectUri });

  const byUri = new Map<string, ReviewComment>();
  const parentByUri = new Map<string, string>();
  for (const edge of data?.appGainforestFeedPost?.edges ?? []) {
    const node = edge?.node;
    if (!node?.uri || !node.did || !node.text) continue;
    byUri.set(node.uri, {
      uri: node.uri,
      did: node.did,
      subjectUri,
      text: node.text,
      createdAt: node.createdAt ?? null,
      replies: [],
    });
    if (node.reply?.parent?.uri) parentByUri.set(node.uri, node.reply.parent.uri);
  }

  const roots: ReviewComment[] = [];
  for (const comment of byUri.values()) {
    // Walk up the parent chain to this comment's top-level ancestor.
    let parentUri = parentByUri.get(comment.uri) ?? subjectUri;
    let hops = 0;
    while (parentUri !== subjectUri && hops < 10) {
      const next = parentByUri.get(parentUri);
      if (!next || !byUri.has(parentUri)) break;
      if (next === subjectUri) break;
      parentUri = next;
      hops += 1;
    }
    if (parentUri === subjectUri || !byUri.has(parentUri)) {
      roots.push(comment);
    } else {
      const ancestor = byUri.get(parentUri);
      if (ancestor && ancestor !== comment) ancestor.replies.push(comment);
      else roots.push(comment);
    }
  }

  const byTime = (a: ReviewComment, b: ReviewComment) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  roots.sort(byTime);
  for (const comment of roots) comment.replies.sort(byTime);
  return roots;
}

export function fetchCommentsForSubject(subjectUri: string, signal?: AbortSignal): Promise<ReviewComment[]> {
  return cachedAsync(`reviews:comments:${subjectUri}`, CACHE_TTL_MS, () => loadCommentsForSubject(subjectUri), signal);
}

// ── Combined accessors ────────────────────────────────────────────────────

/** Everything reviewers have said about one Bumicert. Failures degrade to empty lists. */
export async function fetchReviewsForSubject(subjectUri: string, signal?: AbortSignal): Promise<BumicertReviews> {
  const [evaluations, comments] = await Promise.all([
    fetchEvaluationIndex(signal).then((index) => index.get(subjectUri) ?? [], () => []),
    fetchCommentsForSubject(subjectUri, signal).catch(() => []),
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

