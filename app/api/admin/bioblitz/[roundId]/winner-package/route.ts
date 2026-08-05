import { NextResponse } from "next/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  BioblitzWinnerPackageError,
  createBioblitzWinnerPackage,
} from "@/app/admin/_lib/bioblitz-winner-package";
import type { BioblitzWinnerPrize } from "@/app/admin/_lib/bioblitz-dashboard-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRoundId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const roundId = Number(value);
  return Number.isSafeInteger(roundId) && roundId > 0 ? roundId : null;
}

function parsePrize(value: string | null): BioblitzWinnerPrize | null {
  return value === "most-observations" || value === "best-picture" ? value : null;
}

/**
 * One-click, moderator-only marketing hand-off for a confirmed round winner.
 * The route recomputes the recipient; it never accepts a DID or asset URL.
 */
export async function GET(request: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const access = await getGainForestModeratorAccess().catch(() => null);
  if (!access?.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!access.isModerator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { roundId: rawRoundId } = await params;
  const roundId = parseRoundId(rawRoundId);
  const prize = parsePrize(new URL(request.url).searchParams.get("prize"));
  if (!roundId || !prize) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  try {
    const packageData = await createBioblitzWinnerPackage(roundId, prize, access.repoDid);
    return new NextResponse(packageData.body, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${packageData.filename}"; filename*=UTF-8''${encodeURIComponent(packageData.filename)}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof BioblitzWinnerPackageError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("[admin-bioblitz] winner package route failed", error);
    return NextResponse.json({ error: "package_failed" }, { status: 502 });
  }
}
