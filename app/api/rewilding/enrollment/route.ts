import { NextResponse } from "next/server";
import { resolveViewerGrant } from "@/app/grants/_lib/rewilding-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/rewilding/enrollment — whether the signed-in user belongs to a
 * Rewilding the Web grant: their own account holds a slot, or they are a
 * member of an organization that does. The sidebar uses this to decide
 * whether to show the "My grant" / "My recorders" entries; the pages
 * re-check server-side, so this is cosmetic. Always answers false rather
 * than erroring so the shell never breaks over it.
 */
export async function GET() {
  try {
    const grant = await resolveViewerGrant();
    return NextResponse.json(
      { enrolled: grant !== null },
      // Private per-user answer; let the browser hold it briefly so route
      // changes don't re-ask on every navigation.
      { headers: { "cache-control": "private, max-age=60" } },
    );
  } catch {
    return NextResponse.json({ enrolled: false }, { headers: { "cache-control": "no-store" } });
  }
}
