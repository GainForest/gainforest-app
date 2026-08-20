/**
 * Activity feed — server-side assembly of a global, Bluesky-style "everything
 * happening on GainForest" timeline for the new /feed sidebar tab.
 *
 * Merges the public record streams into one newest-first stream:
 *   - projects      (org.hypercerts.collection, type "project")
 *   - observations  (app.gainforest.dwc.occurrence)
 *   - organizations (app.certified.actor.organization)
 *   - donations     (org.hypercerts.fundingReceipt — completed USD/USDC gifts)
 *   - audio uploads (app.gainforest.ac.audio, grouped per folder per day —
 *                    one row per bout of uploading, project-attached or not)
 *
 * Certs (org.hypercerts.claim.activity) are deliberately folded into projects
 * rather than shown as their own rows — a project owns exactly one Cert and is
 * its canonical surface, matching the /certs → /projects merge elsewhere.
 *
 * Inspired by simocracy-v2's `lib/landing-feed.ts`, which merges proposals,
 * comments, decisions, actions, and sims into a single chronological feed.
 *
 * The feed is a TRUE newest-first merge across all kinds (no per-kind quota) —
 * each row is placed purely by its createdAt — and pages with a compound
 * `(createdAt, id)` cursor so "load more" walks strictly older items. Each
 * stream is queried with `createdAt <= cursor` and re-merged in memory, which
 * keeps global chronological order even when one stream is far denser than the
 * others (independent per-stream cursors would interleave out of order).
 */

import { accountAudioPath } from "@/app/account/_lib/account-route";
import { cachedAsync } from "./async-cache";
import { listAudioUploadDays, type AudioUploadDay } from "./audio-upload-days";
import type { AudioLabelCategory } from "./audiomoth/labels";
import { deploymentDetailPath } from "./deployment-events";
import { LEGACY_BROAD_VERNACULARS, parseAudioSegmentDynamicProperties } from "./audiomoth/occurrences";
import { getAddress } from "viem";
import { getTipWalletAddress } from "@/lib/facilitator/tip";
import { fetchPinnedPostUris } from "./feed-pins";
import { fetchAccountCards, fetchHiddenRecordUris, fetchPublicHiddenAccountDids, indexerQuery } from "./indexer";
import { mentionCandidatesFromFacets, type MentionCandidate, type RawIndexedFacet } from "./mentions";
import { normaliseRef } from "./pds";
import { FACILITATOR_DID, accountHref, localBumicertHref, localObservationHref, localProjectHref } from "./urls";

/** The kinds of activity a feed row represents.
 *
 *  Note: Certs (org.hypercerts.claim.activity) are intentionally NOT a feed
 *  kind. A project owns exactly one Cert and the project surface carries the
 *  full Cert experience, so — exactly like /certs → /projects and the cert
 *  detail page redirecting to its project — the feed shows Certs as Projects
 *  instead of as their own rows. */
export type ActivityFeedKind =
  | "project"
  | "observation"
  | "organization"
  | "donation"
  | "post"
  | "audio";

/** The labelled section of an AudioMoth recording a bioacoustic sighting
 *  points at — everything the feed needs to preview the spectrogram box and
 *  play that sound. Parsed from the occurrence's
 *  `dynamicProperties.gainforestBioacoustics` sidecar. */
export interface FeedBioacousticsClip {
  /** AT-URI of the source `app.gainforest.ac.audio` record. */
  audioUri: string;
  /** What the labeller heard (bird / frog / insect / other / note). */
  category: AudioLabelCategory;
  startTimeSeconds: number;
  endTimeSeconds: number;
  minFrequencyHz: number;
  maxFrequencyHz: number;
}

/** A bout of uploading — what one person put into one recorder folder on one
 *  day: how many recordings landed, what recorded them, and where to go and
 *  hear them. The same card the Audio explore page shows for an upload, drawn
 *  inside its feed row. */
export interface FeedAudioUpload {
  /** Recordings uploaded to this folder that day — an exact count, not the
   *  folder's running total. */
  recordingCount: number;
  /** The recorder / folder name ("INN2-004"), when the upload named one. */
  recorderName: string | null;
  /** Where the recordings live — the "browse recordings" target. */
  browseHref: string;
}

/** Normalized, serializable feed row — ready to ship to the client. */
export interface ActivityFeedItem {
  /** Stable unique id for React keys (record URI, possibly suffixed). */
  id: string;
  kind: ActivityFeedKind;
  /** ISO timestamp the row is ordered by (newest-first). */
  createdAt: string;
  /** Owner DID of the underlying record. */
  actorDid: string;
  /** Owner display name from the certified profile, when known. */
  actorName: string | null;
  /** PDS avatar blob ref for the owner; resolved client-side. */
  actorAvatarRef: string | null;
  /** Headline (project title, scientific name, cert title, org name, amount). */
  title: string | null;
  /** Body text (short description, habitat, donation summary). */
  text: string | null;
  /** Posts only: accounts @-mentioned in the text, for linkified rendering. */
  mentions?: MentionCandidate[];
  /** In-app detail link for the row. */
  href: string;
  /** Already-resolved external image URL (projects / observations). */
  imageUrl: string | null;
  /** PDS image blob ref; resolved client-side when present. */
  imageRef: string | null;
  /** For donations: the funded project's title, when resolved. */
  targetTitle: string | null;
  /** For donations: the funded project's in-app detail href. */
  targetHref: string | null;
  /** For donations: the raw amount. */
  amount: number | null;
  /** For donations: the currency code (USD/USDC). */
  currency: string | null;
  /** Observations only: shared event identifier for sightings uploaded together. */
  observationEventId?: string | null;
  /** Observations only: shared field note/story for a multi-sighting upload. */
  observationBatchNote?: string | null;
  /** Observations only: the labelled audio segment behind a bioacoustic
   *  sighting, so the feed can preview its spectrogram and play the sound. */
  bioacoustics?: FeedBioacousticsClip | null;
  /** Audio uploads only: the recorder folder this row announces. */
  audioUpload?: FeedAudioUpload | null;
  /** Observations only, set on the sampled rows of a server-collapsed burst:
   *  how many sightings the burst holds from the collapse point down (counted
   *  for free by the burst scan; includes the sampled rows themselves). Rows
   *  of the same run emitted raw on earlier pages are NOT included — the
   *  client adds those, so the summary card's headline is the full burst.
   *  Absent on fully loaded runs, where the row count itself is exact. */
  burstCount?: number;
  /** True when a GainForest steward pinned this post to the top of the feed.
   *  Only set on the first page of the global "all"/"post" feeds. */
  pinned?: boolean;
  /** Set when this row surfaces a record somebody reshared (Bluesky's
   *  `reasonRepost`): the row's content/actor describe the ORIGINAL record, the
   *  row is ordered by the reshare's createdAt, `id` is the repost record's
   *  AT-URI (unique per reshare), and this carries the resharer's identity plus
   *  the original subject's AT-URI — the target for likes/comments/reshares. */
  reshare?: {
    did: string;
    name: string | null;
    avatarRef: string | null;
    subjectUri: string;
  };
}

/** Which kinds the feed should include: a single kind, or the unified merge. */
export type ActivityFeedFilter = ActivityFeedKind | "all";

/** Restrict the feed to records authored by accounts the viewer follows
 *  (atproto-style query-on-read). `dids` is the followed-account set; `viewerDid`
 *  scopes the in-process cache so one viewer's following page can't be served to
 *  another. */
export interface FollowingScope {
  dids: string[];
  viewerDid: string;
}

export interface ActivityFeedPage {
  items: ActivityFeedItem[];
  /** Opaque cursor for the next page; null when the feed is exhausted. */
  nextCursor: string | null;
  /** Whether a "load more" request could yield further rows. */
  hasMore: boolean;
}

/** Rows returned to the client per page. */
const PAGE_SIZE = 50;
/** Items fetched per stream per page. Must be >= PAGE_SIZE so the merged
 *  top-PAGE_SIZE is globally correct, with a little margin for boundary
 *  duplicate-timestamp rows that get filtered out by the compound cursor. A
 *  larger page means fewer round-trips when walking long same-owner runs. */
const STREAM_BATCH = PAGE_SIZE + 10;
const MAX_TEXT = 220;
// Burst skip: when one account saturates the sightings stream, scan ahead to
// find where its run ends and jump the cursor past it instead of crawling
// through every record page by page.
const BURST_SCAN_HOP = 1000; // indexer max page size
const MAX_SCAN_HOPS = 6; // skip up to ~6k sightings per "load more"
const BURST_SAMPLE = 8; // sightings kept for the card's montage / grouping
// A run only counts as one burst while consecutive sightings are close in
// time. A quiet gap longer than this splits the run — an account posting
// steadily over many days isn't one upload and pages/renders normally.
// Mirrored by MAX_BATCH_GAP_MS in app/feed/FeedClient.tsx.
const BURST_MAX_GAP_MS = 12 * 60 * 60 * 1000; // 12h
const FEED_CACHE_MS = 60_000; // 60s in-process memo — fresh enough for "live".
// The indexer caps an `in` filter's list, so a viewer following more accounts
// than this is split into chunks that are queried in parallel and re-merged
// (mirrors the badge-filter chunking in indexer.ts).
const FOLLOW_IN_LIMIT = 100;
// Upper bound on the follow set we scope a following feed to — the indexer's
// single-page max. Following more accounts than this keeps the newest follows.
const MAX_FOLLOWING = 1000;

// ── Compound (createdAt, id) cursor ──────────────────────────────────────────
// ISO timestamps alone aren't a stable key (records can share a millisecond),
// so the cursor pairs the row's timestamp with its id and pagination filters
// strictly-older rows in that total order.

type FeedCursor = { ts: string; id: string };

function encodeCursor(cursor: FeedCursor | null): string | null {
  if (!cursor) return null;
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<FeedCursor>;
    if (typeof parsed.ts === "string" && typeof parsed.id === "string") return { ts: parsed.ts, id: parsed.id };
  } catch {
    // fall through
  }
  return null;
}

function timeValue(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** Newest-first total order: by time desc, then id desc as a stable tiebreak. */
function compareNewestFirst(a: ActivityFeedItem, b: ActivityFeedItem): number {
  const ta = timeValue(a.createdAt);
  const tb = timeValue(b.createdAt);
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** True when `item` sits strictly older than the cursor in the total order. */
function isStrictlyOlder(item: ActivityFeedItem, cursor: FeedCursor): boolean {
  const ti = timeValue(item.createdAt);
  const tc = timeValue(cursor.ts);
  if (ti !== tc) return ti < tc;
  return item.id < cursor.id;
}

// ── Certified profile helpers (mirrors the private helpers in indexer.ts) ────

type CertifiedProfileData = {
  displayName?: string | null;
  avatar?: { image?: { ref?: string | null } | null } | null;
} | null;

function profileName(profile?: CertifiedProfileData): string | null {
  return profile?.displayName?.trim() || null;
}

function profileAvatarRef(profile?: CertifiedProfileData): string | null {
  return normaliseRef(profile?.avatar?.image?.ref);
}

const CERTIFIED_PROFILE_DATA_FIELDS = `
  certifiedProfileData {
    displayName
    avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
  }
`;

function clampText(text: string | null | undefined, max = MAX_TEXT): string | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Post bodies are rendered pre-wrap, so unlike the one-line excerpts above
 *  this keeps the author's line breaks — it only normalizes CRLFs, trims, and
 *  caps runaway blank runs + length. */
function clampPostText(text: string | null | undefined, max = 400): string | null {
  if (!text) return null;
  const trimmed = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Parse `at://did/collection/rkey` into its did + rkey parts. */
function parseAtUri(uri: string): { did: string; rkey: string } | null {
  const match = uri.match(/^at:\/\/([^/]+)\/[^/]+\/(.+)$/);
  if (!match) return null;
  return { did: match[1], rkey: match[2] };
}

// ── One combined query: newest STREAM_BATCH of each kind, before the cursor ──
//
// Each stream takes a typed `where` built in JS so we can fold the createdAt
// upper bound (the cursor) and a per-kind `first: 0` (to skip streams that a
// kind filter excludes) into the same static query.

const FEED_QUERY = `
  query ActivityFeed(
    $projectFirst: Int!
    $occurrenceFirst: Int!
    $orgFirst: Int!
    $receiptFirst: Int!
    $postFirst: Int!
    $repostFirst: Int!
    $projectWhere: OrgHypercertsCollectionWhereInput
    $occurrenceWhere: AppGainforestDwcOccurrenceWhereInput
    $orgWhere: AppCertifiedActorOrganizationWhereInput
    $donationWhere: OrgHypercertsFundingReceiptWhereInput
    $postWhere: AppGainforestFeedPostWhereInput
    $repostWhere: AppGainforestFeedRepostWhereInput
  ) {
    projects: orgHypercertsCollection(
      first: $projectFirst
      where: $projectWhere
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node {
        did rkey uri createdAt title shortDescription
        ${CERTIFIED_PROFILE_DATA_FIELDS}
        banner {
          __typename
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsLargeImage { image { ref } }
        }
        avatar {
          __typename
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsSmallImage { image { ref } }
        }
      } }
    }

    occurrences: appGainforestDwcOccurrence(
      first: $occurrenceFirst
      where: $occurrenceWhere
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node {
        did rkey uri createdAt eventDate eventID fieldNotes
        scientificName vernacularName kingdom family country countryCode locality habitat
        thumbnailUrl speciesImageUrl dynamicProperties associatedMedia
        ${CERTIFIED_PROFILE_DATA_FIELDS}
        imageEvidence { file { ref } }
      } }
    }

    organizations: appCertifiedActorOrganization(
      first: $orgFirst
      where: $orgWhere
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node {
        did uri rkey createdAt organizationType
        ${CERTIFIED_PROFILE_DATA_FIELDS}
      } }
    }

    donations: orgHypercertsFundingReceipt(
      first: $receiptFirst
      where: $donationWhere
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node {
        uri createdAt occurredAt amount currency
        from {
          __typename
          ... on OrgHypercertsFundingReceiptText { value }
          ... on AppCertifiedDefsDid { did }
        }
        to {
          __typename
          ... on OrgHypercertsFundingReceiptText { value }
          ... on AppCertifiedDefsDid { did }
        }
        for { uri }
      } }
    }

    posts: appGainforestFeedPost(
      first: $postFirst
      where: $postWhere
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node {
        did uri createdAt text
        facets {
          index { byteStart byteEnd }
          features { __typename ... on AppBskyRichtextFacetMention { did } }
        }
        ${CERTIFIED_PROFILE_DATA_FIELDS}
      } }
    }

    reposts: appGainforestFeedRepost(
      first: $repostFirst
      where: $repostWhere
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node {
        did uri createdAt
        subject { uri }
        ${CERTIFIED_PROFILE_DATA_FIELDS}
      } }
    }
  }
`;

// ── Raw node shapes ──────────────────────────────────────────────────────────

type RawImage =
  | { __typename: "OrgHypercertsDefsUri"; uri?: string | null }
  | { __typename: "OrgHypercertsDefsSmallImage"; image?: { ref?: string | null } | null }
  | { __typename: "OrgHypercertsDefsLargeImage"; image?: { ref?: string | null } | null }
  | null;

type RawProject = {
  did: string;
  rkey: string;
  uri?: string | null;
  createdAt: string;
  title?: string | null;
  shortDescription?: string | null;
  certifiedProfileData?: CertifiedProfileData;
  banner?: RawImage;
  avatar?: RawImage;
};

type RawOccurrence = {
  did: string;
  rkey: string;
  uri?: string | null;
  createdAt: string;
  eventDate?: string | null;
  eventID?: string | null;
  fieldNotes?: string | null;
  scientificName?: string | null;
  vernacularName?: string | null;
  kingdom?: string | null;
  family?: string | null;
  country?: string | null;
  countryCode?: string | null;
  locality?: string | null;
  habitat?: string | null;
  thumbnailUrl?: string | null;
  speciesImageUrl?: string | null;
  dynamicProperties?: string | null;
  associatedMedia?: string | null;
  certifiedProfileData?: CertifiedProfileData;
  imageEvidence?: { file?: { ref?: string | null } | null } | null;
};

type RawOrg = {
  did: string;
  uri?: string | null;
  rkey?: string | null;
  createdAt?: string | null;
  organizationType?: string[] | null;
  certifiedProfileData?: CertifiedProfileData;
};

type RawPost = {
  did: string;
  uri?: string | null;
  createdAt: string;
  text?: string | null;
  facets?: RawIndexedFacet[] | null;
  certifiedProfileData?: CertifiedProfileData;
};

type RawDonor =
  | { __typename: "OrgHypercertsFundingReceiptText"; value?: string | null }
  | { __typename: "AppCertifiedDefsDid"; did?: string | null }
  | null;

type RawReceipt = {
  uri: string;
  createdAt?: string | null;
  occurredAt?: string | null;
  amount?: string | null;
  currency?: string | null;
  from?: RawDonor;
  to?: RawDonor;
  for?: { uri?: string | null } | null;
};

type RawRepost = {
  did: string;
  uri?: string | null;
  createdAt: string;
  subject?: { uri?: string | null } | null;
  certifiedProfileData?: CertifiedProfileData;
};

type RawFeed = {
  projects?: { edges?: Array<{ node?: RawProject | null } | null> | null } | null;
  occurrences?: { edges?: Array<{ node?: RawOccurrence | null } | null> | null } | null;
  organizations?: { edges?: Array<{ node?: RawOrg | null } | null> | null } | null;
  donations?: { edges?: Array<{ node?: RawReceipt | null } | null> | null } | null;
  posts?: { edges?: Array<{ node?: RawPost | null } | null> | null } | null;
  reposts?: { edges?: Array<{ node?: RawRepost | null } | null> | null } | null;
};

function imageMeta(image: RawImage): { url: string | null; ref: string | null } {
  if (image?.__typename === "OrgHypercertsDefsUri") return { url: image.uri?.trim() || null, ref: null };
  if (image?.__typename === "OrgHypercertsDefsSmallImage" || image?.__typename === "OrgHypercertsDefsLargeImage") {
    return { url: null, ref: normaliseRef(image.image?.ref) };
  }
  return { url: null, ref: null };
}

// ── Per-kind mappers ────────────────────────────────────────────────────────

function mapProjects(nodes: RawProject[]): ActivityFeedItem[] {
  return nodes.map((n) => {
    const banner = imageMeta(n.banner ?? null);
    const avatar = imageMeta(n.avatar ?? null);
    const didOrHandle = n.did;
    return {
      id: n.uri ?? `at://${n.did}/org.hypercerts.collection/${n.rkey}`,
      kind: "project",
      createdAt: n.createdAt,
      actorDid: n.did,
      actorName: profileName(n.certifiedProfileData),
      actorAvatarRef: profileAvatarRef(n.certifiedProfileData),
      title: (n.title ?? "Untitled project").trim() || "Untitled project",
      text: clampText(n.shortDescription),
      href: localProjectHref(didOrHandle, n.rkey),
      imageUrl: banner.url ?? avatar.url,
      imageRef: banner.ref ?? avatar.ref,
      targetTitle: null,
      targetHref: null,
      amount: null,
      currency: null,
    };
  });
}

function observationTitle(n: RawOccurrence, bioacoustics: FeedBioacousticsClip | null): string | null {
  const vernacular = n.vernacularName?.trim() || "";
  const scientific = n.scientificName?.trim() || "";
  // For bioacoustic sightings, an older build could persist a synthetic broad
  // label ("Bird") as the vernacular name. That is not a real common name, so
  // prefer the scientific name and never title the sighting with it.
  if (bioacoustics && vernacular && vernacular === LEGACY_BROAD_VERNACULARS[bioacoustics.category]) {
    return scientific || null;
  }
  return vernacular || scientific || null;
}

function observationText(n: RawOccurrence): string | null {
  const parts = [n.locality?.trim(), n.country?.trim(), n.habitat?.trim()].filter(Boolean);
  if (parts.length > 0) return clampText(parts.join(" · "));
  return clampText(n.family?.trim() ? `Family: ${n.family.trim()}` : null);
}

/** The audio segment behind a bioacoustic sighting, when the occurrence's
 *  `dynamicProperties` carry a valid `gainforestBioacoustics` sidecar that
 *  matches its `associatedMedia` (same validation as the labelling tool). */
function occurrenceBioacoustics(n: RawOccurrence): FeedBioacousticsClip | null {
  const segment = parseAudioSegmentDynamicProperties(n.dynamicProperties);
  if (!segment) return null;
  const media = (n.associatedMedia ?? "").split("|").map((value) => value.trim());
  if (!media.includes(segment.sourceAudioUri)) return null;
  return {
    audioUri: segment.sourceAudioUri,
    category: segment.labelCategory,
    startTimeSeconds: segment.startTimeSeconds,
    endTimeSeconds: segment.endTimeSeconds,
    minFrequencyHz: segment.minFrequencyHz,
    maxFrequencyHz: segment.maxFrequencyHz,
  };
}

function mapOccurrences(nodes: RawOccurrence[]): ActivityFeedItem[] {
  return nodes.map((n) => {
    const external = n.thumbnailUrl?.trim() || n.speciesImageUrl?.trim() || null;
    const imageRef = normaliseRef(n.imageEvidence?.file?.ref);
    const bioacoustics = occurrenceBioacoustics(n);
    return {
      id: n.uri ?? `at://${n.did}/app.gainforest.dwc.occurrence/${n.rkey}`,
      kind: "observation",
      createdAt: n.createdAt,
      actorDid: n.did,
      actorName: profileName(n.certifiedProfileData),
      actorAvatarRef: profileAvatarRef(n.certifiedProfileData),
      title: observationTitle(n, bioacoustics),
      text: observationText(n),
      href: localObservationHref(n.did, n.rkey),
      imageUrl: external,
      imageRef,
      observationEventId: n.eventID?.trim() || null,
      observationBatchNote: clampText(n.fieldNotes, 600),
      bioacoustics,
      targetTitle: null,
      targetHref: null,
      amount: null,
      currency: null,
    };
  });
}

function mapOrganizations(nodes: RawOrg[]): ActivityFeedItem[] {
  return nodes.map((n) => {
    const types = (n.organizationType ?? [])
      .map((t) => (typeof t === "string" ? t.trim() : null))
      .filter((t): t is string => Boolean(t));
    return {
      id: n.uri ?? `at://${n.did}/app.certified.actor.organization/${n.rkey ?? "self"}`,
      kind: "organization",
      createdAt: n.createdAt ?? "",
      actorDid: n.did,
      actorName: profileName(n.certifiedProfileData),
      actorAvatarRef: profileAvatarRef(n.certifiedProfileData),
      title: profileName(n.certifiedProfileData),
      text: types.length > 0 ? clampText(types.join(", ")) : null,
      href: accountHref(n.did),
      imageUrl: null,
      imageRef: null,
      targetTitle: null,
      targetHref: null,
      amount: null,
      currency: null,
    };
  });
}

/** Top-level feed posts (app.gainforest.feed.post with no reply). Replies are
 *  comments and surface under their subject row, not as their own feed entries. */
function mapPosts(nodes: RawPost[]): ActivityFeedItem[] {
  return nodes.map((n) => ({
    id: n.uri ?? `at://${n.did}/app.gainforest.feed.post/unknown`,
    kind: "post" as const,
    createdAt: n.createdAt,
    actorDid: n.did,
    actorName: profileName(n.certifiedProfileData),
    actorAvatarRef: profileAvatarRef(n.certifiedProfileData),
    title: null,
    text: clampPostText(n.text),
    mentions: mentionCandidatesFromFacets(n.text ?? "", n.facets),
    href: accountHref(n.did),
    imageUrl: null,
    imageRef: null,
    targetTitle: null,
    targetHref: null,
    amount: null,
    currency: null,
  }));
}

// ── Audio uploads (one row per folder per day of uploading) ─────────────
//
// Neither of the records an upload writes is the event itself: the folder
// (`ac.deployment`) is created once, up front — making a folder isn't news —
// and a single `ac.audio` is far too fine-grained, since one SD card is
// hundreds of them. `listAudioUploadDays` buckets the recordings by (folder,
// day) so a row means "this person put N recordings into this folder that
// day": emptying a card twice a month is two rows, and 1,000 recordings in an
// afternoon is one.
//
// The buckets arrive as a complete in-memory list, each carrying the real
// timestamp of its newest recording, so they merge and page exactly like a
// record stream — which is why they're built once and cached rather than
// queried per page: an aggregate can't be filtered by the feed's cursor.

/** Where "browse recordings" goes: the folder's own deployment page when it
 *  came from a chime deployment, else the owner's audio tab, which lists the
 *  same recordings grouped by folder. */
function audioBrowseHref(day: AudioUploadDay): string {
  const event = day.eventRef ? parseAtUriFull(day.eventRef) : null;
  return event ? deploymentDetailPath(event.did, event.rkey) : accountAudioPath(day.did);
}

function mapAudioUploadDays(
  days: readonly AudioUploadDay[],
  profiles: ReadonlyMap<string, { displayName: string | null; avatarRef: string | null }>,
  hiddenRecords: ReadonlySet<string>,
): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];
  for (const day of days) {
    // Hiding the folder hides every day it uploaded on — the row's own id is
    // synthetic (folder + day), so moderation is checked against the record.
    if (day.folderUri && hiddenRecords.has(day.folderUri)) continue;
    const profile = profiles.get(day.did);
    const href = audioBrowseHref(day);
    items.push({
      id: day.id,
      kind: "audio",
      createdAt: day.createdAt,
      actorDid: day.did,
      actorName: profile?.displayName ?? null,
      actorAvatarRef: profile?.avatarRef ?? null,
      title: null,
      text: null,
      href,
      imageUrl: null,
      imageRef: null,
      targetTitle: null,
      targetHref: null,
      amount: null,
      currency: null,
      audioUpload: {
        recordingCount: day.recordingCount,
        recorderName: day.recorderName,
        browseHref: href,
      },
    });
  }
  return items;
}

// ── Reshares (app.gainforest.feed.repost → Bluesky's `reasonRepost` rows) ────
//
// A reshare surfaces the ORIGINAL record as a fresh feed row at the reshare's
// timestamp, headed by a "X reshared" attribution. The merge phase only needs
// the repost's (createdAt, uri) and the resharer's identity, so reposts enter
// the pool as lightweight placeholders; the subject content is hydrated after
// the page is sliced (like donations), so only surfaced reshares cost lookups.
// Supported subject kinds: posts, sightings, and projects — a reshare of
// anything else (or of a record that has since been deleted) drops out.

/** Parse `at://did/collection/rkey` keeping the collection segment. */
function parseAtUriFull(uri: string): { did: string; collection: string; rkey: string } | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { did: match[1], collection: match[2], rkey: match[3] };
}

const RESHARE_KIND_BY_COLLECTION: Record<string, ActivityFeedKind> = {
  "app.gainforest.feed.post": "post",
  "app.gainforest.dwc.occurrence": "observation",
  "org.hypercerts.collection": "project",
};

/** Map repost records to placeholder rows: ordered by the reshare's createdAt,
 *  id'd by the repost record's URI, owned (for hidden-account checks and the
 *  following scope) by the RESHARER. Content fields stay empty until
 *  `resolveReshares` swaps in the subject record after the page slice. */
function mapReposts(nodes: RawRepost[]): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];
  for (const n of nodes) {
    const subjectUri = n.subject?.uri;
    if (!n.uri || !subjectUri) continue;
    const subject = parseAtUriFull(subjectUri);
    const kind = subject ? RESHARE_KIND_BY_COLLECTION[subject.collection] : undefined;
    if (!kind) continue; // unsupported subject kind — not a feed row
    // Self-reshares are noise (the original row already carries the author).
    if (subject && subject.did === n.did) continue;
    items.push({
      id: n.uri,
      kind,
      createdAt: n.createdAt,
      actorDid: n.did,
      actorName: null,
      actorAvatarRef: null,
      title: null,
      text: null,
      href: accountHref(n.did),
      imageUrl: null,
      imageRef: null,
      targetTitle: null,
      targetHref: null,
      amount: null,
      currency: null,
      reshare: {
        did: n.did,
        name: profileName(n.certifiedProfileData),
        avatarRef: profileAvatarRef(n.certifiedProfileData),
        subjectUri,
      },
    });
  }
  return items;
}

// Subject hydration — one query per subject collection, only when needed.
const RESHARE_POST_SUBJECTS_QUERY = `
  query ResharePostSubjects($uris: [String!]!) {
    appGainforestFeedPost(first: ${PAGE_SIZE}, where: { uri: { in: $uris } }) {
      edges { node {
        did uri createdAt text
        facets {
          index { byteStart byteEnd }
          features { __typename ... on AppBskyRichtextFacetMention { did } }
        }
        ${CERTIFIED_PROFILE_DATA_FIELDS}
      } }
    }
  }
`;

const RESHARE_OCCURRENCE_SUBJECTS_QUERY = `
  query ReshareOccurrenceSubjects($uris: [String!]!) {
    appGainforestDwcOccurrence(first: ${PAGE_SIZE}, where: { uri: { in: $uris } }) {
      edges { node {
        did rkey uri createdAt eventDate eventID fieldNotes
        scientificName vernacularName kingdom family country countryCode locality habitat
        thumbnailUrl speciesImageUrl dynamicProperties associatedMedia
        ${CERTIFIED_PROFILE_DATA_FIELDS}
        imageEvidence { file { ref } }
      } }
    }
  }
`;

const RESHARE_PROJECT_SUBJECTS_QUERY = `
  query ReshareProjectSubjects($uris: [String!]!) {
    orgHypercertsCollection(first: ${PAGE_SIZE}, where: { uri: { in: $uris } }) {
      edges { node {
        did rkey uri createdAt title shortDescription
        ${CERTIFIED_PROFILE_DATA_FIELDS}
        banner {
          __typename
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsLargeImage { image { ref } }
        }
        avatar {
          __typename
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsSmallImage { image { ref } }
        }
      } }
    }
  }
`;

/**
 * Hydrate the reshare placeholders that made it onto the page: fetch each
 * subject record, and rebuild the row as the subject's content wearing the
 * reshare's (id, createdAt, attribution). Rows whose subject is gone, hidden,
 * or authored by a hidden account drop out — a reshare never resurfaces
 * something moderation removed. Non-reshare rows pass through untouched.
 */
async function resolveReshares(
  pageItems: ActivityFeedItem[],
  hidden: ReadonlySet<string>,
  hiddenRecords: ReadonlySet<string>,
): Promise<ActivityFeedItem[]> {
  const pending = pageItems.filter((it) => it.reshare);
  if (pending.length === 0) return pageItems;

  const urisByKind = new Map<ActivityFeedKind, Set<string>>();
  for (const it of pending) {
    const set = urisByKind.get(it.kind) ?? new Set<string>();
    set.add(it.reshare!.subjectUri);
    urisByKind.set(it.kind, set);
  }

  const subjects = new Map<string, ActivityFeedItem>();
  const collect = (mapped: ActivityFeedItem[]) => {
    for (const item of mapped) subjects.set(item.id, item);
  };
  await Promise.all([
    (async () => {
      const uris = [...(urisByKind.get("post") ?? [])];
      if (uris.length === 0) return;
      const data = await indexerQuery<{
        appGainforestFeedPost?: { edges?: Array<{ node?: RawPost | null } | null> | null } | null;
      }>(RESHARE_POST_SUBJECTS_QUERY, { uris }).catch(() => null);
      collect(
        mapPosts(
          (data?.appGainforestFeedPost?.edges ?? [])
            .map((e) => e?.node)
            .filter((n): n is RawPost => Boolean(n?.did)),
        ),
      );
    })(),
    (async () => {
      const uris = [...(urisByKind.get("observation") ?? [])];
      if (uris.length === 0) return;
      const data = await indexerQuery<{
        appGainforestDwcOccurrence?: { edges?: Array<{ node?: RawOccurrence | null } | null> | null } | null;
      }>(RESHARE_OCCURRENCE_SUBJECTS_QUERY, { uris }).catch(() => null);
      collect(
        mapOccurrences(
          (data?.appGainforestDwcOccurrence?.edges ?? [])
            .map((e) => e?.node)
            .filter((n): n is RawOccurrence => Boolean(n?.did)),
        ),
      );
    })(),
    (async () => {
      const uris = [...(urisByKind.get("project") ?? [])];
      if (uris.length === 0) return;
      const data = await indexerQuery<{
        orgHypercertsCollection?: { edges?: Array<{ node?: RawProject | null } | null> | null } | null;
      }>(RESHARE_PROJECT_SUBJECTS_QUERY, { uris }).catch(() => null);
      collect(
        mapProjects(
          (data?.orgHypercertsCollection?.edges ?? [])
            .map((e) => e?.node)
            .filter((n): n is RawProject => Boolean(n?.did)),
        ),
      );
    })(),
  ]);

  const out: ActivityFeedItem[] = [];
  for (const it of pageItems) {
    if (!it.reshare) {
      out.push(it);
      continue;
    }
    const subject = subjects.get(it.reshare.subjectUri);
    if (!subject || hidden.has(subject.actorDid) || hiddenRecords.has(it.reshare.subjectUri)) continue;
    out.push({
      ...subject,
      id: it.id,
      createdAt: it.createdAt,
      reshare: it.reshare,
    });
  }
  return out;
}

function safeAmount(raw: string | null | undefined): number {
  const parsed = Number.parseFloat(raw ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A donation funds a Cert; since Certs are folded into Projects, resolve each
 *  funded Cert to its parent Project so donation rows name and link the project
 *  instead of the (hidden) Cert. The Cert and its Project live in the same repo,
 *  so we group the funded Cert URIs by owning DID and read that repo's project
 *  collections, matching on the collection's `items[]` Cert references. */
type DonationProject = { did: string; rkey: string; title: string | null };

const FEED_PROJECTS_BY_DID_QUERY = `
  query FeedProjectsByDid($did: String!) {
    orgHypercertsCollection(
      where: { did: { eq: $did }, type: { in: ["project", "Project"] } }
      first: 200
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node { rkey title items { itemIdentifier { uri } } } }
    }
  }
`;

async function resolveProjectsForCertUris(certUris: string[]): Promise<Map<string, DonationProject>> {
  const out = new Map<string, DonationProject>();
  const unique = [...new Set(certUris)].filter((u) => u.startsWith("at://"));
  if (unique.length === 0) return out;

  // Group funded Cert URIs by the DID of the repo that holds both Cert + project.
  const byDid = new Map<string, Set<string>>();
  for (const uri of unique) {
    const parsed = parseAtUri(uri);
    if (!parsed) continue;
    const set = byDid.get(parsed.did) ?? new Set<string>();
    set.add(uri);
    byDid.set(parsed.did, set);
  }

  await Promise.all(
    [...byDid.entries()].map(async ([did, certSet]) => {
      const data = await indexerQuery<{
        orgHypercertsCollection?: {
          edges?: Array<{
            node?: {
              rkey?: string | null;
              title?: string | null;
              items?: Array<{ itemIdentifier?: { uri?: string | null } | null } | null> | null;
            } | null;
          } | null> | null;
        } | null;
      }>(FEED_PROJECTS_BY_DID_QUERY, { did }).catch(() => null);
      for (const edge of data?.orgHypercertsCollection?.edges ?? []) {
        const node = edge?.node;
        if (!node?.rkey) continue;
        for (const item of node.items ?? []) {
          const certUri = item?.itemIdentifier?.uri;
          if (typeof certUri === "string" && certSet.has(certUri) && !out.has(certUri)) {
            out.set(certUri, { did, rkey: node.rkey, title: node.title?.trim() || null });
          }
        }
      }
    }),
  );
  return out;
}

/** One side of a receipt (`from` / `to`) as recorded: an account DID, a bare
 *  wallet address, or neither. */
type DonationParty = { did: string | null; wallet: string | null };

/** Map donation receipts to rows WITHOUT resolving their funded project or the
 *  donor/recipient identities yet — those lookups are deferred until after the
 *  page is sliced, so we only resolve the donations that actually surface.
 *  Returns side maps from row id to the funded Cert URI and to the raw donor
 *  (`from`) and recipient (`to`) sides for that later enrichment. */
function mapDonations(nodes: RawReceipt[]): {
  items: ActivityFeedItem[];
  certUriById: Map<string, string>;
  recipientById: Map<string, DonationParty>;
  donorById: Map<string, DonationParty>;
} {
  const certUriById = new Map<string, string>();
  const recipientById = new Map<string, DonationParty>();
  const donorById = new Map<string, DonationParty>();
  const items = nodes.map((n): ActivityFeedItem => {
    const certUri = n.for?.uri ?? null;
    if (certUri) certUriById.set(n.uri, certUri);
    const toWallet = n.to?.__typename === "OrgHypercertsFundingReceiptText" ? n.to.value ?? null : null;
    const toDid = n.to?.__typename === "AppCertifiedDefsDid" ? n.to.did ?? null : null;
    if (toWallet || toDid) recipientById.set(n.uri, { did: toDid, wallet: toWallet });
    // Fallback link while the funded project is unresolved: the Cert page
    // itself (the donations hub is admin-gated now), else the feed.
    const certRef = certUri ? parseAtUri(certUri) : null;
    const fallbackHref = certRef ? localBumicertHref(certRef.did, certRef.rkey) : "/feed";
    const donorWallet = n.from?.__typename === "OrgHypercertsFundingReceiptText" ? n.from.value ?? null : null;
    const donorDid = n.from?.__typename === "AppCertifiedDefsDid" ? n.from.did ?? null : null;
    if (donorWallet || donorDid) donorById.set(n.uri, { did: donorDid, wallet: donorWallet });
    const currency = (n.currency ?? "USD").toUpperCase();
    const amount = safeAmount(n.amount);
    return {
      id: n.uri,
      kind: "donation",
      // Order donations by record creation (matches the GraphQL sort + cursor).
      createdAt: n.createdAt ?? n.occurredAt ?? "",
      actorDid: donorDid ?? "",
      actorName: null,
      actorAvatarRef: null,
      title: null,
      text: clampText(donorWallet ? `via ${donorWallet.slice(0, 10)}…` : null),
      href: fallbackHref,
      imageUrl: null,
      imageRef: null,
      targetTitle: null,
      targetHref: null,
      amount,
      currency,
    };
  });
  return { items, certUriById, recipientById, donorById };
}

// ── Donation identity resolution (wallet/DID → account name) ──────────────

const LINKED_WALLETS_BY_ADDRESS_QUERY = `
  query LinkedWalletsByAddress($addresses: [String!]) {
    appGainforestLinkEvm(first: 100, where: { address: { in: $addresses } }) {
      edges { node { did address } }
    }
    appCertifiedLinkEvm(first: 100, where: { address: { in: $addresses } }) {
      edges { node { did address } }
    }
  }
`;

type RawLinkedWalletEdges = { edges?: Array<{ node?: { did?: string | null; address?: string | null } | null } | null> | null } | null;

/** Reverse-lookup wallet addresses to account DIDs via the linked-wallet
 *  records. Addresses can be stored in any casing, so every casing candidate
 *  (as-written, lowercase, checksummed) is queried and results are matched
 *  case-insensitively. Returns lowercase address → DID. */
async function resolveWalletOwners(wallets: Set<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (wallets.size === 0) return out;
  const candidates = new Set<string>();
  for (const wallet of wallets) {
    candidates.add(wallet);
    candidates.add(wallet.toLowerCase());
    try {
      candidates.add(getAddress(wallet));
    } catch {
      // Not a canonical EVM address — the raw + lowercase candidates still apply.
    }
  }
  const data = await indexerQuery<{
    appGainforestLinkEvm?: RawLinkedWalletEdges;
    appCertifiedLinkEvm?: RawLinkedWalletEdges;
  }>(LINKED_WALLETS_BY_ADDRESS_QUERY, { addresses: [...candidates] }).catch(() => null);
  for (const source of [data?.appGainforestLinkEvm, data?.appCertifiedLinkEvm]) {
    for (const edge of source?.edges ?? []) {
      const node = edge?.node;
      if (node?.did && node.address && !out.has(node.address.toLowerCase())) {
        out.set(node.address.toLowerCase(), node.did);
      }
    }
  }
  return out;
}

/** Resolve funded projects for the donation rows that made it into the page and
 *  patch their link + target label in place, then put a real person/organization
 *  behind each row instead of an identifier.
 *
 *  The donor (`from`) is named for EVERY donation row — receipts live in the
 *  facilitator's repo, so unlike other feed rows they carry no author profile
 *  and the name has to be looked up here, or the row would fall back to a raw
 *  DID. Rows without a funded Cert are direct donations (e.g. wallet tips):
 *  their `to` side is named the same way. Either side resolves via its account
 *  DID, via the linked-wallet records when only a wallet address was recorded,
 *  and — for the GainForest tip wallet (gainforest.eth, which has no
 *  linked-wallet record) — by matching the resolved tip address. */
async function enrichDonations(
  pageItems: ActivityFeedItem[],
  certUriById: Map<string, string>,
  recipientById: Map<string, DonationParty>,
  donorById: Map<string, DonationParty>,
): Promise<void> {
  const certUris = pageItems
    .filter((it) => it.kind === "donation")
    .map((it) => certUriById.get(it.id))
    .filter((u): u is string => Boolean(u));
  if (certUris.length > 0) {
    const projectByCert = await resolveProjectsForCertUris(certUris);
    for (const it of pageItems) {
      if (it.kind !== "donation") continue;
      const certUri = certUriById.get(it.id);
      const project = certUri ? projectByCert.get(certUri) ?? null : null;
      if (!project) continue; // legacy standalone Cert — keep the Cert-page link
      const projectHref = localProjectHref(project.did, project.rkey);
      it.href = projectHref;
      it.targetHref = projectHref;
      it.targetTitle = project.title;
    }
  }

  // Donors are named on every donation row; recipients only on direct
  // donations (no funded Cert resolved) where the receipt names a `to` side.
  const donations = pageItems.filter((it) => it.kind === "donation");
  const direct = donations.filter((it) => !it.targetTitle && recipientById.has(it.id));
  if (donations.length === 0) return;

  // One wallet reverse-lookup for both sides of every row on the page.
  const wallets = new Set<string>();
  for (const it of donations) {
    const wallet = donorById.get(it.id)?.wallet;
    if (wallet) wallets.add(wallet);
  }
  let recipientWallets = false;
  for (const it of direct) {
    const wallet = recipientById.get(it.id)?.wallet;
    if (wallet) {
      wallets.add(wallet);
      recipientWallets = true;
    }
  }
  const [didByWallet, tipWallet] = await Promise.all([
    resolveWalletOwners(wallets),
    recipientWallets ? getTipWalletAddress().catch(() => null) : Promise.resolve(null),
  ]);

  const didFor = (party: DonationParty | undefined): string | null => {
    if (!party) return null;
    if (party.did) return party.did;
    return party.wallet ? didByWallet.get(party.wallet.toLowerCase()) ?? null : null;
  };

  // One profile lookup for both sides too. `fetchAccountCards` also covers
  // organizations, which publish their name on the organization record rather
  // than a profile record.
  const dids = new Set<string>();
  for (const it of donations) {
    const did = didFor(donorById.get(it.id));
    if (did) dids.add(did);
  }
  for (const it of direct) {
    const did = didFor(recipientById.get(it.id));
    if (did) dids.add(did);
  }
  const cards =
    dids.size > 0
      ? await fetchAccountCards([...dids]).catch(() => new Map<string, { displayName: string | null; avatarRef: string | null }>())
      : new Map<string, { displayName: string | null; avatarRef: string | null }>();

  // Donor → the row's actor (name + avatar), like every other feed row's author.
  for (const it of donations) {
    const did = didFor(donorById.get(it.id));
    if (!did) continue;
    const card = cards.get(did);
    const name = card?.displayName?.trim() || null;
    if (!name) continue; // no plain-language name — keep the anonymous heart badge
    it.actorDid = did;
    it.actorName = name;
    it.actorAvatarRef = card?.avatarRef ?? null;
    // The wallet caption only stood in for a missing name.
    if (donorById.get(it.id)?.wallet) it.text = null;
  }

  const tip = tipWallet?.toLowerCase() ?? null;
  for (const it of direct) {
    const did = didFor(recipientById.get(it.id));
    if (did) {
      const name = cards.get(did)?.displayName?.trim();
      if (!name) continue; // no plain-language name to show — leave the row as-is
      it.targetTitle = name;
      it.targetHref = accountHref(did);
      if (it.href === "/feed") it.href = accountHref(did);
      continue;
    }
    const wallet = recipientById.get(it.id)?.wallet;
    if (wallet && tip && wallet.toLowerCase() === tip) {
      // Tips to gainforest.eth — the platform itself. Brand name, not copy.
      it.targetTitle = "GainForest";
    }
  }
}

// ── Pinned post (steward-managed, moderation repo) ───────────────────────────

/** Fetch the steward-pinned post(s) by AT-URI and map them to feed rows.
 *  Reads the pin subjects from the moderation repo, then hydrates each post
 *  from the indexer (for author profile data + mention facets). Deleted /
 *  reply / unknown subjects drop out; failure is soft (no pinned row). */
const PINNED_POSTS_QUERY = `
  query PinnedFeedPosts($uris: [String!]!) {
    appGainforestFeedPost(
      first: 10
      where: { uri: { in: $uris }, reply: { isNull: true } }
    ) {
      edges { node {
        did uri createdAt text
        facets {
          index { byteStart byteEnd }
          features { __typename ... on AppBskyRichtextFacetMention { did } }
        }
        ${CERTIFIED_PROFILE_DATA_FIELDS}
      } }
    }
  }
`;

async function fetchPinnedFeedItems(): Promise<ActivityFeedItem[]> {
  const uris = await fetchPinnedPostUris().catch(() => [] as string[]);
  if (uris.length === 0) return [];
  const data = await indexerQuery<{
    appGainforestFeedPost?: { edges?: Array<{ node?: RawPost | null } | null> | null } | null;
  }>(PINNED_POSTS_QUERY, { uris }).catch(() => null);
  const nodes = (data?.appGainforestFeedPost?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is RawPost => Boolean(n?.did));
  const byUri = new Map(mapPosts(nodes).map((item) => [item.id, item]));
  // Preserve pin order (newest pin first) rather than indexer return order.
  return uris
    .map((uri) => byUri.get(uri))
    .filter((item): item is ActivityFeedItem => Boolean(item))
    .map((item) => ({ ...item, pinned: true }));
}

/** Prepend the steward-pinned post to a first page of the global feed. The
 *  pinned row sits above the chronological merge and is de-duped out of it;
 *  pagination cursors are untouched (they walk the chronological order). */
async function applyPinnedPost(
  page: ActivityFeedPage,
  cursor: FeedCursor | null,
  filter: ActivityFeedFilter,
  following: FollowingScope | null,
): Promise<ActivityFeedPage> {
  const wantsPins = cursor == null && following == null && (filter === "all" || filter === "post");
  if (!wantsPins) return page;
  const [pinnedItems, hidden, hiddenRecords] = await Promise.all([
    fetchPinnedFeedItems(),
    fetchPublicHiddenAccountDids().catch(() => new Set<string>()),
    fetchHiddenRecordUris().catch(() => new Set<string>()),
  ]);
  const visible = pinnedItems.filter(
    (item) => !hidden.has(item.actorDid) && !hiddenRecords.has(item.id),
  );
  if (visible.length === 0) return page;
  const pinnedIds = new Set(visible.map((item) => item.id));
  return {
    ...page,
    items: [...visible, ...page.items.filter((item) => !pinnedIds.has(item.id))],
  };
}

// ── Following scope (viewer's follow graph) ───────────────────────────

const VIEWER_FOLLOWING_QUERY = `
  query ViewerFollowing($did: String!, $first: Int!) {
    appCertifiedGraphFollow(
      first: $first
      where: { did: { eq: $did } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      edges { node { subject } }
    }
  }
`;

/**
 * Resolve the DIDs a viewer follows (newest follows first, capped at the
 * indexer's single-page max). Server-safe — reads the `app.certified.graph.follow`
 * collection where `did = viewer` and returns each follow's `subject`. Powers the
 * feed's "Following" tab: an atproto query-on-read following feed scopes the
 * record streams to these authors instead of fanning out on write.
 */
export async function fetchViewerFollowingDids(
  viewerDid: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const data = await indexerQuery<{
    appCertifiedGraphFollow?: {
      edges?: Array<{ node?: { subject?: string | null } | null } | null> | null;
    } | null;
  }>(VIEWER_FOLLOWING_QUERY, { did: viewerDid, first: MAX_FOLLOWING }, signal).catch(() => null);
  const out = new Set<string>();
  for (const edge of data?.appCertifiedGraphFollow?.edges ?? []) {
    const subject = edge?.node?.subject;
    if (subject) out.add(subject);
  }
  return [...out];
}

function chunkDids(dids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < dids.length; i += size) chunks.push(dids.slice(i, i + size));
  return chunks;
}

// ── Public builder ────────────────────────────────────────────────────────────

// Lean scan over one account's sightings to locate where its burst ends.
const BURST_SCAN_QUERY = `
  query BurstScan($first: Int!, $where: AppGainforestDwcOccurrenceWhereInput) {
    appGainforestDwcOccurrence(first: $first, where: $where, sortBy: createdAt, sortDirection: DESC) {
      edges { node { did createdAt uri rkey } }
    }
  }
`;

type ScanNode = { did: string; createdAt: string; uri?: string | null; rkey?: string | null };

function scanNodeId(n: ScanNode): string {
  return n.uri ?? `at://${n.did}/app.gainforest.dwc.occurrence/${n.rkey ?? ""}`;
}

/**
 * Walk an account's sightings newest-first (in indexer-max hops) until the run
 * ends: either another account's sighting, or a record at/below `floorTime`
 * (the newest non-sighting item already in the pool). Returns the last sighting
 * of the run, whose (createdAt, id) becomes the jump cursor so the next page
 * begins right after the whole burst, plus `count` — how many not-yet-emitted
 * sightings the run contains (a lower bound when the hop budget runs out) —
 * gathered while walking anyway, so the summary card's headline number costs
 * nothing extra. Only nodes strictly older than the page cursor are counted:
 * run rows already emitted raw on previous pages are the client's to add.
 */
async function scanBurstEnd(
  burstActor: string,
  before: FeedCursor | null,
  floorTime: number,
): Promise<{ createdAt: string; id: string; count: number } | null> {
  let upper = before?.ts ?? null;
  const beforeTime = before ? timeValue(before.ts) : null;
  let lastBurst: { createdAt: string; id: string; count: number } | null = null;
  let lastBurstTime: number | null = null;
  let runCount = 0;
  const seen = new Set<string>();

  for (let hop = 0; hop < MAX_SCAN_HOPS; hop += 1) {
    const where = upper ? { createdAt: { lte: upper } } : null;
    const data = await indexerQuery<{
      appGainforestDwcOccurrence?: { edges?: Array<{ node?: ScanNode | null } | null> | null } | null;
    }>(BURST_SCAN_QUERY, { first: BURST_SCAN_HOP, where }).catch(() => null);
    const nodes = (data?.appGainforestDwcOccurrence?.edges ?? [])
      .map((e) => e?.node)
      .filter((n): n is ScanNode => Boolean(n?.did && n.createdAt));
    if (nodes.length === 0) break;

    let oldestTs: string | null = null;
    let progressed = false;
    for (const n of nodes) {
      const id = scanNodeId(n);
      if (seen.has(id)) continue;
      seen.add(id);
      progressed = true;
      oldestTs = n.createdAt;
      const t = timeValue(n.createdAt);
      if (t <= floorTime) return lastBurst; // run ended at the pool's boundary
      if (n.did !== burstActor) return lastBurst; // run ended at another account's sighting
      // A long quiet gap between two of the actor's sightings ends the burst:
      // only things uploaded close together collapse into one summary.
      if (lastBurstTime !== null && lastBurstTime - t > BURST_MAX_GAP_MS) return lastBurst;
      // Count only rows strictly older than the cursor (same compound order as
      // isStrictlyOlder); boundary rows re-fetched by the lte bound were
      // already emitted on the previous page.
      const strictlyOlder =
        beforeTime === null || t < beforeTime || (t === beforeTime && before !== null && id < before.id);
      if (strictlyOlder) runCount += 1;
      lastBurst = { createdAt: n.createdAt, id, count: runCount };
      lastBurstTime = t;
    }
    if (!progressed || nodes.length < BURST_SCAN_HOP) break; // exhausted / no progress
    upper = oldestTs ?? upper;
  }
  // No boundary within the hop budget: jump to the oldest sighting we saw so a
  // later "load more" continues past the rest of the run.
  return lastBurst;
}

/**
 * Build a page that collapses a saturating single-account sightings burst: emit
 * a small sample (the client groups it into one summary card) and set the
 * cursor past the entire run so the next page reaches the next account.
 */
async function buildBurstSkipPage(
  ordered: ActivityFeedItem[],
  firstObsIdx: number,
  burstActor: string,
  before: FeedCursor | null,
): Promise<ActivityFeedPage | null> {
  // The newest non-sighting item already in the pool can also end the run.
  const newestNonObs = ordered.find((it) => it.kind !== "observation");
  const floorTime = newestNonObs ? timeValue(newestNonObs.createdAt) : -Infinity;

  const jump = await scanBurstEnd(burstActor, before, floorTime);
  if (!jump) return null;

  // Emit only items at/after the jump in the total order: anything strictly
  // older than the jump cursor re-appears on the next page (the gap check can
  // end a run inside the sampled slice, which would otherwise duplicate rows).
  const jumpCursor: FeedCursor = { ts: jump.createdAt, id: jump.id };
  const sample = ordered
    .slice(0, firstObsIdx + BURST_SAMPLE)
    .filter((it) => !isStrictlyOlder(it, jumpCursor));
  if (sample.length === 0) return null;
  // Stamp the scanned run total on the sampled sightings so the client's
  // summary card can headline the real burst size without another query.
  const burstCount = Math.max(jump.count, sample.filter((it) => it.kind === "observation").length);
  for (const it of sample) {
    if (it.kind === "observation") it.burstCount = burstCount;
  }
  return {
    items: sample,
    nextCursor: encodeCursor({ ts: jump.createdAt, id: jump.id }),
    hasMore: true,
  };
}

async function buildFeedPageUncached(
  cursor: FeedCursor | null,
  filter: ActivityFeedFilter,
  following: FollowingScope | null,
): Promise<ActivityFeedPage> {
  const before = cursor?.ts ?? null;
  const ltBound = before ? { createdAt: { lte: before } } : {};
  const wants = (k: ActivityFeedKind) => filter === "all" || filter === k;

  // Following scope (atproto query-on-read): restrict the author-keyed streams
  // to the accounts the viewer follows, chunked at the indexer's `in` cap and
  // re-merged. A viewer who follows nobody gets an empty page straight away.
  // Donations are donor-keyed (often anonymous wallets, not followable DIDs), so
  // they're omitted from a following feed.
  const isFollowing = following != null;
  if (isFollowing && following.dids.length === 0) {
    return { items: [], nextCursor: null, hasMore: false };
  }
  const didChunks: (readonly string[] | null)[] = isFollowing
    ? chunkDids(following.dids, FOLLOW_IN_LIMIT)
    : [null];
  // Donations remain available in the dedicated donations views, but are not
  // part of the activity feed while the donation stream is paused.
  // Reshares only join the unified merge (and the following feed, scoped to
  // the RESHARER); single-kind tabs stay records-only.
  const wantsReshare = filter === "all";
  const nonEmpty = (where: Record<string, unknown>): Record<string, unknown> | null =>
    Object.keys(where).length > 0 ? where : null;

  // `first: 0` is treated as "default page size" by the indexer (not zero), so a
  // kind filter can't be expressed by zeroing a stream's `first`. Unwanted
  // streams are fetched at the floor of 1 and then dropped from the pool below.
  // One combined query runs per follow chunk (just one when global); the raw
  // nodes are unioned before mapping.
  const results = await Promise.all(
    didChunks.map((chunk) => {
      const didIn = chunk ? { did: { in: [...chunk] } } : {};
      return indexerQuery<RawFeed>(FEED_QUERY, {
        projectFirst: wants("project") ? STREAM_BATCH : 1,
        occurrenceFirst: wants("observation") ? STREAM_BATCH : 1,
        orgFirst: wants("organization") ? STREAM_BATCH : 1,
        receiptFirst: 1,
        postFirst: wants("post") ? STREAM_BATCH : 1,
        repostFirst: wantsReshare ? STREAM_BATCH : 1,
        projectWhere: { type: { in: ["project", "Project"] }, ...didIn, ...ltBound },
        occurrenceWhere: nonEmpty({ ...didIn, ...ltBound }),
        orgWhere: nonEmpty({ ...didIn, ...ltBound }),
        donationWhere: { did: { eq: FACILITATOR_DID }, ...ltBound },
        postWhere: { reply: { isNull: true }, ...didIn, ...ltBound },
        repostWhere: nonEmpty({ ...didIn, ...ltBound }),
      });
    }),
  );

  // Union raw nodes across follow chunks. Chunks partition the DID set, so a
  // node can't appear twice; the item-level `seen` set below still guards stray
  // duplicates. `fetchedFull` is true when any single (chunk, stream) returned a
  // full batch — the "there may be older rows" signal for hasMore.
  const projectNodes: RawProject[] = [];
  const occurrenceNodes: RawOccurrence[] = [];
  const orgNodes: RawOrg[] = [];
  const receiptNodes: RawReceipt[] = [];
  const postNodes: RawPost[] = [];
  const repostNodes: RawRepost[] = [];
  let fetchedFull = false;
  for (const data of results) {
    const p = (data?.projects?.edges ?? []).map((e) => e?.node).filter((n): n is RawProject => Boolean(n?.did));
    const o = (data?.occurrences?.edges ?? []).map((e) => e?.node).filter((n): n is RawOccurrence => Boolean(n?.did));
    const g = (data?.organizations?.edges ?? []).map((e) => e?.node).filter((n): n is RawOrg => Boolean(n?.did));
    const r = (data?.donations?.edges ?? []).map((e) => e?.node).filter((n): n is RawReceipt => Boolean(n?.uri));
    const s = (data?.posts?.edges ?? []).map((e) => e?.node).filter((n): n is RawPost => Boolean(n?.did));
    const q = (data?.reposts?.edges ?? []).map((e) => e?.node).filter((n): n is RawRepost => Boolean(n?.did));
    if (
      p.length >= STREAM_BATCH ||
      o.length >= STREAM_BATCH ||
      g.length >= STREAM_BATCH ||
      r.length >= STREAM_BATCH ||
      s.length >= STREAM_BATCH ||
      q.length >= STREAM_BATCH
    ) {
      fetchedFull = true;
    }
    projectNodes.push(...p);
    occurrenceNodes.push(...o);
    orgNodes.push(...g);
    receiptNodes.push(...r);
    postNodes.push(...s);
    repostNodes.push(...q);
  }

  // Donation receipts are intentionally excluded from the activity feed. Keep
  // the floor fetch above so the query shape stays stable for older filters.

  // Upload days are derived, not streamed: one cached sweep serves every page,
  // and only the days this feed can show are kept. A following feed keeps the
  // uploads of accounts the viewer follows.
  const followedDids = isFollowing ? new Set(following.dids) : null;
  const audioDays = wants("audio")
    ? (await listAudioUploadDays().catch(() => [] as AudioUploadDay[])).filter(
        (day) => !followedDids || followedDids.has(day.did),
      )
    : [];
  const audioProfiles = audioDays.length > 0
    ? await fetchAccountCards([...new Set(audioDays.map((day) => day.did))]).catch(
        () => new Map<string, { displayName: string | null; avatarRef: string | null }>(),
      )
    : new Map<string, { displayName: string | null; avatarRef: string | null }>();

  // Accounts a GainForest steward flagged as "test", and accounts hosted on a
  // blocked server address, are hidden from the feed — every row owned by such
  // a DID is dropped before the merge. Individual records flagged as test
  // (posts, observations, …) are dropped the same way by their AT-URI, without
  // hiding the rest of the account.
  const [hidden, hiddenRecords] = await Promise.all([
    fetchPublicHiddenAccountDids().catch(() => new Set<string>()),
    fetchHiddenRecordUris().catch(() => new Set<string>()),
  ]);

  // Merge every wanted kind into one pool ordered purely by recency — no
  // per-kind quota — then keep only rows strictly older than the cursor. A
  // single-kind filter drops the floor-fetched rows of the other streams here.
  const pool = [
    ...mapProjects(projectNodes),
    ...mapOccurrences(occurrenceNodes),
    ...mapOrganizations(orgNodes),
    ...mapPosts(postNodes),
    ...mapAudioUploadDays(audioDays, audioProfiles, hiddenRecords),
    ...(wantsReshare ? mapReposts(repostNodes) : []),
  ].filter(
    (item) =>
      item.createdAt &&
      (filter === "all" || item.kind === filter) &&
      !hidden.has(item.actorDid) &&
      !hiddenRecords.has(item.id),
  );
  pool.sort(compareNewestFirst);

  const eligible = cursor ? pool.filter((it) => isStrictlyOlder(it, cursor)) : pool;
  const seen = new Set<string>();
  const ordered = eligible.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));

  // Burst skip: when a single account fills the entire sightings batch, its run
  // would otherwise crawl past page by page. Collapse it to a sample and jump
  // the cursor past the whole run to the next account's activity. Skipped for a
  // following feed: the burst scan isn't author-scoped, so it would over-skip;
  // following feeds are sparse enough to page normally.
  if (
    !isFollowing &&
    (filter === "all" || filter === "observation") &&
    occurrenceNodes.length >= STREAM_BATCH
  ) {
    const firstObsIdx = ordered.findIndex((it) => it.kind === "observation" && !it.reshare);
    const burstActor = firstObsIdx >= 0 && firstObsIdx < PAGE_SIZE ? ordered[firstObsIdx].actorDid : null;
    if (burstActor && occurrenceNodes.every((n) => n.did === burstActor)) {
      const skipPage = await buildBurstSkipPage(ordered, firstObsIdx, burstActor, cursor);
      if (skipPage) {
        skipPage.items = await resolveReshares(skipPage.items, hidden, hiddenRecords);
        return skipPage;
      }
    }
  }

  const sliced = ordered.slice(0, PAGE_SIZE);
  // The cursor walks the pre-hydration order: a reshare whose subject turns out
  // gone/hidden is consumed (dropped from the page) without stalling paging.
  const last = sliced[sliced.length - 1];
  const pageItems = await resolveReshares(sliced, hidden, hiddenRecords);
  // A stream that returned a full batch may still have older rows we haven't
  // reached (tracked as `fetchedFull` during the per-chunk union above);
  // combined with leftover eligible overflow, that's "more to load".
  const hasMore = sliced.length > 0 && (ordered.length > PAGE_SIZE || fetchedFull);

  return {
    items: pageItems,
    nextCursor: hasMore && last ? encodeCursor({ ts: last.createdAt, id: last.id }) : null,
    hasMore,
  };
}

/**
 * Build one page of the activity feed.
 *
 * @param rawCursor opaque cursor from a previous page (null/undefined = first).
 * @param filter    restrict to one kind, or "all" for the unified merge.
 * @param following when set, scope the feed to records authored by accounts the
 *                  viewer follows (the "Following" tab). Donations are omitted.
 */
export async function buildActivityFeed(
  rawCursor?: string | null,
  filter: ActivityFeedFilter = "all",
  following?: FollowingScope | null,
): Promise<ActivityFeedPage> {
  const cursor = decodeCursor(rawCursor);
  const scopeKey = following ? `follow:${following.viewerDid}` : "global";
  const key = `activity-feed:v2:${filter}:${scopeKey}:${rawCursor ?? "start"}`;
  return cachedAsync(key, FEED_CACHE_MS, async () => {
    const page = await buildFeedPageUncached(cursor, filter, following ?? null);
    return applyPinnedPost(page, cursor, filter, following ?? null);
  });
}
