import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchCgsMembersForRequest, type CgsServerRole } from "@/app/_lib/cgs-server";
import { fetchWalletRecordWithSource } from "@/lib/splits-vault/server";
import { handleSendRequest } from "@/lib/splits-vault/send-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const repoSchema = z.object({ repo: z.string().min(1) });

/**
 * Send funds from an organization's donation wallet. The viewer must be an
 * org member AND hold one of the wallet's enrolled passkeys — the passkey is
 * the actual spending authority (threshold 1), membership only gates the API.
 * Steps + validation are shared with the personal route
 * (lib/splits-vault/send-route.ts).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as unknown;
  const repoParsed = repoSchema.safeParse(body);
  if (!repoParsed.success) return NextResponse.json({ error: "Missing repo" }, { status: 400 });
  const { repo } = repoParsed.data;

  const session = await fetchAuthSession();
  if (!session.isLoggedIn || !session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const role: CgsServerRole | null = await fetchCgsMembersForRequest(repo)
    .then(({ members }) => members.find((member) => member.did === session.did)?.role ?? null)
    .catch(() => null);
  if (!role) {
    return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
  }

  const found = await fetchWalletRecordWithSource(repo);
  if (!found) return NextResponse.json({ error: "This organization has no wallet yet" }, { status: 404 });

  return handleSendRequest({
    body,
    walletDid: repo,
    sessionDid: session.did,
    record: found.record,
    org: true,
    canManagePending: role === "owner" || role === "admin",
  });
}
