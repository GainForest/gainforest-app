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
  /** External registration page for the round (Luma). Registering is how a
   *  participant is tracked for prize eligibility. */
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

/**
 * Tally the collectors who uploaded photo observations inside a round window.
 * The query filters to image-bearing occurrences created on/after the round
 * start; the round end is applied client-side. A round is one week, so this is
 * almost always a single page, but we walk a few pages defensively.
 */
export async function fetchRoundCollectors(
  round: BioblitzRound,
  signal?: AbortSignal,
): Promise<RoundBoard> {
  const startMs = Date.parse(round.start);
  const endMs = Date.parse(round.end);
  // The whole `where` is passed as a typed variable (matching indexer.ts) so the
  // `createdAt` DateTime bound coerces correctly from its JSON string value.
  const where = { imageEvidence: { isNull: false }, createdAt: { gte: round.start } };

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

function profileName(n: RawNode): string | null {
  return n.certifiedProfileData?.displayName?.trim() || null;
}

function profileAvatarRef(n: RawNode): string | null {
  return normaliseRef(n.certifiedProfileData?.avatar?.image?.ref);
}
