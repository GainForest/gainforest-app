import { NextRequest, NextResponse } from "next/server";

import { buildActivityFeed, fetchViewerFollowingDids, type ActivityFeedFilter } from "@/app/_lib/feed";
import { fetchAuthSession } from "@/app/_lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTERS: ActivityFeedFilter[] = ["all", "project", "observation", "organization", "donation", "post"];

function parseFilter(value: string | null): ActivityFeedFilter {
  return value && (FILTERS as string[]).includes(value) ? (value as ActivityFeedFilter) : "all";
}

/**
 * GET /api/feed?cursor=<opaque>&kind=<all|project|observation|organization|donation|post>
 * GET /api/feed?cursor=<opaque>&scope=following
 *
 * Returns one page of the global, newest-first activity feed (projects, nature
 * sightings, organizations, posts, and donations — Certs are folded into
 * projects). Rows are ordered purely by recency across all kinds; `cursor`
 * walks strictly older rows for "load more".
 *
 * With `scope=following` the feed is scoped to records authored by accounts the
 * signed-in viewer follows (atproto query-on-read): the viewer is resolved from
 * the session, their follow set is fetched once, and the record streams are
 * filtered to those authors. A signed-out request returns an empty page.
 */
export async function GET(request: NextRequest) {
  try {
    const cursor = request.nextUrl.searchParams.get("cursor");
    const scope = request.nextUrl.searchParams.get("scope");

    if (scope === "following") {
      const session = await fetchAuthSession();
      if (!session.isLoggedIn) {
        return NextResponse.json(
          { items: [], nextCursor: null, hasMore: false },
          { headers: { "cache-control": "private, no-store" } },
        );
      }
      const dids = await fetchViewerFollowingDids(session.did);
      const page = await buildActivityFeed(cursor, "all", { dids, viewerDid: session.did });
      // A following feed is per-viewer, so it must never be shared in a CDN cache.
      return NextResponse.json(page, { headers: { "cache-control": "private, no-store" } });
    }

    const filter = parseFilter(request.nextUrl.searchParams.get("kind"));
    const page = await buildActivityFeed(cursor, filter);
    return NextResponse.json(page, {
      headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("[/api/feed]", error);
    const message = error instanceof Error ? error.message : "Failed to build feed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
