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

  return {
    followers: data?.followers?.totalCount ?? 0,
    following: data?.following?.totalCount ?? 0,
    viewerFollowUri: data?.viewer?.edges?.[0]?.node?.uri ?? null,
  };
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
      } else {
        setStats({ ...stats, followers: stats.followers + 1, viewerFollowUri: "optimistic" });
        const result = await createFollow(targetDid);
        setStats((current) => ({ ...current, viewerFollowUri: result.uri }));
      }
    } catch (error) {
      setStats(previous);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [targetDid, isSelf, busy, sessionDid, stats]);

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
