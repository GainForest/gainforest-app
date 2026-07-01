import { NextResponse } from "next/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { sendTainaAdminMessage } from "@/app/_lib/taina-agent";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/taina/message
 * Body: { did: string, text: string }
 *
 * Sends a message to an observer through their own Tainá bot. The runtime
 * steers the observer's agent, so what lands in Telegram is written in
 * Tainá's voice — no admin prefix, and the agent's conversation history stays
 * consistent with what was said. Gated to GainForest admin-group members.
 */
const MAX_MESSAGE_CHARS = 4000;

export async function POST(request: Request) {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let did = "";
  let text = "";
  try {
    const body = await request.json();
    did = String(body.did ?? "").trim();
    text = String(body.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!did.startsWith("did:") || !text) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (text.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: "message_too_long" }, { status: 400 });
  }

  try {
    const { ok, status, error } = await sendTainaAdminMessage(did, text);
    if (!ok) {
      return NextResponse.json({ error: error ?? "send_failed" }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[taina] admin message failed", error);
    return NextResponse.json({ error: "runtime_unreachable" }, { status: 502 });
  }
}
