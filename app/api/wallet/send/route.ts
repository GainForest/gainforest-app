import { NextRequest, NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchWalletRecordWithSource } from "@/lib/splits-vault/server";
import { handleSendRequest } from "@/lib/splits-vault/send-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Send funds from the signed-in user's personal donation wallet. Two steps:
 * `prepare` builds the operation to sign, `submit` verifies the passkey
 * approval and settles it on-chain (see lib/splits-vault/send-server.ts).
 * The wallet always comes from the session's own repo — never the body.
 */
export async function POST(request: NextRequest) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn || !session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const found = await fetchWalletRecordWithSource(session.did);
  if (!found) return NextResponse.json({ error: "You have no wallet yet" }, { status: 404 });

  return handleSendRequest({
    body: await request.json().catch(() => null),
    walletDid: session.did,
    sessionDid: session.did,
    record: found.record,
    org: false,
    // A personal wallet is fully managed by its owner.
    canManagePending: true,
  });
}
