"use client";

/**
 * Social-graph read layer + interaction hook over app.certified.graph.follow.
 *
 * The hyperindex exposes the follow collection as `appCertifiedGraphFollow`
 * (subject = the followed DID, did = the follower). Follower / following counts
 * come straight from `totalCount`; the viewer's own follow edge tells us whether
 * the follow button is "Follow" or "Following" and which record to delete on
 * unfollow. Writes land in the viewer's own repo and the indexer reconciles a
 * few seconds later, so the hook keeps an optimistic overlay in the meantime.
 */

import { useCallback, useEffect, useState } from "react";
import { indexerQuery } from "./indexer";
import { redirectToLogin } from "./auth-client";
import { useViewer } from "./viewer";
import { createFollow, deleteFollow } from "@/app/(manage)/manage/_lib/mutations";

export type FollowStats = {
  followers: number;
  following: number;
  /** AT-URI of the viewer's own follow record for this account, when following. */
  viewerFollowUri: string | null;
};

// ── Cross-surface sync ──────────────────────────────────────────────────────
// A follow toggle happens inside one hook instance, but it changes numbers on
// other surfaces too: the viewer's own profile shows a "following" count, and
// the same target account can be on screen twice (profile hero + hover card).
// Two mechanisms keep those in step without waiting for the indexer:
//   1. a broadcast — every successful toggle notifies all mounted subscribers;
//   2. a pending-toggle ledger — recent toggles the indexer may not have
//      reconciled yet are re-applied on top of freshly fetched stats, so a
//      page mounted right after a follow doesn't show the stale number.

export type FollowChange = {
  /** The signed-in account that followed / unfollowed. */
  viewerDid: string;
  /** The account that was followed / unfollowed. */
  targetDid: string;
  /** +1 for a follow, -1 for an unfollow. */
  delta: 1 | -1;
  /** The new follow record's AT-URI (follows only). */
  uri: string | null;
  /** The emitting hook instance, so it can skip its own broadcast. */
  origin: symbol;
};

const followChangeListeners = new Set<(change: FollowChange) => void>();

function emitFollowChange(change: FollowChange): void {
  for (const listener of [...followChangeListeners]) listener(change);
}

/** Be notified of follow / unfollow actions made anywhere in the app.
 *  Returns an unsubscribe function. */
export function subscribeFollowChanges(listener: (change: FollowChange) => void): () => void {
  followChangeListeners.add(listener);
  return () => {
    followChangeListeners.delete(listener);
  };
}

/** How long a toggle stays in the ledger while the indexer catches up. Entries
 *  clear sooner, as soon as a fetch shows the indexer knows about them. */
const PENDING_TOGGLE_TTL_MS = 2 * 60_000;

type PendingToggle = { viewerDid: string; delta: 1 | -1; uri: string | null; at: number };

/** Followed / unfollowed account DID → the signed-in viewer's most recent
 *  toggle of it that the indexer may not have caught up with yet. */
const pendingToggles = new Map<string, PendingToggle>();

function recordPendingToggle(viewerDid: string, targetDid: string, delta: 1 | -1, uri: string | null): void {
  pendingToggles.set(targetDid, { viewerDid, delta, uri, at: Date.now() });
}

const PENDING_EDGES_QUERY = `
  query PendingFollowEdges($viewer: String!, $subjects: [String!]!, $first: Int!) {
    appCertifiedGraphFollow(first: $first, where: { did: { eq: $viewer }, subject: { in: $subjects } }) {
      edges { node { subject } }
    }
  }
`;

/**
 * Overlay the pending-toggle ledger onto freshly fetched stats. One indexer
 * query checks which of the recently toggled follow edges the indexer already
 * knows about; toggles it hasn't caught up with adjust the fetched counts (the
 * viewer's own "following" count when this is their profile, and this target's
 * "followers" count / viewer edge), while toggles it has are cleared from the
 * ledger.
 */
async function applyPendingToggles(
  targetDid: string,
  stats: FollowStats,
  signal?: AbortSignal,
): Promise<FollowStats> {
  const now = Date.now();
  for (const [subject, entry] of pendingToggles) {
    if (now - entry.at > PENDING_TOGGLE_TTL_MS) pendingToggles.delete(subject);
  }
  if (pendingToggles.size === 0) return stats;

  // Every ledger entry belongs to the one signed-in viewer. Their "following"
  // count is only shown on their own profile, so those subjects only matter
  // when the profile being viewed is theirs.
  const viewerDid = [...pendingToggles.values()][0]!.viewerDid;
  const followingSubjects = viewerDid === targetDid ? [...pendingToggles.keys()] : [];
  const targetEntry = pendingToggles.get(targetDid) ?? null;
  const subjects = [...new Set([...followingSubjects, ...(targetEntry ? [targetDid] : [])])];
  if (subjects.length === 0) return stats;

  const data = await indexerQuery<{
    appCertifiedGraphFollow?: { edges?: Array<{ node?: { subject?: string | null } | null } | null> | null } | null;
  }>(PENDING_EDGES_QUERY, { viewer: viewerDid, subjects, first: subjects.length }, signal).catch(() => null);
  if (!data) return stats;
  const indexed = new Set(
    (data.appCertifiedGraphFollow?.edges ?? [])
      .map((edge) => edge?.node?.subject)
      .filter((subject): subject is string => Boolean(subject)),
  );

  const next = { ...stats };
  for (const subject of followingSubjects) {
    const entry = pendingToggles.get(subject);
    if (!entry) continue;
    if (entry.delta > 0 && !indexed.has(subject)) next.following += 1;
    else if (entry.delta < 0 && indexed.has(subject)) next.following = Math.max(0, next.following - 1);
    else pendingToggles.delete(subject);
  }
  if (targetEntry) {
    if (targetEntry.delta > 0 && !indexed.has(targetDid)) {
      next.followers += 1;
      next.viewerFollowUri = targetEntry.uri ?? "optimistic";
    } else if (targetEntry.delta < 0 && indexed.has(targetDid)) {
      next.followers = Math.max(0, next.followers - 1);
      next.viewerFollowUri = null;
    } else {
      pendingToggles.delete(targetDid);
    }
  }
  return next;
}

// The viewer edge is only queried when a viewer DID exists. We can't pass an
// empty string sentinel: the indexer ignores a falsy `eq` filter and would then
// return an unrelated follow record, falsely showing "Following" when signed out.
const COUNTS_QUERY = `
  query FollowCounts($target: String!) {
    followers: appCertifiedGraphFollow(first: 0, where: { subject: { eq: $target } }) {
      totalCount
    }
    following: appCertifiedGraphFollow(first: 0, where: { did: { eq: $target } }) {
      totalCount
    }
  }
`;

const COUNTS_WITH_VIEWER_QUERY = `
  query FollowStats($target: String!, $viewer: String!) {
    followers: appCertifiedGraphFollow(first: 0, where: { subject: { eq: $target } }) {
      totalCount
    }
    following: appCertifiedGraphFollow(first: 0, where: { did: { eq: $target } }) {
      totalCount
    }
    viewer: appCertifiedGraphFollow(first: 1, where: { did: { eq: $viewer }, subject: { eq: $target } }) {
      edges { node { uri } }
    }
  }
`;

type FollowStatsResponse = {
  followers?: { totalCount?: number | null } | null;
  following?: { totalCount?: number | null } | null;
  viewer?: { edges?: Array<{ node?: { uri?: string | null } | null } | null> | null } | null;
};

/** Fetch follower / following counts for a DID, plus the viewer's own follow
 *  record uri when `viewerDid` is signed in (pass null when signed out). */
export async function fetchFollowStats(
  targetDid: string,
  viewerDid: string | null,
  signal?: AbortSignal,
): Promise<FollowStats> {
  const data = await indexerQuery<FollowStatsResponse>(
    viewerDid ? COUNTS_WITH_VIEWER_QUERY : COUNTS_QUERY,
    viewerDid ? { target: targetDid, viewer: viewerDid } : { target: targetDid },
    signal,
  ).catch(() => null);

  const stats: FollowStats = {
    followers: data?.followers?.totalCount ?? 0,
    following: data?.following?.totalCount ?? 0,
    viewerFollowUri: data?.viewer?.edges?.[0]?.node?.uri ?? null,
  };
  // Re-apply the viewer's recent toggles the indexer hasn't reconciled yet, so
  // a page opened right after a follow shows the new count, not the stale one.
  return applyPendingToggles(targetDid, stats, signal);
}

function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? "";
}

// ── Connection lists (who follows / who they follow) ─────────────────────────

export type FollowConnection = { did: string; createdAt: string | null };

const FOLLOWERS_LIST_QUERY = `
  query FollowersList($target: String!, $first: Int!, $after: String) {
    appCertifiedGraphFollow(first: $first, after: $after, where: { subject: { eq: $target } }) {
      pageInfo { hasNextPage endCursor }
      edges { node { did createdAt } }
    }
  }
`;

const FOLLOWING_LIST_QUERY = `
  query FollowingList($target: String!, $first: Int!, $after: String) {
    appCertifiedGraphFollow(first: $first, after: $after, where: { did: { eq: $target } }) {
      pageInfo { hasNextPage endCursor }
      edges { node { subject createdAt } }
    }
  }
`;

type FollowListResponse = {
  appCertifiedGraphFollow?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    edges?: Array<{ node?: { did?: string | null; subject?: string | null; createdAt?: string | null } | null } | null> | null;
  } | null;
};

/**
 * Fetch one page of an account's followers (`direction: "followers"`, the
 * accounts that follow it) or following (`"following"`, the accounts it follows).
 * Returns the displayed account DID per row plus a cursor for the next page.
 */
export async function fetchFollowConnections(
  targetDid: string,
  direction: "followers" | "following",
  options: { cursor?: string | null; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ items: FollowConnection[]; nextCursor: string | null }> {
  const isFollowers = direction === "followers";
  const data = await indexerQuery<FollowListResponse>(
    isFollowers ? FOLLOWERS_LIST_QUERY : FOLLOWING_LIST_QUERY,
    { target: targetDid, first: options.limit ?? 30, after: options.cursor ?? null },
    signal,
  ).catch(() => null);

  const conn = data?.appCertifiedGraphFollow;
  const items: FollowConnection[] = [];
  for (const edge of conn?.edges ?? []) {
    const node = edge?.node;
    const did = isFollowers ? node?.did : node?.subject;
    if (!did) continue;
    items.push({ did, createdAt: node?.createdAt ?? null });
  }
  return {
    items,
    nextCursor: conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor ?? null : null,
  };
}

export type UseFollow = {
  /** "loading" until the first stats fetch resolves, then "ready". */
  status: "loading" | "ready";
  followers: number;
  following: number;
  isFollowing: boolean;
  /** The viewer is looking at their own account — hide the follow affordance. */
  isSelf: boolean;
  signedIn: boolean;
  /** A write is in flight. */
  busy: boolean;
  /** Follow / unfollow, with an optimistic overlay. Signed-out viewers are sent
   *  to login instead. */
  toggle: () => Promise<void>;
};

/**
 * Drive a follow button + counts for one account. Pass `null` to disable (e.g.
 * a chip with no DID); the hook then idles without fetching. The viewer is read
 * from the shared session store, so callers don't thread a sessionDid through.
 */
export function useFollow(targetDid: string | null): UseFollow {
  const viewer = useViewer();
  const sessionDid = viewer.sessionDid;
  const isSelf = Boolean(sessionDid && targetDid && sessionDid === targetDid);

  const [stats, setStats] = useState<FollowStats>({ followers: 0, following: 0, viewerFollowUri: null });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  // Identifies this hook instance in the follow-change broadcast, so it applies
  // its own toggles locally without also reacting to its own broadcast.
  const [origin] = useState(() => Symbol("useFollow"));

  // Mirror follow toggles made by other hook instances: another surface showing
  // this same account keeps its followers count + button in step, and when this
  // is the viewer's own profile its "following" count bumps immediately.
  useEffect(() => {
    if (!targetDid) return;
    return subscribeFollowChanges((change) => {
      if (change.origin === origin) return;
      setStats((prev) => {
        let next = prev;
        if (change.viewerDid === targetDid) {
          next = { ...next, following: Math.max(0, next.following + change.delta) };
        }
        if (change.targetDid === targetDid) {
          next = {
            ...next,
            followers: Math.max(0, next.followers + change.delta),
            viewerFollowUri: change.delta > 0 ? change.uri ?? "optimistic" : null,
          };
        }
        return next;
      });
    });
  }, [targetDid, origin]);

  // Refetch when the target or the resolved viewer changes. We wait for the
  // viewer to resolve so the very first fetch already knows whether the viewer
  // follows this account (no flash of the wrong button label).
  useEffect(() => {
    if (!targetDid || viewer.status !== "ready") return;
    let active = true;
    const controller = new AbortController();
    setLoaded(false);
    fetchFollowStats(targetDid, sessionDid, controller.signal)
      .then((next) => {
        if (!active) return;
        setStats((prev) => {
          // Don't clobber an optimistic follow the indexer hasn't caught yet.
          if (prev.viewerFollowUri === "optimistic" && !next.viewerFollowUri) {
            return { ...next, followers: Math.max(next.followers, prev.followers), viewerFollowUri: "optimistic" };
          }
          return next;
        });
      })
      .catch(() => {})
      // Resolve the loading state either way so the button stops showing its
      // placeholder even if the stats fetch failed.
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [targetDid, sessionDid, viewer.status]);

  const toggle = useCallback(async () => {
    if (!targetDid || isSelf || busy) return;
    if (!sessionDid) {
      redirectToLogin();
      return;
    }
    setBusy(true);
    const previous = stats;
    try {
      if (stats.viewerFollowUri) {
        const uri = stats.viewerFollowUri;
        setStats({ ...stats, followers: Math.max(0, stats.followers - 1), viewerFollowUri: null });
        if (uri !== "optimistic") await deleteFollow(rkeyOf(uri));
        recordPendingToggle(sessionDid, targetDid, -1, null);
        emitFollowChange({ viewerDid: sessionDid, targetDid, delta: -1, uri: null, origin });
      } else {
        setStats({ ...stats, followers: stats.followers + 1, viewerFollowUri: "optimistic" });
        const result = await createFollow(targetDid);
        setStats((current) => ({ ...current, viewerFollowUri: result.uri }));
        recordPendingToggle(sessionDid, targetDid, 1, result.uri);
        emitFollowChange({ viewerDid: sessionDid, targetDid, delta: 1, uri: result.uri, origin });
      }
    } catch (error) {
      setStats(previous);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [targetDid, isSelf, busy, sessionDid, stats, origin]);

  return {
    status: loaded ? "ready" : "loading",
    followers: stats.followers,
    following: stats.following,
    isFollowing: Boolean(stats.viewerFollowUri),
    isSelf,
    signedIn: Boolean(sessionDid),
    busy,
    toggle,
  };
}
