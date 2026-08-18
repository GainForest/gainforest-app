import { NextRequest, NextResponse } from "next/server";

import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  fetchNotificationSeenAt,
  fetchNotificationsForDid,
} from "@/app/_lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?limit=<n>
 *
 * Returns the signed-in viewer's notifications (likes + comments other accounts
 * made on the viewer's records), newest first, plus the unread count and the
 * viewer's last-seen timestamp. `unreadCount` is derived from the same fetch —
 * no extra round-trip — and capped for display ("99+").
 */
export async function GET(request: NextRequest) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = parseInt(request.nextUrl.searchParams.get("limit") ?? "30", 10);
  const limit = Math.min(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 30, 50);

  // seenAt is fetched first so unreadCount is computed over the full set.
  const seenAt = await fetchNotificationSeenAt(session.did);
  const { items, unreadCount } = await fetchNotificationsForDid(session.did, { limit, seenAt });

  return NextResponse.json({ items, unreadCount: Math.min(unreadCount, 99), seenAt });
}
