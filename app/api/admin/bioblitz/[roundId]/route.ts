import { NextResponse } from "next/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  BioblitzAdminRoundNotFoundError,
  loadBioblitzAdminRound,
} from "@/app/admin/_lib/bioblitz-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRoundId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const roundId = Number(value);
  return Number.isSafeInteger(roundId) && roundId > 0 ? roundId : null;
}

/** A moderator-only, round-scoped roster for the internal BioBlitz dashboard. */
export async function GET(_request: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const access = await getGainForestModeratorAccess().catch(() => null);
  if (!access?.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!access.isModerator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { roundId: rawRoundId } = await params;
  const roundId = parseRoundId(rawRoundId);
  if (!roundId) return NextResponse.json({ error: "round_not_found" }, { status: 404 });

  try {
    const data = await loadBioblitzAdminRound(roundId, Date.now(), access.repoDid);
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof BioblitzAdminRoundNotFoundError) {
      return NextResponse.json({ error: "round_not_found" }, { status: 404 });
    }
    console.error("[admin-bioblitz] round dashboard failed", error);
    return NextResponse.json({ error: "round_load_failed" }, { status: 502 });
  }
}
