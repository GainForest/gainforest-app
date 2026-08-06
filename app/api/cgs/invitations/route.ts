import { headers } from "next/headers";
import { z } from "zod";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import {
  createGroupInvitation,
  GroupInvitationError,
  isInvitationRole,
  invitationNotificationAfterProcess,
  listPendingGroupInvitationsForEmail,
  listPendingGroupInvitationsForRepo,
  normalizeInvitationEmail,
} from "@/app/_lib/cgs-invitations";
import { fetchCgsMemberRoleWithCookie } from "@/app/_lib/cgs-server";
import { readNotificationConfig } from "@/lib/email-notifications/config";
import { createInvitationRuntime } from "@/lib/email-notifications/invitation-runtime";
import { logInlineInvitationProcessingDeferred } from "./processing-log";

export const runtime = "nodejs";
export const maxDuration = 60;

const USABLE_INVOCATION_MS = 55_000;

const createInvitationSchema = z.object({
  repo: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["member", "admin"]).default("member"),
});

function jsonError(error: unknown, fallback: string, status = 400) {
  const message = error instanceof GroupInvitationError ? error.message : fallback;
  const responseStatus = error instanceof GroupInvitationError ? error.status : status;
  const code = error instanceof GroupInvitationError ? error.code : undefined;
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status: responseStatus, headers: { "cache-control": "no-store" } });
}

function canViewPendingInvitations(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export async function GET(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ invitations: [] }, { headers: { "cache-control": "no-store" } });
  }

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo")?.trim() ?? "";

  try {
    if (repo) {
      const headerList = await headers();
      const cookie = getAuthForwardCookie(headerList.get("cookie"));
      if (!cookie) throw new GroupInvitationError("Please sign in and try again.", 401);
      const actorRole = await fetchCgsMemberRoleWithCookie({ repo, cookie, did: session.did });
      if (!canViewPendingInvitations(actorRole)) throw new GroupInvitationError("Only organization owners and admins can view pending invitations.", 403);
      const invitations = await listPendingGroupInvitationsForRepo(repo);
      return Response.json({ invitations }, { headers: { "cache-control": "no-store" } });
    }

    if (!session.email) {
      return Response.json({ invitations: [] }, { headers: { "cache-control": "no-store" } });
    }
    const invitations = await listPendingGroupInvitationsForEmail(normalizeInvitationEmail(session.email));
    return Response.json({ invitations }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error, "Could not load invitations.", 502);
  }
}

export async function POST(request: Request) {
  const invocationStartedAt = Date.now();
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return jsonError(new GroupInvitationError("Please sign in and try again.", 401), "Please sign in and try again.");

  const parsed = createInvitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isInvitationRole(parsed.data.role)) {
    return jsonError(new GroupInvitationError("Enter a valid invitation.", 400), "Enter a valid invitation.");
  }

  const headerList = await headers();

  try {
    const notificationConfig = readNotificationConfig();
    let invitation = await createGroupInvitation({
      repo: parsed.data.repo.trim(),
      email: parsed.data.email,
      role: parsed.data.role,
      session,
      cookie: getAuthForwardCookie(headerList.get("cookie")),
      acceptLanguage: headerList.get("accept-language"),
      enqueueNotification: !notificationConfig.emailDisabled,
    });
    if (invitation.notification?.status === "queued") {
      const outboxId = invitation.notification.outboxId;
      try {
        const processed = await createInvitationRuntime().process(
          outboxId,
          new Date(invocationStartedAt + USABLE_INVOCATION_MS),
        );
        invitation = {
          ...invitation,
          notification: invitationNotificationAfterProcess(invitation.notification, processed),
        };
      } catch {
        logInlineInvitationProcessingDeferred(outboxId);
        // The invitation and queued notification are already durable. Recovery
        // can retry without exposing provider or configuration details.
      }
    }
    return Response.json({ invitation }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error, "Could not create invitation.", 502);
  }
}
