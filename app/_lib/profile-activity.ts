"use client";

/**
 * Per-account activity reads over the GainForest feed lexicons, for the profile
 * Posts / Replies / Likes views.
 *
 *   - Posts   : app.gainforest.feed.post by the account with no `reply`
 *   - Replies : app.gainforest.feed.post by the account that carry a `reply`
 *   - Likes   : app.gainforest.feed.like by the account (the subjects they liked)
 *
 * Each fetcher pages newest-first with the indexer's `(createdAt, id)` cursor.
 */

import { indexerQuery } from "./indexer";
import {
  accountHref,
  localBumicertHref,
  localObservationHref,
  localProjectHref,
} from "./urls";

export type ProfilePost = {
  /** AT-URI of the post / reply record. */
  uri: string;
  text: string;
  createdAt: string | null;
  /** For replies: the AT-URI of the record being replied to. */
  parentUri: string | null;
};

export type ProfileLike = {
  /** AT-URI of the like record. */
  uri: string;
  /** AT-URI of the record that was liked. */
  subjectUri: string;
  createdAt: string | null;
};

type PageInfo = { hasNextPage?: boolean | null; endCursor?: string | null };

const POSTS_QUERY = `
  query ProfilePosts($did: String!, $first: Int!, $after: String) {
    appGainforestFeedPost(
      first: $first
      after: $after
      where: { did: { eq: $did }, reply: { isNull: true } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { uri text createdAt } }
    }
  }
`;

const REPLIES_QUERY = `
  query ProfileReplies($did: String!, $first: Int!, $after: String) {
    appGainforestFeedPost(
      first: $first
      after: $after
      where: { did: { eq: $did }, reply: { isNull: false } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { uri text createdAt reply { parent { uri } } } }
    }
  }
`;

const LIKES_QUERY = `
  query ProfileLikes($did: String!, $first: Int!, $after: String) {
    appGainforestFeedLike(
      first: $first
      after: $after
      where: { did: { eq: $did } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { uri createdAt subject { uri } } }
    }
  }
`;

type PostNode = {
  uri?: string | null;
  text?: string | null;
  createdAt?: string | null;
  reply?: { parent?: { uri?: string | null } | null } | null;
};

type LikeNode = {
  uri?: string | null;
  createdAt?: string | null;
  subject?: { uri?: string | null } | null;
};

function nextCursorOf(pageInfo: PageInfo | null | undefined): string | null {
  return pageInfo?.hasNextPage ? pageInfo.endCursor ?? null : null;
}

/** One page of an account's posts (`replies: false`) or replies (`true`). */
export async function fetchProfilePosts(
  did: string,
  replies: boolean,
  options: { cursor?: string | null; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ items: ProfilePost[]; nextCursor: string | null }> {
  const data = await indexerQuery<{
    appGainforestFeedPost?: { pageInfo?: PageInfo | null; edges?: Array<{ node?: PostNode | null } | null> | null } | null;
  }>(
    replies ? REPLIES_QUERY : POSTS_QUERY,
    { did, first: options.limit ?? 24, after: options.cursor ?? null },
    signal,
  ).catch(() => null);

  const conn = data?.appGainforestFeedPost;
  const items: ProfilePost[] = [];
  for (const edge of conn?.edges ?? []) {
    const node = edge?.node;
    if (!node?.uri || !node.text) continue;
    items.push({
      uri: node.uri,
      text: node.text,
      createdAt: node.createdAt ?? null,
      parentUri: node.reply?.parent?.uri ?? null,
    });
  }
  return { items, nextCursor: nextCursorOf(conn?.pageInfo) };
}

/** One page of an account's likes (the records they liked). */
export async function fetchProfileLikes(
  did: string,
  options: { cursor?: string | null; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ items: ProfileLike[]; nextCursor: string | null }> {
  const data = await indexerQuery<{
    appGainforestFeedLike?: { pageInfo?: PageInfo | null; edges?: Array<{ node?: LikeNode | null } | null> | null } | null;
  }>(LIKES_QUERY, { did, first: options.limit ?? 24, after: options.cursor ?? null }, signal).catch(() => null);

  const conn = data?.appGainforestFeedLike;
  const items: ProfileLike[] = [];
  for (const edge of conn?.edges ?? []) {
    const node = edge?.node;
    if (!node?.uri || !node.subject?.uri) continue;
    items.push({ uri: node.uri, subjectUri: node.subject.uri, createdAt: node.createdAt ?? null });
  }
  return { items, nextCursor: nextCursorOf(conn?.pageInfo) };
}

export type RecordKind = "project" | "observation" | "cert" | "post" | "account" | "record";

/** Classify any AT-URI into a display kind + owner DID + in-app link, used to
 *  render what a reply targets or a like points at without resolving content. */
export function classifyRecordUri(uri: string): { kind: RecordKind; did: string; href: string } | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, did, collection, rkey] = match;
  switch (collection) {
    case "org.hypercerts.collection":
      return { kind: "project", did, href: localProjectHref(did, rkey) };
    case "app.gainforest.dwc.occurrence":
      return { kind: "observation", did, href: localObservationHref(did, rkey) };
    case "org.hypercerts.claim.activity":
      return { kind: "cert", did, href: localBumicertHref(did, rkey) };
    case "app.gainforest.feed.post":
      return { kind: "post", did, href: accountHref(did) };
    case "app.certified.actor.organization":
    case "app.certified.actor.profile":
      return { kind: "account", did, href: accountHref(did) };
    default:
      return { kind: "record", did, href: accountHref(did) };
  }
}
