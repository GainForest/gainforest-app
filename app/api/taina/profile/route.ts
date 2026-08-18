import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { saveTainaProfile } from "@/app/_lib/taina-agent";
import { TAINA_PROFILE_MAX_CHARS } from "@/app/_lib/taina-shared";

export const dynamic = "force-dynamic";

/**
 * PUT /api/taina/profile
 * Body: { profile: string }
 *
 * Saves the signed-in user's USER.md — the personal Markdown profile stored
 * with their Tainá agent so it knows who they are. An empty string clears it.
 * Session-gated; the DID comes from the bumicerts session, never the client.
 */
export async function PUT(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  let profile = "";
  try {
    const body = await request.json();
    if (typeof body.profile !== "string") throw new Error();
    profile = body.profile;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (profile.length > TAINA_PROFILE_MAX_CHARS) {
    return NextResponse.json({ error: "profile_too_long" }, { status: 400 });
  }

  try {
    const { ok, status, error } = await saveTainaProfile(session.did, profile.trim());
    if (!ok) {
      return NextResponse.json({ error: error ?? "profile_save_failed" }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[taina] profile save failed", error);
    return NextResponse.json({ error: "runtime_unreachable" }, { status: 502 });
  }
}
