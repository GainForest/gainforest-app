import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  getGroupInvitation,
  GroupInvitationError,
  invitationNotificationAfterProcess,
  retryGroupInvitation,
} from "@/app/_lib/cgs-invitations";
import { fetchCgsMemberRoleWithCookie } from "@/app/_lib/cgs-server";
import { createInvitationRuntime } from "@/lib/email-notifications/invitation-runtime";
import { logInlineInvitationProcessingDeferred } from "../../processing-log";

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
    let notification = await retryGroupInvitation({ invitationId, actorRole });
    try {
      const processed = await createInvitationRuntime().process(
        notification.outboxId,
        new Date(invocationStartedAt + USABLE_INVOCATION_MS),
      );
      notification = invitationNotificationAfterProcess(notification, processed);
    } catch {
      logInlineInvitationProcessingDeferred(notification.outboxId);
      // The retry schedule is already durable; cron recovery can continue it.
    }
    return Response.json({ notification }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error, "The email could not be queued again. Please try later.", 502);
  }
}
