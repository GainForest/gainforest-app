import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { EndorserMutationError, removeEndorser } from "@/app/internal/badges/_lib/endorser-mutations";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ rkey: string }> }) {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return Response.json({ error: "You do not have access to manage endorsers." }, { status: 403 });
  }

  const { rkey } = await params;
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  try {
    await removeEndorser(access.repoDid, cookie, rkey);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof EndorserMutationError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not remove the endorser.";
    return Response.json({ error: message }, { status });
  }
}
