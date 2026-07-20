/**
 * Feed engagement read layer — like + comment aggregates from the hyperindex,
 * keyed by the AT-URI of the record being engaged with.
 *
 * Shared module (no "use client"): it is a pure fetch layer with no browser
 * APIs, imported both by client components (feed cards, the BioBlitz page)
 * and by server code (the BioBlitz winner-badge route recomputes the round's
 * most-liked photo with it).
 *
 * Likes are `app.gainforest.feed.like` records (subject strongRef); comments are
 * `app.gainforest.feed.post` records carrying a `reply` (a reply-post, the
 * Bluesky model). The indexer exposes both as typed collections with nested
 * `subject.uri` / `reply.parent.uri` filters, so we batch-count engagement for a
 * page of feed rows in two queries per 100-row chunk, and fetch a subject's full
 * comment thread on demand when its panel opens.
 *
 * Counts are derived by scanning the matching records client-side (up to
 * SCAN_CAP per chunk) rather than a server aggregate — fine for the current feed
 * volume, and the same query yields the viewer's own like record (so the heart
 * fills and "unlike" knows which record to delete).
 */

import { indexerQuery } from "./indexer";
import { normaliseRef } from "./pds";
import {
  mentionCandidatesFromFacets,
  type MentionCandidate,
  type RawIndexedFacet,
} from "./mentions";

export type Engagement = {
  likeCount: number;
  commentCount: number;
  /** AT-URI of the viewer's own like record, when they've liked this subject. */
  viewerLikeUri: string | null;
};

export type FeedComment = {
  uri: string;
  did: string;
  text: string;
  createdAt: string | null;
  authorName: string | null;
  authorAvatarRef: string | null;
  /** AT-URI this comment replies to: the subject for a top-level comment, or
   *  another comment's URI for a threaded reply. Null when unknown. */
  parentUri: string | null;
  /** Accounts @-mentioned in the text (from the record's facets), for
   *  linkified rendering and for seeding the edit composer. */
  mentions: MentionCandidate[];
};

/** A comment plus its nested replies, built from a flat thread by parent link. */
export type CommentTreeNode = {
  comment: FeedComment;
  replies: CommentTreeNode[];
};

/**
 * Nest a subject's flat comment thread into a reply tree. Top-level comments
 * (whose `parentUri` is the subject itself, or whose parent isn't in the thread)
 * become roots; everything else hangs off the comment it replies to. Roots and
 * replies are each ordered oldest-first so a thread reads top to bottom.
 */
export function buildCommentTree(comments: FeedComment[], subjectUri: string): CommentTreeNode[] {
  const byUri = new Map<string, CommentTreeNode>();
  for (const comment of comments) byUri.set(comment.uri, { comment, replies: [] });

  const roots: CommentTreeNode[] = [];
  for (const node of byUri.values()) {
    const parent = node.comment.parentUri;
    const parentNode = parent && parent !== subjectUri ? byUri.get(parent) : undefined;
    if (parentNode) parentNode.replies.push(node);
    else roots.push(node);
  }

  const byCreated = (a: CommentTreeNode, b: CommentTreeNode) =>
    (a.comment.createdAt ?? "").localeCompare(b.comment.createdAt ?? "");
  const sortDeep = (nodes: CommentTreeNode[]) => {
    nodes.sort(byCreated);
    for (const n of nodes) sortDeep(n.replies);
  };
  sortDeep(roots);
  return roots;
}

/** One account that liked a subject, for the "who liked this" hover. */
export type Liker = {
  did: string;
  name: string | null;
  avatarRef: string | null;
};

export function emptyEngagement(): Engagement {
  return { likeCount: 0, commentCount: 0, viewerLikeUri: null };
}

const CHUNK = 100; // indexer `in` filter cap
const SCAN_CAP = 1000; // records scanned per chunk to derive counts

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const CERTIFIED_PROFILE_DATA_FIELDS = `
  certifiedProfileData {
    displayName
    avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
  }
`;

/** Facet selection for mention rendering (see app/_lib/mentions.ts). */
export const FACET_FIELDS = `
  facets {
    index { byteStart byteEnd }
    features { __typename ... on AppBskyRichtextFacetMention { did } }
  }
`;

const LIKES_BY_SUBJECT_QUERY = `
  query FeedLikesBySubject($uris: [String!]!) {
    appGainforestFeedLike(first: ${SCAN_CAP}, where: { subject: { uri: { in: $uris } } }) {
      edges { node { uri did subject { uri } } }
    }
  }
`;

// Count by thread root, so a subject's count includes both its top-level
// comments and every nested reply (all of which carry `reply.root == subject`).
const COMMENT_COUNTS_QUERY = `
  query FeedCommentCounts($uris: [String!]!) {
    appGainforestFeedPost(first: ${SCAN_CAP}, where: { reply: { root: { uri: { in: $uris } } } }) {
      edges { node { reply { root { uri } } } }
    }
  }
`;

type LikeNode = { uri?: string | null; did?: string | null; subject?: { uri?: string | null } | null };
type CommentCountNode = { reply?: { root?: { uri?: string | null } | null } | null };

/**
 * Batch-fetch engagement for a set of subject AT-URIs. Returns a map covering
 * every requested uri (zeroed when there's no activity yet).
 */
export async function fetchEngagement(
  uris: string[],
  viewerDid: string | null,
  signal?: AbortSignal,
): Promise<Map<string, Engagement>> {
  const out = new Map<string, Engagement>();
  const unique = [...new Set(uris.filter((u) => u && u.startsWith("at://")))];
  for (const u of unique) out.set(u, emptyEngagement());
  if (unique.length === 0) return out;

  await Promise.all(
    chunk(unique, CHUNK).map(async (uriChunk) => {
      const [likeData, commentData] = await Promise.all([
        indexerQuery<{ appGainforestFeedLike?: { edges?: Array<{ node?: LikeNode | null } | null> | null } | null }>(
          LIKES_BY_SUBJECT_QUERY,
          { uris: uriChunk },
          signal,
        ).catch(() => null),
        indexerQuery<{ appGainforestFeedPost?: { edges?: Array<{ node?: CommentCountNode | null } | null> | null } | null }>(
          COMMENT_COUNTS_QUERY,
          { uris: uriChunk },
          signal,
        ).catch(() => null),
      ]);

      for (const edge of likeData?.appGainforestFeedLike?.edges ?? []) {
        const node = edge?.node;
        const subjectUri = node?.subject?.uri;
        if (!subjectUri) continue;
        const e = out.get(subjectUri);
        if (!e) continue;
        e.likeCount += 1;
        if (viewerDid && node?.did === viewerDid && node.uri) e.viewerLikeUri = node.uri;
      }

      for (const edge of commentData?.appGainforestFeedPost?.edges ?? []) {
        const rootUri = edge?.node?.reply?.root?.uri;
        if (!rootUri) continue;
        const e = out.get(rootUri);
        if (e) e.commentCount += 1;
      }
    }),
  );

  return out;
}

// Pull the whole thread for a subject in one query by matching the reply root
// (which every comment and nested reply on the subject shares), then carry each
// node's parent uri so the client can nest replies under what they answer.
const COMMENTS_FOR_SUBJECT_QUERY = `
  query FeedCommentsForSubject($uri: String!) {
    appGainforestFeedPost(first: 200, where: { reply: { root: { uri: { eq: $uri } } } }) {
      edges {
        node {
          uri did text createdAt
          reply { parent { uri } }
          ${FACET_FIELDS}
          ${CERTIFIED_PROFILE_DATA_FIELDS}
        }
      }
    }
  }
`;

type CommentNode = {
  uri?: string | null;
  did?: string | null;
  text?: string | null;
  createdAt?: string | null;
  reply?: { parent?: { uri?: string | null } | null } | null;
  facets?: RawIndexedFacet[] | null;
  certifiedProfileData?: {
    displayName?: string | null;
    avatar?: { image?: { ref?: string | null } | null } | null;
  } | null;
};

const LIKERS_FOR_SUBJECT_QUERY = `
  query FeedLikersForSubject($uri: String!) {
    appGainforestFeedLike(first: 100, where: { subject: { uri: { eq: $uri } } }) {
      edges {
        node {
          did
          ${CERTIFIED_PROFILE_DATA_FIELDS}
        }
      }
    }
  }
`;

type LikerNode = {
  did?: string | null;
  certifiedProfileData?: {
    displayName?: string | null;
    avatar?: { image?: { ref?: string | null } | null } | null;
  } | null;
};

/** Fetch the accounts that liked one subject (newest indexer order), de-duped
 *  by DID, for the like-button hover card. */
export async function fetchLikers(uri: string, signal?: AbortSignal): Promise<Liker[]> {
  const data = await indexerQuery<{
    appGainforestFeedLike?: { edges?: Array<{ node?: LikerNode | null } | null> | null } | null;
  }>(LIKERS_FOR_SUBJECT_QUERY, { uri }, signal).catch(() => null);

  const seen = new Set<string>();
  const likers: Liker[] = [];
  for (const edge of data?.appGainforestFeedLike?.edges ?? []) {
    const node = edge?.node;
    if (!node?.did || seen.has(node.did)) continue;
    seen.add(node.did);
    likers.push({
      did: node.did,
      name: node.certifiedProfileData?.displayName?.trim() || null,
      avatarRef: normaliseRef(node.certifiedProfileData?.avatar?.image?.ref),
    });
  }
  return likers;
}

/** Fetch the full comment thread (reply-posts) for one subject, oldest-first. */
export async function fetchComments(uri: string, signal?: AbortSignal): Promise<FeedComment[]> {
  const data = await indexerQuery<{
    appGainforestFeedPost?: { edges?: Array<{ node?: CommentNode | null } | null> | null } | null;
  }>(COMMENTS_FOR_SUBJECT_QUERY, { uri }, signal).catch(() => null);

  const comments: FeedComment[] = [];
  for (const edge of data?.appGainforestFeedPost?.edges ?? []) {
    const node = edge?.node;
    if (!node?.uri || !node.did || !node.text) continue;
    comments.push({
      uri: node.uri,
      did: node.did,
      text: node.text,
      createdAt: node.createdAt ?? null,
      authorName: node.certifiedProfileData?.displayName?.trim() || null,
      authorAvatarRef: normaliseRef(node.certifiedProfileData?.avatar?.image?.ref),
      parentUri: node.reply?.parent?.uri ?? null,
      mentions: mentionCandidatesFromFacets(node.text, node.facets),
    });
  }
  comments.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  return comments;
}
