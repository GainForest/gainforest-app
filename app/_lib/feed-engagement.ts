"use client";

/**
 * Feed engagement read layer — like + comment aggregates from the hyperindex,
 * keyed by the AT-URI of the record being engaged with.
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

const LIKES_BY_SUBJECT_QUERY = `
  query FeedLikesBySubject($uris: [String!]!) {
    appGainforestFeedLike(first: ${SCAN_CAP}, where: { subject: { uri: { in: $uris } } }) {
      edges { node { uri did subject { uri } } }
    }
  }
`;

const COMMENT_COUNTS_QUERY = `
  query FeedCommentCounts($uris: [String!]!) {
    appGainforestFeedPost(first: ${SCAN_CAP}, where: { reply: { parent: { uri: { in: $uris } } } }) {
      edges { node { reply { parent { uri } } } }
    }
  }
`;

type LikeNode = { uri?: string | null; did?: string | null; subject?: { uri?: string | null } | null };
type CommentCountNode = { reply?: { parent?: { uri?: string | null } | null } | null };

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
        const parentUri = edge?.node?.reply?.parent?.uri;
        if (!parentUri) continue;
        const e = out.get(parentUri);
        if (e) e.commentCount += 1;
      }
    }),
  );

  return out;
}

const COMMENTS_FOR_SUBJECT_QUERY = `
  query FeedCommentsForSubject($uri: String!) {
    appGainforestFeedPost(first: 200, where: { reply: { parent: { uri: { eq: $uri } } } }) {
      edges {
        node {
          uri did text createdAt
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
  certifiedProfileData?: {
    displayName?: string | null;
    avatar?: { image?: { ref?: string | null } | null } | null;
  } | null;
};

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
    });
  }
  comments.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  return comments;
}
