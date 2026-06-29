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
import { normaliseRef } from "./pds";
import { fetchHiddenAccountDids, indexerQuery, walkOccurrences, type OccurrenceRecord } from "./indexer";
import { fetchEngagement } from "./feed-engagement";

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

/**
 * Round schedule. Add the next round here when it opens; fill in the winners
 * once a round closes so the Winners section keeps a permanent record.
 */
export const BIOBLITZ_ROUNDS: BioblitzRound[] = [
  {
    id: 1,
    label: "Pilot Round",
    start: "2026-06-26T00:00:00.000Z",
    end: "2026-07-03T23:59:59.999Z",
    rsvpUrl: "https://luma.com/0yujr98x",
  },
];

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
export const BIOBLITZ_TAG = "bioblitz";

/** Round-specific join tag, e.g. "bioblitz-round-1". Detection keys on this so
 *  registering is per-round (a new round needs a fresh join post). */
export function bioblitzRoundTag(round: BioblitzRound): string {
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
  return BIOBLITZ_ROUNDS.filter((r) => roundStatus(r, now) === "ended").sort(
    (a, b) => Date.parse(b.start) - Date.parse(a.start),
  );
}

/**
 * The round to feature at the top of the page: the live round if one is
 * running, otherwise the next upcoming round, otherwise the most recent ended
 * round. Falls back to the last configured round if the schedule is empty-ish.
 */
export function featuredRound(now: number = Date.now()): BioblitzRound {
  const live = BIOBLITZ_ROUNDS.find((r) => roundStatus(r, now) === "live");
  if (live) return live;
  const upcoming = BIOBLITZ_ROUNDS.filter((r) => roundStatus(r, now) === "upcoming").sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start),
  );
  if (upcoming[0]) return upcoming[0];
  const ended = endedRounds(now);
  return ended[0] ?? BIOBLITZ_ROUNDS[BIOBLITZ_ROUNDS.length - 1]!;
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

export type RoundBoard = {
  collectors: RoundCollector[];
  /** Total valid observations uploaded inside the round window. */
  totalObservations: number;
  /** Distinct collectors who uploaded at least one observation. */
  collectorCount: number;
};

type RawNode = {
  did?: string | null;
  createdAt?: string | null;
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
          createdAt
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

/**
 * Tally the collectors who uploaded photo observations.
 *
 * Scope "round" counts image-bearing occurrences inside the round window
 * (created on/after the round start, filtered to the round end client-side).
 * Scope "all" counts every image observation in the program, newest-first, so
 * the board can show the most active collectors overall. A round is one week,
 * so a single page usually covers it; we walk a few pages defensively.
 */
export async function fetchRoundCollectors(
  round: BioblitzRound,
  scope: BoardScope = "round",
  signal?: AbortSignal,
): Promise<RoundBoard> {
  const startMs = scope === "all" ? Number.NEGATIVE_INFINITY : Date.parse(round.start);
  const endMs = scope === "all" ? Number.POSITIVE_INFINITY : Date.parse(round.end);
  // The whole `where` is passed as a typed variable (matching indexer.ts) so the
  // `createdAt` DateTime bound coerces correctly from its JSON string value.
  const where =
    scope === "all"
      ? { imageEvidence: { isNull: false } }
      : { imageEvidence: { isNull: false }, createdAt: { gte: round.start } };

  // Accounts a steward flagged as "test" are excluded from the challenge — they
  // don't count toward the leaderboard, totals or prize eligibility.
  const hidden = await fetchHiddenAccountDids(signal).catch(() => new Set<string>());

  const tally = new Map<string, RoundCollector>();
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
      if (hidden.has(did)) continue;
      const t = Date.parse(n.createdAt ?? "");
      if (!Number.isFinite(t) || t < startMs || t > endMs) continue;
      total += 1;
      const existing = tally.get(did);
      if (existing) {
        existing.count += 1;
        if (!existing.displayName) existing.displayName = profileName(n);
        if (!existing.avatarRef) existing.avatarRef = profileAvatarRef(n);
      } else {
        tally.set(did, {
          did,
          count: 1,
          displayName: profileName(n),
          avatarRef: profileAvatarRef(n),
        });
      }
    }

    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }

  const collectors = [...tally.values()].sort(
    (a, b) => b.count - a.count || (a.displayName ?? "").localeCompare(b.displayName ?? ""),
  );

  return {
    collectors,
    totalObservations: total,
    collectorCount: collectors.length,
  };
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
    signal,
  });
  return records.filter((r) => {
    const t = Date.parse(r.createdAt);
    return Number.isFinite(t) && t >= startMs && t <= endMs;
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
