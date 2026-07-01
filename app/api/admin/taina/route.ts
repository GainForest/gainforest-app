import { NextResponse } from "next/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { fetchTainaAdminResidents } from "@/app/_lib/taina-agent";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/taina — the Tainá roster for the admin panel: every
 * provisioned agent with its bot, owner, last-used time and credit spend.
 * Gated to members of the GainForest admin group, same as /admin itself.
 */
export async function GET() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const data = await fetchTainaAdminResidents();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[taina] admin roster failed", error);
    return NextResponse.json({ error: "runtime_unreachable" }, { status: 502 });
  }
}
