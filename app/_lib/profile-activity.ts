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
import { normaliseRef } from "./pds";
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

// ── Record previews (what a reply targets / a like points at) ──────────────

export type RecordPreview = {
  kind: RecordKind;
  did: string;
  href: string;
  /** Headline (project title, species name); null for plain posts. */
  title: string | null;
  /** Body snippet (short description, post text, locality). */
  text: string | null;
  ownerName: string | null;
  /** Direct image URL for a thumbnail, when available. */
  imageUrl: string | null;
  /** PDS blob ref for a thumbnail; resolved client-side with `did`. */
  imageRef: string | null;
};

const PROFILE_FRAGMENT = `
  certifiedProfileData {
    displayName
    avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
  }
`;

const PROJECT_PREVIEW_FIELDS = `
  uri did title shortDescription
  ${PROFILE_FRAGMENT}
  banner { __typename ... on OrgHypercertsDefsUri { uri } ... on OrgHypercertsDefsLargeImage { image { ref } } }
  avatar { __typename ... on OrgHypercertsDefsUri { uri } ... on OrgHypercertsDefsSmallImage { image { ref } } }
`;

const OBSERVATION_PREVIEW_FIELDS = `
  uri did scientificName vernacularName locality country
  thumbnailUrl speciesImageUrl
  ${PROFILE_FRAGMENT}
  imageEvidence { file { ref } }
`;

const POST_PREVIEW_FIELDS = `uri did text ${PROFILE_FRAGMENT}`;

const PROJECT_PREVIEW_QUERY = `
  query ProjectPreview($uri: String!) {
    orgHypercertsCollection(first: 1, where: { uri: { eq: $uri } }) {
      edges { node { ${PROJECT_PREVIEW_FIELDS} } }
    }
  }
`;

const OBSERVATION_PREVIEW_QUERY = `
  query ObservationPreview($uri: String!) {
    appGainforestDwcOccurrence(first: 1, where: { uri: { eq: $uri } }) {
      edges { node { ${OBSERVATION_PREVIEW_FIELDS} } }
    }
  }
`;

const POST_PREVIEW_QUERY = `
  query PostPreview($uri: String!) {
    appGainforestFeedPost(first: 1, where: { uri: { eq: $uri } }) {
      edges { node { ${POST_PREVIEW_FIELDS} } }
    }
  }
`;

type ProfileJoin = { displayName?: string | null } | null;
type ImageUnion =
  | { __typename: "OrgHypercertsDefsUri"; uri?: string | null }
  | { __typename: "OrgHypercertsDefsSmallImage"; image?: { ref?: string | null } | null }
  | { __typename: "OrgHypercertsDefsLargeImage"; image?: { ref?: string | null } | null }
  | null;

function ownerNameOf(profile: ProfileJoin): string | null {
  return profile?.displayName?.trim() || null;
}

function imageOf(image: ImageUnion): { url: string | null; ref: string | null } {
  if (image?.__typename === "OrgHypercertsDefsUri") return { url: image.uri?.trim() || null, ref: null };
  if (image?.__typename === "OrgHypercertsDefsSmallImage" || image?.__typename === "OrgHypercertsDefsLargeImage") {
    return { url: null, ref: normaliseRef(image.image?.ref) };
  }
  return { url: null, ref: null };
}

function clamp(text: string | null | undefined, max = 200): string | null {
  const trimmed = text?.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}\u2026` : trimmed;
}

type ProjectPreviewNode = { uri?: string | null; did?: string; title?: string | null; shortDescription?: string | null; certifiedProfileData?: ProfileJoin; banner?: ImageUnion; avatar?: ImageUnion };
type ObservationPreviewNode = { uri?: string | null; did?: string; scientificName?: string | null; vernacularName?: string | null; locality?: string | null; country?: string | null; thumbnailUrl?: string | null; speciesImageUrl?: string | null; certifiedProfileData?: ProfileJoin; imageEvidence?: { file?: { ref?: string | null } | null } | null };
type PostPreviewNode = { uri?: string | null; did?: string; text?: string | null; certifiedProfileData?: ProfileJoin };

function projectPreviewFromNode(node: ProjectPreviewNode, href: string, fallbackDid: string): RecordPreview {
  const banner = imageOf(node.banner ?? null);
  const avatar = imageOf(node.avatar ?? null);
  return {
    kind: "project", did: node.did ?? fallbackDid, href,
    title: node.title?.trim() || null, text: clamp(node.shortDescription),
    ownerName: ownerNameOf(node.certifiedProfileData ?? null),
    imageUrl: banner.url ?? avatar.url, imageRef: banner.ref ?? avatar.ref,
  };
}

function observationPreviewFromNode(node: ObservationPreviewNode, href: string, fallbackDid: string): RecordPreview {
  const where = [node.locality?.trim(), node.country?.trim()].filter(Boolean).join(" \u00b7 ") || null;
  return {
    kind: "observation", did: node.did ?? fallbackDid, href,
    title: node.vernacularName?.trim() || node.scientificName?.trim() || null,
    text: clamp(where), ownerName: ownerNameOf(node.certifiedProfileData ?? null),
    imageUrl: node.thumbnailUrl?.trim() || node.speciesImageUrl?.trim() || null,
    imageRef: normaliseRef(node.imageEvidence?.file?.ref),
  };
}

function postPreviewFromNode(node: PostPreviewNode, href: string, fallbackDid: string): RecordPreview {
  return {
    kind: "post", did: node.did ?? fallbackDid, href,
    title: null, text: clamp(node.text, 240),
    ownerName: ownerNameOf(node.certifiedProfileData ?? null), imageUrl: null, imageRef: null,
  };
}

const previewCache = new Map<string, RecordPreview | null>();

/**
 * Resolve a compact preview (title / text / owner / thumbnail) for a record
 * AT-URI — used to show the exact thing a reply targets or a like points at.
 * Handles projects, observations and feed posts; other kinds resolve to null so
 * the caller can fall back to a plain owner + link row. Results are memoized.
 */
export async function fetchRecordPreview(uri: string, signal?: AbortSignal): Promise<RecordPreview | null> {
  if (previewCache.has(uri)) return previewCache.get(uri) ?? null;
  const base = classifyRecordUri(uri);
  if (!base) return null;

  let preview: RecordPreview | null = null;
  try {
    if (base.kind === "project") {
      const data = await indexerQuery<{ orgHypercertsCollection?: { edges?: Array<{ node?: ProjectPreviewNode | null } | null> | null } | null }>(
        PROJECT_PREVIEW_QUERY, { uri }, signal,
      );
      const node = data?.orgHypercertsCollection?.edges?.[0]?.node ?? undefined;
      if (node) preview = projectPreviewFromNode(node, base.href, base.did);
    } else if (base.kind === "observation") {
      const data = await indexerQuery<{ appGainforestDwcOccurrence?: { edges?: Array<{ node?: ObservationPreviewNode | null } | null> | null } | null }>(
        OBSERVATION_PREVIEW_QUERY, { uri }, signal,
      );
      const node = data?.appGainforestDwcOccurrence?.edges?.[0]?.node ?? undefined;
      if (node) preview = observationPreviewFromNode(node, base.href, base.did);
    } else if (base.kind === "post") {
      const data = await indexerQuery<{ appGainforestFeedPost?: { edges?: Array<{ node?: PostPreviewNode | null } | null> | null } | null }>(
        POST_PREVIEW_QUERY, { uri }, signal,
      );
      const node = data?.appGainforestFeedPost?.edges?.[0]?.node ?? undefined;
      if (node) preview = postPreviewFromNode(node, base.href, base.did);
    }
  } catch {
    preview = null;
  }

  previewCache.set(uri, preview);
  return preview;
}

/**
 * Batch variant of {@link fetchRecordPreview}: resolves many record AT-URIs in a
 * handful of indexer round-trips (one per kind, using a `uri IN (…)` filter)
 * instead of one query per record. This is what the Replies / Likes lists use so
 * a page of 24 cards costs ~3 queries rather than 24. Cached results are reused,
 * and unresolved/missing records map to `null` so the caller renders the plain
 * owner + link fallback.
 */
export async function fetchRecordPreviews(
  uris: string[],
  signal?: AbortSignal,
): Promise<Map<string, RecordPreview | null>> {
  const result = new Map<string, RecordPreview | null>();
  const projectUris: string[] = [];
  const observationUris: string[] = [];
  const postUris: string[] = [];
  const baseByUri = new Map<string, { kind: RecordKind; did: string; href: string }>();

  for (const uri of new Set(uris)) {
    if (previewCache.has(uri)) {
      result.set(uri, previewCache.get(uri) ?? null);
      continue;
    }
    const base = classifyRecordUri(uri);
    if (!base) {
      result.set(uri, null);
      continue;
    }
    baseByUri.set(uri, base);
    if (base.kind === "project") projectUris.push(uri);
    else if (base.kind === "observation") observationUris.push(uri);
    else if (base.kind === "post") postUris.push(uri);
    else {
      // Kinds we don't resolve (certs, accounts) get the owner+link fallback.
      result.set(uri, null);
      previewCache.set(uri, null);
    }
  }

  async function resolveBatch(
    batchUris: string[],
    run: (batchUris: string[]) => Promise<Map<string, RecordPreview>>,
  ) {
    if (batchUris.length === 0) return;
    try {
      const previews = await run(batchUris);
      for (const uri of batchUris) {
        const preview = previews.get(uri) ?? null;
        result.set(uri, preview);
        previewCache.set(uri, preview);
      }
    } catch {
      // Leave these uncached so a later page can retry; render fallback for now.
      for (const uri of batchUris) result.set(uri, null);
    }
  }

  await Promise.all([
    resolveBatch(projectUris, async (batchUris) => {
      const query = `query ProjectPreviews { orgHypercertsCollection(first: ${batchUris.length}, where: { uri: { in: ${JSON.stringify(batchUris)} } }) { edges { node { ${PROJECT_PREVIEW_FIELDS} } } } }`;
      const data = await indexerQuery<{ orgHypercertsCollection?: { edges?: Array<{ node?: ProjectPreviewNode | null } | null> | null } | null }>(query, {}, signal);
      const previews = new Map<string, RecordPreview>();
      for (const edge of data?.orgHypercertsCollection?.edges ?? []) {
        const node = edge?.node;
        const base = node?.uri ? baseByUri.get(node.uri) : undefined;
        if (node?.uri && base) previews.set(node.uri, projectPreviewFromNode(node, base.href, base.did));
      }
      return previews;
    }),
    resolveBatch(observationUris, async (batchUris) => {
      const query = `query ObservationPreviews { appGainforestDwcOccurrence(first: ${batchUris.length}, where: { uri: { in: ${JSON.stringify(batchUris)} } }) { edges { node { ${OBSERVATION_PREVIEW_FIELDS} } } } }`;
      const data = await indexerQuery<{ appGainforestDwcOccurrence?: { edges?: Array<{ node?: ObservationPreviewNode | null } | null> | null } | null }>(query, {}, signal);
      const previews = new Map<string, RecordPreview>();
      for (const edge of data?.appGainforestDwcOccurrence?.edges ?? []) {
        const node = edge?.node;
        const base = node?.uri ? baseByUri.get(node.uri) : undefined;
        if (node?.uri && base) previews.set(node.uri, observationPreviewFromNode(node, base.href, base.did));
      }
      return previews;
    }),
    resolveBatch(postUris, async (batchUris) => {
      const query = `query PostPreviews { appGainforestFeedPost(first: ${batchUris.length}, where: { uri: { in: ${JSON.stringify(batchUris)} } }) { edges { node { ${POST_PREVIEW_FIELDS} } } } }`;
      const data = await indexerQuery<{ appGainforestFeedPost?: { edges?: Array<{ node?: PostPreviewNode | null } | null> | null } | null }>(query, {}, signal);
      const previews = new Map<string, RecordPreview>();
      for (const edge of data?.appGainforestFeedPost?.edges ?? []) {
        const node = edge?.node;
        const base = node?.uri ? baseByUri.get(node.uri) : undefined;
        if (node?.uri && base) previews.set(node.uri, postPreviewFromNode(node, base.href, base.did));
      }
      return previews;
    }),
  ]);

  return result;
}
