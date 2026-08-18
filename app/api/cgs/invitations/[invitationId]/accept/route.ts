import { headers } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { acceptGroupInvitation, GroupInvitationError } from "@/app/_lib/cgs-invitations";
import { scheduleOrganizationRosterSync } from "@/app/_lib/organization-memberships";

export const runtime = "nodejs";

function jsonError(error: unknown, fallback: string, status = 400) {
  const message = error instanceof GroupInvitationError ? error.message : fallback;
  const responseStatus = error instanceof GroupInvitationError ? error.status : status;
  const code = error instanceof GroupInvitationError ? error.code : undefined;
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status: responseStatus, headers: { "cache-control": "no-store" } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params;
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return jsonError(new GroupInvitationError("Please sign in and try again.", 401), "Please sign in and try again.");

  try {
    const invitation = await acceptGroupInvitation({ invitationId, session });
    const headerList = await headers();
    scheduleOrganizationRosterSync(invitation.repo, headerList.get("cookie"));
    return Response.json({ invitation }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error, "Could not accept invitation.", 502);
  }
}
