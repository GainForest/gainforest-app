import { NextRequest, NextResponse } from "next/server";

import { buildActivityFeed, type ActivityFeedFilter } from "@/app/_lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTERS: ActivityFeedFilter[] = ["all", "project", "observation", "organization", "donation", "post"];

function parseFilter(value: string | null): ActivityFeedFilter {
  return value && (FILTERS as string[]).includes(value) ? (value as ActivityFeedFilter) : "all";
}

/**
 * GET /api/feed?cursor=<opaque>&kind=<all|project|observation|organization|donation>
 *
 * Returns one page of the global, newest-first activity feed (projects, nature
 * sightings, organizations, and donations — Certs are folded into projects).
 * Rows are ordered purely by recency across all kinds; `cursor` walks strictly
 * older rows for "load more". Mirrors simocracy-v2's `/api/communities/feed`.
 */
export async function GET(request: NextRequest) {
  try {
    const cursor = request.nextUrl.searchParams.get("cursor");
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
