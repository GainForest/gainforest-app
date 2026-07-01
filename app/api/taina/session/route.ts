import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resetTainaSession } from "@/app/_lib/taina-agent";

export const dynamic = "force-dynamic";

/**
 * POST /api/taina/session — restart the signed-in user's conversation with
 * Tainá. The agent runtime starts a brand-new conversation (no shared
 * history), clears the visible transcript, and greets the observer afresh in
 * Telegram. Session-gated; the DID comes from the bumicerts session.
 */
export async function POST() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  try {
    const { ok, status, error } = await resetTainaSession(session.did);
    if (!ok) {
      return NextResponse.json({ error: error ?? "reset_failed" }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[taina] session reset failed", error);
    return NextResponse.json({ error: "runtime_unreachable" }, { status: 502 });
  }
}
