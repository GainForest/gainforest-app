/**
 * Notifications data layer — "who liked, commented on, or mentioned me".
 *
 * Everything here is derived from public engagement records on the GainForest
 * hyperindex; nothing is stored server-side. Three sources:
 *
 *   1. Likes — `app.gainforest.feed.like` (subject is a strongRef).
 *   2. Comments — `app.gainforest.feed.post` reply-posts (a post carrying
 *      `reply.parent`, the Bluesky model). See lexicons/README.md.
 *   3. Mentions — `app.gainforest.feed.post` records (top-level or reply)
 *      whose `facets` carry an app.bsky.richtext.facet#mention of the viewer's
 *      DID (see app/_lib/mentions.ts).
 *
 * The owner DID is embedded in every subject AT-URI, so we scan the most-recent
 * engagement records and keep the ones whose subject belongs to the viewer,
 * dropping the viewer's own likes/comments (you aren't notified about yourself).
 * Mentions are matched by the tagged DID instead, so anyone tagging the viewer
 * anywhere notifies them — the indexer can't filter by mention DID, so we scan
 * the recent posts that have facets at all and match client-side.
 *
 * The only per-user mutable state is a "seen" timestamp stored as
 * `app.gainforest.notification.seen` (rkey "self") on the viewer's PDS, read
 * here directly from the PDS (public, CORS-open getRecord) so a brand-new
 * collection doesn't need indexer support.
 *
 * Scale note: the hyperindex can only filter a strongRef subject by exact
 * uri (`eq`/`in`), not by DID prefix, so we fetch a recent window of likes /
 * comments and filter client-side. That's fine at the current volume. If global
 * engagement grows large, switch to enumerating the viewer's record URIs and
 * querying `subject.uri.in` instead.
 */

import { indexerQuery } from "./indexer";
import { mentionDidsOfFacets, type RawIndexedFacet } from "./mentions";
import { localBumicertHref, localObservationHref } from "./urls";
import { normaliseRef, parseAtUri, resolvePdsHost } from "./pds";
import { parseSpeciesSuggestion } from "./species-suggestions";

/** Singleton record (rkey "self") holding the viewer's last-seen timestamp. */
export const NOTIFICATION_SEEN_COLLECTION = "app.gainforest.notification.seen";

/** Recent likes/comments scanned per source before client-side filtering. */
const SCAN_LIMIT = 500;

type NotificationKind = "like" | "comment" | "mention" | "identification";

/** Plain-language category of the liked/commented record, for display + links. */
type NotificationSubjectKind = "observation" | "project" | "post" | "recording" | "record";

export type NotificationItem = {
  /** Stable id (the engagement record's AT-URI). */
  id: string;
  kind: NotificationKind;
  createdAt: string;
  /** The account that liked/commented. */
  actorDid: string;
  actorName: string | null;
  actorAvatarRef: string | null;
  /** AT-URI of the viewer's record that was engaged with. */
  subjectUri: string;
  subjectKind: NotificationSubjectKind;
  /** In-app link to the subject record, when one exists. */
  subjectHref: string | null;
  /** Comment/post body (kind === "comment" or "mention" only). */
  text: string | null;
};

// ── Indexer queries ─────────────────────────────────────────────────────────

const CERTIFIED_PROFILE_DATA_FIELDS = `
  certifiedProfileData {
    displayName
    avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
  }
`;

const LIKES_QUERY = `
  query NotificationLikes($first: Int!) {
    appGainforestFeedLike(first: $first, sortBy: createdAt, sortDirection: DESC) {
      edges {
        node {
          uri did createdAt
          subject { uri }
          ${CERTIFIED_PROFILE_DATA_FIELDS}
        }
      }
    }
  }
`;

const COMMENTS_QUERY = `
  query NotificationComments($first: Int!) {
    appGainforestFeedPost(
      first: $first
      sortBy: createdAt
      sortDirection: DESC
      where: { reply: { parent: { uri: { isNull: false } } } }
    ) {
      edges {
        node {
          uri did text createdAt
          reply { parent { uri } }
          ${CERTIFIED_PROFILE_DATA_FIELDS}
        }
      }
    }
  }
`;

type CertifiedProfileData = {
  displayName?: string | null;
  avatar?: { image?: { ref?: string | null } | null } | null;
} | null;

type LikeNode = {
  uri?: string | null;
  did?: string | null;
  createdAt?: string | null;
  subject?: { uri?: string | null } | null;
  certifiedProfileData?: CertifiedProfileData;
};

type CommentNode = {
  uri?: string | null;
  did?: string | null;
  text?: string | null;
  createdAt?: string | null;
  reply?: { parent?: { uri?: string | null } | null } | null;
  certifiedProfileData?: CertifiedProfileData;
};

// Posts (top-level or reply) that carry facets at all — the candidates for
// "you were mentioned". The mention match itself happens client-side.
const MENTIONS_QUERY = `
  query NotificationMentions($first: Int!) {
    appGainforestFeedPost(
      first: $first
      sortBy: createdAt
      sortDirection: DESC
      where: { facets: { isNull: false } }
    ) {
      edges {
        node {
          uri did text createdAt
          reply { root { uri } }
          facets {
            index { byteStart byteEnd }
            features { __typename ... on AppBskyRichtextFacetMention { did } }
          }
          ${CERTIFIED_PROFILE_DATA_FIELDS}
        }
      }
    }
  }
`;

type MentionNode = {
  uri?: string | null;
  did?: string | null;
  text?: string | null;
  createdAt?: string | null;
  reply?: { root?: { uri?: string | null } | null } | null;
  facets?: RawIndexedFacet[] | null;
  certifiedProfileData?: CertifiedProfileData;
};

// ── Subject helpers ─────────────────────────────────────────────────────────

/** Map a subject's collection NSID to a plain-language category. */
function subjectKindForCollection(collection: string): NotificationSubjectKind {
  switch (collection) {
    case "app.gainforest.dwc.occurrence":
      return "observation";
    case "org.hypercerts.claim.activity":
      return "project";
    case "app.gainforest.feed.post":
      return "post";
    case "app.gainforest.ac.audio":
      return "recording";
    default:
      return "record";
  }
}

/** In-app link to a subject record, or null when it has no dedicated surface. */
function subjectHrefFor(kind: NotificationSubjectKind, did: string, rkey: string): string | null {
  switch (kind) {
    case "observation":
    case "recording":
      return localObservationHref(did, rkey);
    case "project":
      return localBumicertHref(did, rkey);
    case "post":
      return "/feed";
    default:
      return null;
  }
}

function actorName(profile: CertifiedProfileData | undefined): string | null {
  return profile?.displayName?.trim() || null;
}

function actorAvatarRef(profile: CertifiedProfileData | undefined): string | null {
  return normaliseRef(profile?.avatar?.image?.ref);
}

// ── Public API ──────────────────────────────────────────────────────────────

export type NotificationsResult = {
  items: NotificationItem[];
  unreadCount: number;
};

/**
 * Fetch notifications for `did`: every like or comment another account made on
 * one of the viewer's records, newest first. `seenAt` (the viewer's last-seen
 * timestamp) is used to compute `unreadCount` over the full set before slicing.
 */
export async function fetchNotificationsForDid(
  did: string,
  opts: { limit?: number; seenAt?: string | null } = {},
): Promise<NotificationsResult> {
  const limit = opts.limit ?? 30;
  const seenAt = opts.seenAt ?? null;

  const [likeData, commentData, mentionData] = await Promise.all([
    indexerQuery<{ appGainforestFeedLike?: { edges?: Array<{ node?: LikeNode | null } | null> | null } | null }>(
      LIKES_QUERY,
      { first: SCAN_LIMIT },
    ).catch(() => null),
    indexerQuery<{ appGainforestFeedPost?: { edges?: Array<{ node?: CommentNode | null } | null> | null } | null }>(
      COMMENTS_QUERY,
      { first: SCAN_LIMIT },
    ).catch(() => null),
    indexerQuery<{ appGainforestFeedPost?: { edges?: Array<{ node?: MentionNode | null } | null> | null } | null }>(
      MENTIONS_QUERY,
      { first: SCAN_LIMIT },
    ).catch(() => null),
  ]);

  const items: NotificationItem[] = [];
  // Post URIs that already produced a comment notification — a comment on your
  // record that ALSO tags you shouldn't notify twice for the same action.
  const notifiedPostUris = new Set<string>();

  for (const edge of likeData?.appGainforestFeedLike?.edges ?? []) {
    const node = edge?.node;
    const subjectUri = node?.subject?.uri;
    if (!node?.uri || !node.did || !subjectUri) continue;
    const parts = parseAtUri(subjectUri);
    if (!parts || parts.did !== did) continue; // not your record
    if (node.did === did) continue; // your own like
    const subjectKind = subjectKindForCollection(parts.collection);
    items.push({
      id: node.uri,
      kind: "like",
      createdAt: node.createdAt || new Date(0).toISOString(),
      actorDid: node.did,
      actorName: actorName(node.certifiedProfileData),
      actorAvatarRef: actorAvatarRef(node.certifiedProfileData),
      subjectUri,
      subjectKind,
      subjectHref: subjectHrefFor(subjectKind, parts.did, parts.rkey),
      text: null,
    });
  }

  for (const edge of commentData?.appGainforestFeedPost?.edges ?? []) {
    const node = edge?.node;
    const subjectUri = node?.reply?.parent?.uri;
    if (!node?.uri || !node.did || !subjectUri) continue;
    const parts = parseAtUri(subjectUri);
    if (!parts || parts.did !== did) continue;
    if (node.did === did) continue;
    notifiedPostUris.add(node.uri);
    const subjectKind = subjectKindForCollection(parts.collection);
    const identification = parseSpeciesSuggestion(node.text);
    items.push({
      id: node.uri,
      kind: identification ? "identification" : "comment",
      createdAt: node.createdAt || new Date(0).toISOString(),
      actorDid: node.did,
      actorName: actorName(node.certifiedProfileData),
      actorAvatarRef: actorAvatarRef(node.certifiedProfileData),
      subjectUri,
      subjectKind,
      subjectHref: subjectHrefFor(subjectKind, parts.did, parts.rkey),
      text: identification?.scientificName ?? node.text?.trim() ?? null,
    });
  }

  for (const edge of mentionData?.appGainforestFeedPost?.edges ?? []) {
    const node = edge?.node;
    if (!node?.uri || !node.did) continue;
    if (node.did === did) continue; // tagging yourself isn't news
    if (notifiedPostUris.has(node.uri)) continue; // already notified as a comment
    if (!mentionDidsOfFacets(node.facets).includes(did)) continue;
    // Link to where the conversation lives: the thread's root record when the
    // mention sits in a comment, otherwise the feed (a top-level post).
    const rootUri = node.reply?.root?.uri ?? null;
    const rootParts = rootUri ? parseAtUri(rootUri) : null;
    const subjectKind = rootParts ? subjectKindForCollection(rootParts.collection) : "post";
    items.push({
      id: `${node.uri}#mention`,
      kind: "mention",
      createdAt: node.createdAt || new Date(0).toISOString(),
      actorDid: node.did,
      actorName: actorName(node.certifiedProfileData),
      actorAvatarRef: actorAvatarRef(node.certifiedProfileData),
      subjectUri: node.uri,
      subjectKind,
      subjectHref: rootParts
        ? subjectHrefFor(subjectKind, rootParts.did, rootParts.rkey)
        : "/feed",
      text: node.text?.trim() || null,
    });
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const unreadCount = seenAt
    ? items.filter((item) => item.createdAt > seenAt).length
    : items.length;

  return { items: items.slice(0, limit), unreadCount };
}

/**
 * Read the viewer's last-seen timestamp from the
 * `app.gainforest.notification.seen` record (rkey "self") on their PDS. Returns
 * null when the record doesn't exist yet (the viewer has never opened the
 * notifications panel), which makes every existing notification count as unread.
 */
export async function fetchNotificationSeenAt(did: string): Promise<string | null> {
  try {
    const host = await resolvePdsHost(did);
    if (!host) return null;
    const params = new URLSearchParams({
      repo: did,
      collection: NOTIFICATION_SEEN_COLLECTION,
      rkey: "self",
    });
    const res = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { value?: { seenAt?: unknown } } | null;
    const seenAt = json?.value?.seenAt;
    return typeof seenAt === "string" ? seenAt : null;
  } catch {
    return null;
  }
}
