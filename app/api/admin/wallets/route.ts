import { NextRequest, NextResponse } from "next/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { searchWalletConnections } from "@/app/admin/_lib/wallet-connections";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/wallets?q=<term> — look up accounts by name, handle or DID
 * and report which wallets they have connected (a donation vault and/or
 * linked EVM wallets).
 *
 * Gated to members of the GainForest admin group, same as /admin itself.
 *
 * Deliberately an on-demand lookup, not a full scan: enumerating every account
 * on the PDS (~14k repos) would be too slow for an admin view, so we only read
 * the few accounts the search term resolves to.
 */
export async function GET(request: NextRequest) {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  try {
    const rows = await searchWalletConnections(q);
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("[wallets] admin search failed", error);
    return NextResponse.json({ error: "search_failed" }, { status: 502 });
  }
}