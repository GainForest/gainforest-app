/**
 * Weekly BioBlitz Challenge data layer (/bioblitz).
 *
 * The challenge runs in fixed rounds (a calendar week each). Two prizes are
 * awarded every round:
 *   - "Most observations" — the collector with the most valid nature sightings
 *     uploaded inside the round window.
 *   - "Best picture" — a judged pick of the most compelling biodiversity photo
 *     (decided by hand once the round closes).
 *
 * Everything the live leaderboard needs comes from the GainForest indexer:
 * image-evidence occurrences (`app.gainforest.dwc.occurrence`) created inside
 * the round window, tallied per uploader. Hyperindex serves
 * `access-control-allow-origin: *`, so the board fetches straight from the
 * browser (same approach as indexer.ts / the leaderboard).
 */

import { INDEXER_URL } from "./urls";
import { normaliseRef, resolveBlobUrl } from "./pds";
import {
  GAINFOREST_MODERATION_REPO_DID,
  fetchHiddenRecordUris,
  fetchPublicHiddenAccountDids,
  indexerQuery,
  walkOccurrences,
  type OccurrenceRecord,
} from "./indexer";
import { parseRecognitionBadgeKey, recognitionKeyFromTitle } from "./recognition-badges";
import { fetchEngagement } from "./feed-engagement";
import {
  classifyBioblitzImage,
  isEligibleBioblitzCategory,
  type BioblitzImageCategory,
} from "./bioblitz-eligibility";
import {
  fetchBioblitzExclusions,
  fetchBioblitzExclusionsStrict,
  indexBioblitzExclusions,
  isAccountExcludedFromBioblitzRound,
} from "./bioblitz-exclusions";

/** Cash prizes awarded each round, in USD. */
export const BIOBLITZ_PRIZES = {
  /** Collector with the most valid observations in the round. */
  mostObservations: 40,
  /** Judged best biodiversity photo of the round. */
  bestPicture: 10,
} as const;

/** A confirmed winner of one of the round prizes. The DID is resolved to a
 *  display name in the UI, so no technical identifier is ever shown. */
export type RoundWinner = {
  did: string;
  /** Final observation count, when relevant (the "most observations" prize). */
  count?: number;
  /** Exact winning observation, when relevant (the "best picture" prize). */
  winningObservationUri?: string;
};

export type BioblitzRound = {
  id: number;
  /** Plain-language label, e.g. "Round 1 · Pilot". */
  label: string;
  /** Inclusive UTC start instant (ISO). */
  start: string;
  /** Inclusive UTC end instant (ISO) — the final moment of the last day. */
  end: string;
  /** Legacy external registration page (Luma). No longer used by the UI —
   *  registration now happens in-app by publishing a join post (see
   *  fetchBioblitzRegistration / the Register button). Kept only for reference. */
  rsvpUrl?: string;
  /** Set once the round closes and the observations winner is confirmed. */
  mostObservations?: RoundWinner | null;
  /** Set once the round's best-picture pick is confirmed. */
  bestPicture?: RoundWinner | null;
};

const DAY_MS = 86_400_000;
const STANDARD_ROUND_MS = 7 * DAY_MS;
const FIRST_ROUND_START = "2026-06-26T00:00:00.000Z";
const FIRST_ROUND_END = "2026-07-03T23:59:59.999Z";
const FIRST_ROUND_END_MS = Date.parse(FIRST_ROUND_END);
const SECOND_ROUND_START_MS = FIRST_ROUND_END_MS + 1;

/**
 * Hand-maintained round metadata. The schedule itself continues weekly so the
 * page always has a current round; add overrides here only for special labels
 * or confirmed prize records.
 *
 * Pinning winners: set `mostObservations` / `bestPicture` on a round to freeze
 * that prize by hand. A pinned value takes precedence over both the badge
 * awards and the live recomputation (see `frozenWinnersFor`); an explicit
 * `null` means "confirmed: no winner for this prize".
 */
const BIOBLITZ_ROUND_OVERRIDES: Record<number, Partial<BioblitzRound>> = {
  1: {
    label: "Pilot Round",
    start: FIRST_ROUND_START,
    end: FIRST_ROUND_END,
    rsvpUrl: "https://luma.com/0yujr98x",
  },
};

function generatedRound(id: number): BioblitzRound {
  if (id <= 1) {
    return {
      id: 1,
      label: "Pilot Round",
      start: FIRST_ROUND_START,
      end: FIRST_ROUND_END,
      rsvpUrl: "https://luma.com/0yujr98x",
      ...BIOBLITZ_ROUND_OVERRIDES[1],
    };
  }
  const startMs = SECOND_ROUND_START_MS + (id - 2) * STANDARD_ROUND_MS;
  const endMs = startMs + STANDARD_ROUND_MS - 1;
  return {
    id,
    label: `Round ${id}`,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    ...BIOBLITZ_ROUND_OVERRIDES[id],
  };
}

function roundIdFor(now: number): number {
  if (now <= FIRST_ROUND_END_MS) return 1;
  return 2 + Math.floor(Math.max(0, now - SECOND_ROUND_START_MS) / STANDARD_ROUND_MS);
}

/**
 * Resolve a timestamp to its BioBlitz round. Dates before the program began do
 * not belong to a round; this matters when applying weekly exclusions to the
 * all-time standings.
 */
export function bioblitzRoundIdAt(timestamp: number): number | null {
  if (!Number.isFinite(timestamp) || timestamp < Date.parse(FIRST_ROUND_START)) return null;
  return roundIdFor(timestamp);
}

/** Rounds available to the UI, oldest first. Includes the current round and a
 *  small look-ahead so the page can show the next start near a boundary. */
export function bioblitzRounds(now: number = Date.now(), futureCount = 1): BioblitzRound[] {
  const lastId = Math.max(1, roundIdFor(now) + futureCount);
  return Array.from({ length: lastId }, (_, index) => generatedRound(index + 1));
}

/** Backwards-compatible snapshot for callers that only need the active schedule
 *  around module load. Prefer `bioblitzRounds()` for time-sensitive UI. */

/**
 * Program-wide support links (the same across rounds): a live "ask us anything"
 * office-hours calendar and the community chat for questions.
 */
export const BIOBLITZ_LINKS = {
  officeHours: "https://calendar.app.google/Ki7h3s5ufAXv4mr48",
  community: "https://t.me/+i15G35wxQT5jNTA1",
} as const;

// ── Registration ─────────────────────────────────────────────────────────────
//
// Taking part is opt-in: instead of an external sign-up form, a participant
// publishes a short feed post (app.gainforest.feed.post) announcing they're
// joining. The post carries two tags — a program-wide `bioblitz` tag plus a
// round-specific one — so the page can detect a participant's own join post and
// mark them registered automatically the next time the board loads.

/** Program-wide tag every join post carries. */
const BIOBLITZ_TAG = "bioblitz";

/** Round-specific join tag, e.g. "bioblitz-round-1". Detection keys on this so
 *  registering is per-round (a new round needs a fresh join post). */
function bioblitzRoundTag(round: BioblitzRound): string {
  return `${BIOBLITZ_TAG}-round-${round.id}`;
}

/** Both tags a join post is published with, newest round-specific tag first. */
export function bioblitzJoinTags(round: BioblitzRound): string[] {
  return [BIOBLITZ_TAG, bioblitzRoundTag(round)];
}

const REGISTRATION_QUERY = `
  query BioblitzRegistration($did: String!, $tag: String!) {
    appGainforestFeedPost(first: 1, where: { did: { eq: $did }, tags: { any: { eq: $tag } } }) {
      edges { node { uri } }
    }
  }
`;

/**
 * Detect whether `did` has already published a join post for this round.
 * Returns the post's AT-URI when found, otherwise null. Indexer ingestion lags
 * a write by a few seconds, so a freshly published join may not be detected for
 * a moment — callers treat a just-completed publish as registered optimistically.
 */
export async function fetchBioblitzRegistration(
  round: BioblitzRound,
  did: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const data = await indexerQuery<{
    appGainforestFeedPost?: { edges?: Array<{ node?: { uri?: string | null } | null } | null> | null } | null;
  }>(REGISTRATION_QUERY, { did, tag: bioblitzRoundTag(round) }, signal).catch(() => null);
  const uri = data?.appGainforestFeedPost?.edges?.[0]?.node?.uri;
  return typeof uri === "string" && uri.length > 0 ? uri : null;
}

export type RoundStatus = "upcoming" | "live" | "ended";

export function roundStatus(round: BioblitzRound, now: number = Date.now()): RoundStatus {
  const start = Date.parse(round.start);
  const end = Date.parse(round.end);
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "live";
}

/** Rounds that have already finished, newest first — used by the Winners list. */
export function endedRounds(now: number = Date.now()): BioblitzRound[] {
  return bioblitzRounds(now, 0)
    .filter((r) => roundStatus(r, now) === "ended")
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
}

/**
 * The round to feature at the top of the page: the live round if one is
 * running, otherwise the next upcoming round, otherwise the most recent ended
 * round. Falls back to the latest generated round if the schedule is empty-ish.
 */
export function featuredRound(now: number = Date.now()): BioblitzRound {
  const rounds = bioblitzRounds(now);
  const live = rounds.find((r) => roundStatus(r, now) === "live");
  if (live) return live;
  const upcoming = rounds
    .filter((r) => roundStatus(r, now) === "upcoming")
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (upcoming[0]) return upcoming[0];
  const ended = endedRounds(now);
  return ended[0] ?? rounds[rounds.length - 1]!;
}

/** Whole-day, ms-precise countdown breakdown to a target instant. */
export type Countdown = { days: number; hours: number; minutes: number; total: number };

export function countdownTo(targetIso: string, now: number = Date.now()): Countdown {
  const total = Math.max(0, Date.parse(targetIso) - now);
  const days = Math.floor(total / 86_400_000);
  const hours = Math.floor((total % 86_400_000) / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  return { days, hours, minutes, total };
}

// ── Late-upload guard ────────────────────────────────────────────────────────
//
// A record's `createdAt` is written by the client, so bulk imports and agents
// can publish records long after a round closed with a `createdAt` dated
// inside it — silently rewriting an ended round's standings. To keep ended
// rounds stable, a round tally also checks *when the record was actually
// published*, derived from its rkey:
//   - PDS-generated rkeys are TIDs, which encode the server-side creation
//     microtime.
//   - This app's importers use `obs-<epoch-ms>` rkeys, minted at upload time.
// Records published after the round's grace window are excluded from that
// round's tally. Records whose rkey encodes no timestamp are kept — this is a
// drift guard for honest-but-late data, not a security boundary.

/** How long after a round ends a late upload still counts toward it. Covers
 *  offline field work syncing when connectivity returns and indexer lag. */
export const BIOBLITZ_LATE_UPLOAD_GRACE_MS = 48 * 3_600_000;

const TID_CHARS = "234567abcdefghijklmnopqrstuvwxyz";
/** 13 chars of base32-sortable; the leading char is capped because a TID's
 *  top bit is always 0. */
const TID_RE = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/;
const OBS_RKEY_RE = /^obs-(\d{10,16})(?:\D|$)/;

/**
 * Best-effort publish instant (epoch ms) encoded in a record's rkey, or null
 * when the rkey carries no recognisable timestamp.
 */
export function bioblitzPublishTimeMs(rkey: string | null | undefined): number | null {
  const key = rkey?.trim();
  if (!key) return null;
  if (TID_RE.test(key)) {
    let value = 0n;
    for (const ch of key) value = (value << 5n) | BigInt(TID_CHARS.indexOf(ch));
    const ms = Number(value >> 10n) / 1000; // timestamp bits are microseconds
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  const match = OBS_RKEY_RE.exec(key);
  if (match) {
    const ms = Number.parseInt(match[1]!, 10);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  return null;
}

/** True when a record may count toward a round ending at `roundEndMs`: it was
 *  published inside the round's grace window, or its publish time is unknown. */
export function isWithinRoundUploadWindow(
  rkey: string | null | undefined,
  roundEndMs: number,
): boolean {
  if (!Number.isFinite(roundEndMs)) return true;
  const publishedMs = bioblitzPublishTimeMs(rkey);
  return publishedMs === null || publishedMs <= roundEndMs + BIOBLITZ_LATE_UPLOAD_GRACE_MS;
}

// ── Live leaderboard ────────────────────────────────────────────────────────

/** A collector on the round board, with everything the UI needs to render a
 *  row without a second lookup (name + avatar come from the indexer; the DID is
 *  only used internally to resolve a richer profile/avatar). */
export type RoundCollector = {
  did: string;
  count: number;
  displayName: string | null;
  avatarRef: string | null;
};

export type RoundImageCounts = Record<BioblitzImageCategory, number> & {
  /** Non-null imageEvidence wrappers that did not contain a usable blob ref. */
  missingPhoto: number;
};

export type RoundBoard = {
  collectors: RoundCollector[];
  /**
   * Present only for administrative reads that need to show a contributor's
   * eligible observation count before weekly leaderboard exclusions apply.
   */
  unfilteredCollectors?: RoundCollector[];
  /** Total eligible wildlife + outdoor plant observations. */
  totalObservations: number;
  /** Breakdown of automatically classified image observations. */
  imageCounts: RoundImageCounts;
  /** Distinct collectors who uploaded at least one eligible observation. */
  collectorCount: number;
};

type RawNode = {
  did?: string | null;
  rkey?: string | null;
  uri?: string | null;
  createdAt?: string | null;
  occurrenceRemarks?: string | null;
  fieldNotes?: string | null;
  scientificName?: string | null;
  vernacularName?: string | null;
  kingdom?: string | null;
  imageEvidence?: { file?: { ref?: string | null } | null } | null;
  certifiedProfileData?: {
    displayName?: string | null;
    avatar?: { image?: { ref?: string | null } | null } | null;
  } | null;
};

const ROUND_COLLECTORS_QUERY = `
  query BioblitzRoundCollectors($first: Int!, $after: String, $where: AppGainforestDwcOccurrenceWhereInput) {
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
          did
          rkey
          uri
          createdAt
          occurrenceRemarks
          fieldNotes
          scientificName
          vernacularName
          kingdom
          imageEvidence { file { ref } }
          certifiedProfileData {
            displayName
            avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
          }
        }
      }
    }
  }
`;

const MAX_PAGES = 6;
const PAGE_SIZE = 1000;

/** Which window the board tallies: just the active round, or every observation
 *  contributed to the challenge so far. */
export type BoardScope = "round" | "all";

type FetchRoundCollectorsOptions = {
  /** Keep a second tally before round-specific exclusion records are applied. */
  includeExcluded?: boolean;
};

/**
 * Tally the collectors who uploaded photo observations.
 *
 * Scope "round" counts image-bearing occurrences inside the exact round window.
 * Scope "all" counts every image observation in the program, newest-first, so
 * the board can show the most active collectors overall. A round is one week,
 * so a single page usually covers it; we walk a few pages defensively.
 */
export async function fetchRoundCollectors(
  round: BioblitzRound,
  scope: BoardScope = "round",
  signal?: AbortSignal,
  exclusionRead: "best-effort" | "required" = "best-effort",
  options?: FetchRoundCollectorsOptions,
): Promise<RoundBoard> {
  const startMs = scope === "all" ? Number.NEGATIVE_INFINITY : Date.parse(round.start);
  const endMs = scope === "all" ? Number.POSITIVE_INFINITY : Date.parse(round.end);
  // The whole `where` is passed as a typed variable (matching indexer.ts) so the
  // `createdAt` DateTime bound coerces correctly from its JSON string value.
  const where =
    scope === "all"
      ? { imageEvidence: { isNull: false } }
      : { imageEvidence: { isNull: false }, createdAt: { gte: round.start, lte: round.end } };

  // Accounts and individual observations a steward hid — and every account on
  // a blocked server address — are excluded from the challenge. The explicit
  // file-ref check below is also important: a non-null imageEvidence wrapper
  // alone is not proof that an image blob was uploaded.
  const exclusionPromise =
    exclusionRead === "required"
      ? fetchBioblitzExclusionsStrict(signal)
      : fetchBioblitzExclusions(signal).catch(() => []);
  const [hidden, hiddenRecords, exclusionRecords] = await Promise.all([
    fetchPublicHiddenAccountDids(signal).catch(() => new Set<string>()),
    fetchHiddenRecordUris(signal).catch(() => new Set<string>()),
    exclusionPromise,
  ]);
  const exclusions = indexBioblitzExclusions(exclusionRecords);

  const tally = new Map<string, RoundCollector>();
  const unfilteredTally = options?.includeExcluded ? new Map<string, RoundCollector>() : null;
  const imageCounts: RoundImageCounts = {
    wildlife: 0,
    plant: 0,
    person: 0,
    "potted-plant": 0,
    indoors: 0,
    unclassified: 0,
    missingPhoto: 0,
  };
  let total = 0;
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: ROUND_COLLECTORS_QUERY,
        variables: { first: PAGE_SIZE, after, where },
      }),
      signal,
    });
    let json: {
      data?: {
        appGainforestDwcOccurrence?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
          edges?: Array<{ node?: RawNode | null } | null> | null;
        } | null;
      } | null;
    };
    try {
      json = await res.json();
    } catch {
      break;
    }
    const conn = json.data?.appGainforestDwcOccurrence;
    const nodes = (conn?.edges ?? [])
      .map((e) => e?.node)
      .filter((n): n is RawNode => Boolean(n?.did));

    for (const n of nodes) {
      const did = n.did!;
      const uri = n.uri?.trim();
      if (hidden.has(did) || (uri && hiddenRecords.has(uri))) continue;
      const t = Date.parse(n.createdAt ?? "");
      if (!Number.isFinite(t) || t < startMs || t > endMs) continue;
      const observationRoundId = scope === "round" ? round.id : bioblitzRoundIdAt(t);
      const excluded = isAccountExcludedFromBioblitzRound(exclusions, did, observationRoundId);
      // Backdating guard: skip records actually published well after the round.
      if (scope === "round" && !isWithinRoundUploadWindow(n.rkey, endMs)) continue;

      const imageRef = normaliseRef(n.imageEvidence?.file?.ref);
      if (!imageRef) {
        // Keep the public board exactly as it was: ignored accounts do not
        // influence any leaderboard metric. The optional admin tally only
        // needs eligible, image-backed observations.
        if (!excluded) imageCounts.missingPhoto += 1;
        continue;
      }
      const category = classifyBioblitzImage({
        notes: n.occurrenceRemarks?.trim() || n.fieldNotes?.trim() || null,
        scientificName: n.scientificName,
        vernacularName: n.vernacularName,
        kingdom: n.kingdom,
      });
      if (!excluded) imageCounts[category] += 1;
      if (!isEligibleBioblitzCategory(category)) continue;

      if (unfilteredTally) incrementRoundCollector(unfilteredTally, did, n);
      if (excluded) continue;

      total += 1;
      incrementRoundCollector(tally, did, n);
    }

    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }

  const collectors = sortRoundCollectors(tally);

  return {
    collectors,
    ...(unfilteredTally ? { unfilteredCollectors: sortRoundCollectors(unfilteredTally) } : {}),
    totalObservations: total,
    imageCounts,
    collectorCount: collectors.length,
  };
}

function incrementRoundCollector(tally: Map<string, RoundCollector>, did: string, node: RawNode): void {
  const existing = tally.get(did);
  if (existing) {
    existing.count += 1;
    if (!existing.displayName) existing.displayName = profileName(node);
    if (!existing.avatarRef) existing.avatarRef = profileAvatarRef(node);
    return;
  }
  tally.set(did, {
    did,
    count: 1,
    displayName: profileName(node),
    avatarRef: profileAvatarRef(node),
  });
}

function sortRoundCollectors(tally: Map<string, RoundCollector>): RoundCollector[] {
  return [...tally.values()].sort(
    (a, b) => b.count - a.count || (a.displayName ?? "").localeCompare(b.displayName ?? ""),
  );
}

// ── Round observations (for the map) ─────────────────────────────────────────

/** How many newest photo sightings to scan when collecting a round's window.
 *  A round is one week, so the newest page comfortably covers it. */
const ROUND_MAP_TARGET = 1000;

/**
 * Fetch the photo sightings uploaded inside a round's window, as full records
 * the map can plot. Walks the newest image occurrences (the round is the most
 * recent week, so they sit at the top) and keeps those created on/after the
 * round start and on/before its end. The map filters these to the ones that
 * carry coordinates.
 */
export async function fetchRoundObservations(
  round: BioblitzRound,
  signal?: AbortSignal,
): Promise<OccurrenceRecord[]> {
  const startMs = Date.parse(round.start);
  const endMs = Date.parse(round.end);
  const { records } = await walkOccurrences({
    media: "image",
    target: ROUND_MAP_TARGET,
    after: null,
    resolveMedia: false,
    featuredBadgesOnly: false,
    createdAt: { gte: round.start, lte: round.end },
    signal,
  });
  return records.filter((r) => {
    const t = Date.parse(r.createdAt);
    return (
      Number.isFinite(t) &&
      t >= startMs &&
      t <= endMs &&
      isWithinRoundUploadWindow(r.rkey, endMs) &&
      isEligibleBioblitzCategory(
        classifyBioblitzImage({
          notes: r.remarks,
          scientificName: r.scientificName,
          vernacularName: r.vernacularName,
          kingdom: r.kingdom,
        }),
      )
    );
  });
}

// ── Best-picture front-runners (most-liked observations) ─────────────────────
//
// The "best picture" prize is judged once a round closes, but the page surfaces
// the photos drawing the most community likes so far — the front-runners for
// that prize. Likes are app.gainforest.feed.like records keyed by an
// observation's AT-URI (see feed-engagement.ts), so we tally the round's photo
// sightings and keep the most-liked ones.

/** A round photo sighting plus its current like tally. */
export type LikedObservation = {
  record: OccurrenceRecord;
  likeCount: number;
};

/**
 * The most-liked photo sightings uploaded inside a round's window — the
 * front-runners for the round's "best picture" prize. Reuses
 * `fetchRoundObservations` (the same call the gallery and map make, so the
 * shared cache serves all three) and batch-counts likes for the window, keeping
 * the top `limit` records that have at least one like. Returns an empty list
 * until photos start collecting likes.
 */
export async function fetchRoundTopLiked(
  round: BioblitzRound,
  limit = 3,
  signal?: AbortSignal,
): Promise<LikedObservation[]> {
  const observations = await fetchRoundObservations(round, signal);
  if (observations.length === 0) return [];
  const engagement = await fetchEngagement(
    observations.map((o) => o.atUri),
    null,
    signal,
  );
  return observations
    .map((record) => ({ record, likeCount: engagement.get(record.atUri)?.likeCount ?? 0 }))
    .filter((entry) => entry.likeCount > 0)
    .sort(
      (a, b) =>
        b.likeCount - a.likeCount || Date.parse(b.record.createdAt) - Date.parse(a.record.createdAt),
    )
    .slice(0, limit);
}

function profileName(n: RawNode): string | null {
  return n.certifiedProfileData?.displayName?.trim() || null;
}

function profileAvatarRef(n: RawNode): string | null {
  return normaliseRef(n.certifiedProfileData?.avatar?.image?.ref);
}

// ── Organisation membership ──────────────────────────────────────────────────────────────────
//
// In this stack, observations are written to an organisation's shared account,
// so a top collector is usually an organisation. For each collector we resolve
// whether the account is a certified organisation, its type (nonprofit /
// business / …), and how many people are on its member roster — enough to label
// the leaderboard card with its organisational membership without ever showing
// a technical identifier.

export type CollectorOrg = {
  /** True when the account is a certified organisation (or has a roster). */
  isOrganization: boolean;
  /** Lowercased organisation-type token (e.g. "nonprofit"), when known. */
  orgType: string | null;
  /** Number of people on the organisation's member roster. */
  memberCount: number;
};

const COLLECTOR_ORG_QUERY = `
  query BioblitzCollectorOrg($did: String!) {
    org: appCertifiedActorOrganization(where: { did: { eq: $did } }) {
      totalCount
      edges { node { organizationType } }
    }
    members: appGainforestOrganizationMember(first: 0, where: { did: { eq: $did } }) {
      totalCount
    }
  }
`;

/**
 * Resolve organisation membership for a set of collector accounts (the rendered
 * top of the board). One small aliased query per account, run with bounded
 * concurrency; failures degrade to "no label" rather than breaking the board.
 */
export async function fetchCollectorOrgs(
  dids: string[],
  signal?: AbortSignal,
): Promise<Map<string, CollectorOrg>> {
  const out = new Map<string, CollectorOrg>();
  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < dids.length) {
      const did = dids[cursor++]!;
      try {
        const res = await fetch(INDEXER_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: COLLECTOR_ORG_QUERY, variables: { did } }),
          signal,
        });
        const json = (await res.json()) as {
          data?: {
            org?: { totalCount?: number; edges?: Array<{ node?: { organizationType?: unknown } | null } | null> | null } | null;
            members?: { totalCount?: number } | null;
          } | null;
        };
        const org = json.data?.org;
        const members = json.data?.members;
        out.set(did, {
          isOrganization: (org?.totalCount ?? 0) > 0 || (members?.totalCount ?? 0) > 0,
          orgType: normalizeOrgType(org?.edges?.[0]?.node?.organizationType),
          memberCount: members?.totalCount ?? 0,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, dids.length) }, worker));
  return out;
}

function normalizeOrgType(value: unknown): string | null {
  const token = Array.isArray(value) ? value[0] : value;
  if (typeof token !== "string") return null;
  const trimmed = token.trim().toLowerCase();
  return trimmed || null;
}

// ── Frozen past winners ─────────────────────────────────────────────────────────
//
// Once a moderator awards a round's winner badges (see
// app/api/internal/bioblitz-awards), those award records become the permanent
// source of truth for that round's winners. The past-winners UI prefers, in
// order:
//   1. a hand-pinned winner in BIOBLITZ_ROUND_OVERRIDES,
//   2. the badge award recorded in the moderation repo,
//   3. (fallback only) the live recomputation — which can drift as data,
//      likes, and moderation change after the round.
// This keeps ended rounds stable instead of silently changing later.

/** A winner frozen by a badge award or a hand-pinned override. */
export type FrozenWinner = {
  did: string;
  /** Final tally captured at award time (parsed from the award note), when
   *  known. Null when the award carries no count (e.g. best picture). */
  count: number | null;
};

export type FrozenRoundWinners = {
  /** `undefined` = not frozen yet (a live, provisional stand-in may be shown);
   *  `null` = frozen with confirmed no winner. */
  mostObservations?: FrozenWinner | null;
  bestPicture?: FrozenWinner | null;
};

type RawWinnerBadgeDefinition = { uri?: string | null; title?: string | null };
type RawWinnerBadgeAward = {
  note?: string | null;
  badge?: { uri?: string | null } | null;
  subject?: { __typename?: string; did?: string | null } | null;
};
type WinnerAwardsPayload = {
  appCertifiedBadgeDefinition?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    edges?: Array<{ node?: RawWinnerBadgeDefinition | null } | null> | null;
  } | null;
  appCertifiedBadgeAward?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    edges?: Array<{ node?: RawWinnerBadgeAward | null } | null> | null;
  } | null;
};

const WINNER_AWARDS_QUERY = `
  query BioblitzWinnerAwards($repo: String!, $first: Int!, $afterDefinitions: String, $afterAwards: String) {
    appCertifiedBadgeDefinition(
      first: $first
      after: $afterDefinitions
      where: { did: { eq: $repo } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { uri title } }
    }
    appCertifiedBadgeAward(
      first: $first
      after: $afterAwards
      where: { did: { eq: $repo } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          note
          badge { uri }
          subject { __typename ... on AppCertifiedDefsDid { did } }
        }
      }
    }
  }
`;

/** Final tally embedded in an award note, e.g. "… most observations (12)." */
function countFromAwardNote(note: string | null | undefined): number | null {
  const match = /\((\d+)\)/.exec(note ?? "");
  if (!match) return null;
  const count = Number.parseInt(match[1]!, 10);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

/**
 * The round winners recorded as badge awards in the GainForest moderation
 * repo, keyed by round id. Awards are scanned newest-first; when duplicates
 * exist, the oldest award (the original decision) wins. Returns an empty map
 * on any error so the UI can fall back to the live computation.
 */
export async function fetchBioblitzWinnerAwards(
  signal?: AbortSignal,
): Promise<Map<number, FrozenRoundWinners>> {
  const definitions: RawWinnerBadgeDefinition[] = [];
  const awards: RawWinnerBadgeAward[] = [];
  let afterDefinitions: string | null = null;
  let afterAwards: string | null = null;

  for (let page = 0; page < 10; page += 1) {
    const collectDefinitions: boolean = page === 0 || Boolean(afterDefinitions);
    const payload: WinnerAwardsPayload | null = await indexerQuery<WinnerAwardsPayload>(
      WINNER_AWARDS_QUERY,
      {
        repo: GAINFOREST_MODERATION_REPO_DID,
        first: 200,
        afterDefinitions,
        afterAwards,
      },
      signal,
    ).catch(() => null);
    if (!payload) break;

    const definitionsPage: WinnerAwardsPayload["appCertifiedBadgeDefinition"] = payload.appCertifiedBadgeDefinition;
    const awardsPage: WinnerAwardsPayload["appCertifiedBadgeAward"] = payload.appCertifiedBadgeAward;
    if (collectDefinitions) {
      definitions.push(
        ...(definitionsPage?.edges ?? []).flatMap((edge): RawWinnerBadgeDefinition[] =>
          edge?.node ? [edge.node] : [],
        ),
      );
    }
    awards.push(
      ...(awardsPage?.edges ?? []).flatMap((edge): RawWinnerBadgeAward[] => (edge?.node ? [edge.node] : [])),
    );

    afterDefinitions =
      collectDefinitions && definitionsPage?.pageInfo?.hasNextPage
        ? definitionsPage.pageInfo.endCursor ?? null
        : null;
    afterAwards = awardsPage?.pageInfo?.hasNextPage ? awardsPage.pageInfo.endCursor ?? null : null;
    if (!afterDefinitions && !afterAwards) break;
  }

  // Badge-definition uri -> the round-scoped BioBlitz prize it stands for.
  const prizeByDefinition = new Map<string, { prize: "most-images" | "best-picture"; roundId: number }>();
  for (const definition of definitions) {
    if (!definition.uri || !definition.title) continue;
    const key = recognitionKeyFromTitle(definition.title);
    const parsed = key ? parseRecognitionBadgeKey(key) : null;
    if (parsed?.family === "bioblitz" && parsed.roundId !== null) {
      prizeByDefinition.set(definition.uri, { prize: parsed.prize, roundId: parsed.roundId });
    }
  }

  const out = new Map<number, FrozenRoundWinners>();
  // Iterating newest-first and overwriting means the oldest award ends up kept.
  for (const award of awards) {
    const badgeUri = award.badge?.uri;
    const meta = badgeUri ? prizeByDefinition.get(badgeUri) : undefined;
    if (!meta) continue;
    const subject = award.subject;
    if (subject?.__typename !== "AppCertifiedDefsDid" || !subject.did) continue;
    const entry = out.get(meta.roundId) ?? {};
    const winner: FrozenWinner = { did: subject.did, count: countFromAwardNote(award.note) };
    if (meta.prize === "most-images") entry.mostObservations = winner;
    else entry.bestPicture = winner;
    out.set(meta.roundId, entry);
  }
  return out;
}

function frozenFromOverride(value: RoundWinner | null): FrozenWinner | null {
  return value ? { did: value.did, count: value.count ?? null } : null;
}

/**
 * Resolve a round's frozen winners: hand-pinned overrides first, then the
 * badge awards recorded when the round was decided. A prize left `undefined`
 * here is not yet frozen — the UI may show a live, provisional stand-in.
 */
export function frozenWinnersFor(
  round: BioblitzRound,
  awards: Map<number, FrozenRoundWinners> | null,
): FrozenRoundWinners {
  const awarded = awards?.get(round.id);
  return {
    mostObservations:
      round.mostObservations !== undefined
        ? frozenFromOverride(round.mostObservations)
        : awarded?.mostObservations,
    bestPicture:
      round.bestPicture !== undefined ? frozenFromOverride(round.bestPicture) : awarded?.bestPicture,
  };
}

// ── Registrants (admin review) ───────────────────────────────────────────────

export type BioblitzRegistrant = {
  did: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** When they published their most recent join post. */
  createdAt: string;
};

type RawRegistrantNode = {
  did?: string | null;
  createdAt?: string | null;
  certifiedProfileData?: {
    displayName?: string | null;
    avatar?: { image?: { ref?: string | null } | null } | null;
  } | null;
};

type BioblitzRegistrantsResponse = {
  appGainforestFeedPost?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    edges?: Array<{ node?: RawRegistrantNode | null } | null> | null;
  } | null;
};

const MAX_BIOBLITZ_REGISTRANT_PAGES = 25;
const REGISTRANT_AVATAR_CONCURRENCY = 8;

const REGISTRANTS_QUERY = `
  query BioblitzRegistrants($first: Int!, $after: String, $tag: String!) {
    appGainforestFeedPost(
      first: $first
      after: $after
      where: { tags: { any: { eq: $tag } } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did createdAt
          certifiedProfileData {
            displayName
            avatar { __typename ... on OrgHypercertsDefsSmallImage { image { ref } } }
          }
        }
      }
    }
  }
`;

/**
 * Every account that registered for the BioBlitz (published a join post),
 * newest first, de-duplicated to one row per account. Scans the program-wide
 * `bioblitz` tag so it covers all rounds. It fails rather than silently showing
 * an incomplete roster if the bounded scan is exceeded.
 */
export function fetchBioblitzRegistrants(signal?: AbortSignal): Promise<BioblitzRegistrant[]> {
  return fetchBioblitzRegistrantsForTag(BIOBLITZ_TAG, signal);
}

/** Registrants who explicitly joined one BioBlitz round. */
export function fetchBioblitzRoundRegistrants(
  round: BioblitzRound,
  signal?: AbortSignal,
): Promise<BioblitzRegistrant[]> {
  return fetchBioblitzRegistrantsForTag(bioblitzRoundTag(round), signal);
}

async function fetchBioblitzRegistrantsForTag(
  tag: string,
  signal?: AbortSignal,
): Promise<BioblitzRegistrant[]> {
  const nodes: RawRegistrantNode[] = [];
  const seenCursors = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < MAX_BIOBLITZ_REGISTRANT_PAGES; page += 1) {
    const data: BioblitzRegistrantsResponse | null = await indexerQuery<BioblitzRegistrantsResponse>(
      REGISTRANTS_QUERY,
      { first: 100, after, tag },
      signal,
    );
    const connection: BioblitzRegistrantsResponse["appGainforestFeedPost"] = data?.appGainforestFeedPost;
    if (!connection) throw new Error("Could not load BioBlitz registrations.");

    nodes.push(...((connection.edges ?? []).flatMap((edge: { node?: RawRegistrantNode | null } | null) => (edge?.node ? [edge.node] : []))));
    if (!connection.pageInfo?.hasNextPage) break;
    const nextCursor: string | null = connection.pageInfo.endCursor ?? null;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error("Could not finish loading BioBlitz registrations.");
    }
    if (page === MAX_BIOBLITZ_REGISTRANT_PAGES - 1) {
      throw new Error("This BioBlitz roster is too large to load safely.");
    }
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  const seen = new Set<string>();
  const deduped: RawRegistrantNode[] = [];
  for (const node of nodes) {
    const did = node.did?.trim();
    if (!did || seen.has(did)) continue;
    seen.add(did);
    deduped.push(node);
  }

  const registrants: BioblitzRegistrant[] = new Array(deduped.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(REGISTRANT_AVATAR_CONCURRENCY, deduped.length) }, async () => {
    while (cursor < deduped.length) {
      const index = cursor++;
      const node = deduped[index]!;
      const did = node.did!.trim();
      const ref = node.certifiedProfileData?.avatar?.image?.ref ?? null;
      registrants[index] = {
        did,
        displayName: node.certifiedProfileData?.displayName?.trim() || null,
        avatarUrl: ref ? await resolveBlobUrl(did, ref).catch(() => null) : null,
        createdAt: node.createdAt ?? "",
      };
    }
  });
  await Promise.all(workers);
  return registrants;
}
