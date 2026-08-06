import { NextResponse } from "next/server";
import { bioblitzRounds } from "@/app/_lib/bioblitz";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { loadBioblitzAdminRoundCounts } from "@/app/admin/_lib/bioblitz-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Moderator-only totals for the BioBlitz round rail. */
export async function GET() {
  const access = await getGainForestModeratorAccess().catch(() => null);
  if (!access?.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!access.isModerator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const counts = await loadBioblitzAdminRoundCounts(bioblitzRounds(Date.now(), 0));
  return NextResponse.json({ counts }, { headers: { "cache-control": "no-store" } });
}
