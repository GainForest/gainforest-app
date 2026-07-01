import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  listTainaAgentKeyIds,
  mintTainaAgentKey,
  revokeAgentKeys,
  setTainaKey,
} from "@/app/_lib/taina-agent";

export const dynamic = "force-dynamic";

/**
 * The Tainá bot publishes with a regular GainForest AI-agent key (gf_pat_…)
 * named for Tainá, managed through the central auth service — the same keys
 * listed in Settings → AI agent keys. Regenerate/revoke here keeps the agent
 * runtime and the key list in sync.
 */

/** POST /api/taina/key — regenerate: mint a fresh key, retire the old ones. */
export async function POST() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  try {
    const staleKeyIds = await listTainaAgentKeyIds().catch(() => []);
    const pat = await mintTainaAgentKey();
    await setTainaKey(session.did, pat);
    await revokeAgentKeys(staleKeyIds);

    return NextResponse.json({ apiKey: pat });
  } catch (error) {
    console.error("[taina] key regenerate failed", error);
    return NextResponse.json({ error: "runtime_unreachable" }, { status: 502 });
  }
}

/** DELETE /api/taina/key — revoke: delete the key and stop the bot publishing. */
export async function DELETE() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  try {
    await revokeAgentKeys(await listTainaAgentKeyIds().catch(() => []));
    await setTainaKey(session.did, null);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[taina] key revoke failed", error);
    return NextResponse.json({ error: "runtime_unreachable" }, { status: 502 });
  }
}
