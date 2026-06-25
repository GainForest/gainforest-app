import { fetchAuthSession } from "@/app/_lib/auth-server";
import { acceptGroupInvitation, GroupInvitationError } from "@/app/_lib/cgs-invitations";

export const runtime = "nodejs";

function jsonError(error: unknown, fallback: string, status = 400) {
  const message = error instanceof GroupInvitationError ? error.message : fallback;
  const code = error instanceof GroupInvitationError ? error.status : status;
  return Response.json({ error: message }, { status: code, headers: { "cache-control": "no-store" } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params;
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return jsonError(new GroupInvitationError("Please sign in and try again.", 401), "Please sign in and try again.");

  try {
    const invitation = await acceptGroupInvitation({ invitationId, session });
    return Response.json({ invitation }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error, "Could not accept invitation.", 502);
  }
}
