import { after } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  acceptGroupInvitation,
  GroupInvitationError,
  type GroupInvitation,
} from "@/app/_lib/cgs-invitations";
import { scheduleOrganizationRosterSync } from "@/app/_lib/organization-memberships";
import { createWelcomeRuntime } from "@/lib/email-notifications/welcome-runtime";
import {
  LANGUAGE_COOKIE_NAME,
  isSupportedLanguageCode,
  readCookieValue,
  resolvePreferredLanguageFromHeader,
  type SupportedLanguageCode,
} from "@/lib/i18n/languages";
import { LOCALE_REQUEST_HEADER_NAME } from "@/lib/i18n/routing";

export const runtime = "nodejs";
export const maxDuration = 60;

const USABLE_INVOCATION_MS = 55_000;

function requestLocale(request: Request, cookie: string | null): SupportedLanguageCode {
  const headerLocale = request.headers.get(LOCALE_REQUEST_HEADER_NAME)?.trim();
  if (headerLocale && isSupportedLanguageCode(headerLocale)) return headerLocale;

  const cookieLocale = readCookieValue(cookie, LANGUAGE_COOKIE_NAME)?.trim();
  if (cookieLocale && isSupportedLanguageCode(cookieLocale)) return cookieLocale;
  return resolvePreferredLanguageFromHeader(request.headers.get("accept-language"));
}

function logJoinedEmailFailure(invitationId: string, error: unknown): void {
  console.error("[cgs-invitations] Joined email setup failed", {
    invitationId,
    reason: error instanceof Error ? error.name : "unknown",
  });
}

function scheduleJoinedEmail(
  invitation: GroupInvitation,
  locale: SupportedLanguageCode,
  invocationStartedAt: number,
): void {
  const { acceptedAt, acceptedByDid, acceptedByEmail } = invitation;
  if (!acceptedAt || !acceptedByDid || !acceptedByEmail) {
    logJoinedEmailFailure(invitation.id, new Error("IncompleteAcceptedInvitation"));
    return;
  }

  after(async () => {
    try {
      await createWelcomeRuntime().deliver({
        type: "membership_joined",
        authEventId: `invitation.accepted.v1:${invitation.id}`,
        userDid: acceptedByDid,
        email: acceptedByEmail,
        createdAt: acceptedAt,
        organizationDid: invitation.repo,
        organizationName: invitation.groupName ?? undefined,
        locale,
      }, new Date(invocationStartedAt + USABLE_INVOCATION_MS));
    } catch (error) {
      logJoinedEmailFailure(invitation.id, error);
    }
  });
}

function jsonError(error: unknown, fallback: string, status = 400) {
  const message = error instanceof GroupInvitationError ? error.message : fallback;
  const responseStatus = error instanceof GroupInvitationError ? error.status : status;
  const code = error instanceof GroupInvitationError ? error.code : undefined;
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status: responseStatus, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  const invocationStartedAt = Date.now();
  const { invitationId } = await params;
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return jsonError(new GroupInvitationError("Please sign in and try again.", 401), "Please sign in and try again.");

  const cookie = request.headers.get("cookie");
  const locale = requestLocale(request, cookie);
  try {
    const invitation = await acceptGroupInvitation({ invitationId, session, cookie });
    scheduleOrganizationRosterSync(invitation.repo, cookie);
    scheduleJoinedEmail(invitation, locale, invocationStartedAt);
    return Response.json({ invitation }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error, "Could not accept invitation.", 502);
  }
}
