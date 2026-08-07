import { headers } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { cancelGroupInvitation, getGroupInvitation, GroupInvitationError } from "@/app/_lib/cgs-invitations";
import { fetchCgsMemberRoleWithCookie } from "@/app/_lib/cgs-server";

export const runtime = "nodejs";

function jsonError(error: unknown, fallback: string, status = 400) {
  const message = error instanceof GroupInvitationError ? error.message : fallback;
  const responseStatus = error instanceof GroupInvitationError ? error.status : status;
  const code = error instanceof GroupInvitationError ? error.code : undefined;
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status: responseStatus, headers: { "cache-control": "no-store" } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params;
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return jsonError(new GroupInvitationError("Please sign in and try again.", 401), "Please sign in and try again.");

  try {
    const invitation = await getGroupInvitation(invitationId);
    if (!invitation) throw new GroupInvitationError("Invitation not found.", 404, "invitation_not_found");

    const headerList = await headers();
    const cookie = getAuthForwardCookie(headerList.get("cookie"));
    if (!cookie) throw new GroupInvitationError("Please sign in and try again.", 401);

    const actorRole = await fetchCgsMemberRoleWithCookie({
      repo: invitation.repo,
      cookie,
      did: session.did,
    });
    const canceled = await cancelGroupInvitation({ invitationId, actorRole });
    return Response.json({ invitation: canceled }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error, "Could not remove invitation.", 502);
  }
}
