import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  listTainaAgentKeyIds,
  mintTainaAgentKey,
  provisionTainaBot,
  revokeAgentKeys,
} from "@/app/_lib/taina-agent";

export const dynamic = "force-dynamic";

/**
 * POST /api/taina/provision
 * Body: { botToken: string, focus?: string }
 *
 * Connects the signed-in user's own Telegram bot to the Tainá agent runtime.
 * The DID always comes from the bumicerts session — never the request body.
 * A regular GainForest AI-agent key (gf_pat_…) is minted under the Tainá name
 * (visible in Settings → AI agent keys) and handed to the bot, which follows
 * the canonical /skill.md guide to record observations under this account.
 */
const BOT_TOKEN_RE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;

export async function POST(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  let botToken = "";
  let focus = "";
  try {
    const body = await request.json();
    botToken = String(body.botToken ?? "").trim();
    focus = String(body.focus ?? "").trim().slice(0, 200);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!BOT_TOKEN_RE.test(botToken)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  try {
    // One live Tainá key per account: remember any existing ones so they can
    // be retired once the fresh key is in place.
    const staleKeyIds = await listTainaAgentKeyIds().catch(() => [] as string[]);
    const pat = await mintTainaAgentKey();

    const { ok, status, data } = await provisionTainaBot({
      did: session.did,
      handle: session.handle || session.did,
      botToken,
      focus,
      pat,
    });

    if (!ok) {
      // Don't leave an orphaned key behind when the bot never got it.
      const orphanedIds = await listTainaAgentKeyIds()
        .then((ids) => ids.filter((id) => !staleKeyIds.includes(id)))
        .catch(() => [] as string[]);
      await revokeAgentKeys(orphanedIds);
      return NextResponse.json({ error: data.error ?? "provision_failed" }, { status });
    }

    await revokeAgentKeys(staleKeyIds);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[taina] provision failed", error);
    return NextResponse.json({ error: "runtime_unreachable" }, { status: 502 });
  }
}
