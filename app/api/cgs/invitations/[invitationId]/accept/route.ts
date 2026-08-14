import { fetchAuthSession } from "@/app/_lib/auth-server";
import { acceptGroupInvitation, GroupInvitationError } from "@/app/_lib/cgs-invitations";
import { createWelcomeRuntime } from "@/lib/email-notifications/welcome-runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

const USABLE_INVOCATION_MS = 55_000;

function jsonError(error: unknown, fallback: string, status = 400) {
  const message = error instanceof GroupInvitationError ? error.message : fallback;
  const responseStatus = error instanceof GroupInvitationError ? error.status : status;
  const code = error instanceof GroupInvitationError ? error.code : undefined;
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status: responseStatus, headers: { "cache-control": "no-store" } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  const invocationStartedAt = Date.now();
  const { invitationId } = await params;
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return jsonError(new GroupInvitationError("Please sign in and try again.", 401), "Please sign in and try again.");

  try {
    const invitation = await acceptGroupInvitation({ invitationId, session });
    try {
      const notification = await createWelcomeRuntime().deliver({
        type: "membership_joined",
        authEventId: `invitation.accepted.v1:${invitation.id}`,
        userDid: session.did,
        email: invitation.acceptedByEmail ?? invitation.email,
        createdAt: invitation.acceptedAt ?? new Date(invocationStartedAt).toISOString(),
        organizationDid: invitation.repo,
        organizationName: invitation.groupName ?? undefined,
      }, new Date(invocationStartedAt + USABLE_INVOCATION_MS));
      return Response.json({ invitation, notification }, { headers: { "cache-control": "no-store" } });
    } catch {
      throw new GroupInvitationError(
        "You joined the organization, but we couldn’t queue the joined email. Please try again.",
        502,
        "invitation_acceptance_incomplete",
      );
    }
  } catch (error) {
    return jsonError(error, "Could not accept invitation.", 502);
  }
}
