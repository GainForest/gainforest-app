import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { isRewildingGrantee } from "@/app/_lib/rewilding-grantees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/rewilding/enrollment — whether the signed-in user currently holds
 * a Rewilding the Web grant slot. The sidebar uses this to decide whether to
 * show the "My grant" / "My recorders" entries; the pages themselves re-check
 * server-side, so this is cosmetic. Always answers false rather than erroring
 * so the shell never breaks over it.
 */
export async function GET() {
  try {
    const session = await fetchAuthSession();
    const enrolled = session.isLoggedIn ? await isRewildingGrantee(session.did) : false;
    return NextResponse.json(
      { enrolled },
      // Private per-user answer; let the browser hold it briefly so route
      // changes don't re-ask on every navigation.
      { headers: { "cache-control": "private, max-age=60" } },
    );
  } catch {
    return NextResponse.json({ enrolled: false }, { headers: { "cache-control": "no-store" } });
  }
}
