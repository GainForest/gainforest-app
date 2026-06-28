import { NextResponse } from "next/server";

import { buildActivityFeed, type ActivityFeedResponse } from "@/app/_lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/feed
 *
 * Aggregates everything happening across GainForest into a single
 * Bluesky/X-style activity feed, sorted newest-first:
 *   - new project collections published
 *   - new Bumicerts (impact claims) published
 *   - new nature sightings shared
 *   - new organizations registered
 *   - new completed donations
 *
 * Mirrors simocracy-v2's `/api/communities/feed` route. The merge happens
 * server-side in `app/_lib/feed.ts`; this route is a thin JSON transport with
 * caching so the /feed sidebar tab stays fast.
 */

export async function GET() {
  try {
    const items = await buildActivityFeed();
    const body: ActivityFeedResponse = { items };
    return NextResponse.json(body, {
      headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("[/api/feed]", error);
    const message = error instanceof Error ? error.message : "Failed to build feed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
