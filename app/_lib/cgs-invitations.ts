import "server-only";

import { accountPath, getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import { getAuthBaseUrl, getAuthInternalServiceToken } from "@/app/_lib/auth";
import { fetchCgsMembersWithCookie, type CgsServerRole } from "@/app/_lib/cgs-server";
import { resolveGroupInvitationEmailLocale } from "@/lib/email/group-invitation-template";
import { supabaseFilterValue, supabaseRpc, supabaseSelect } from "@/lib/supabase/rest";
import type { ProcessOneOutcome } from "@/lib/email-notifications/orchestrator";
import type { AuthSession } from "./auth";

export type GroupInvitationRole = "member" | "admin";
type GroupInvitationStatus = "pending" | "accepted" | "canceled" | "expired";
export type InvitationNotificationStatus = "waiting_recipient" | "queued" | "processing" | "sent" | "suppressed" | "dead";

export type InvitationNotificationSummary = {
  outboxId: string;
  status: InvitationNotificationStatus;
  retryable: boolean;
  errorCode?: string;
  nextAttemptAt?: string;
  duplicate?: boolean;
};

export function invitationNotificationAfterProcess(
  notification: InvitationNotificationSummary,
  result: ProcessOneOutcome,
): InvitationNotificationSummary {
  if (result.kind !== "processed") {
    const status = result.kind === "deadline" || result.kind === "disabled" ? "queued" : "processing";
    return { ...notification, status, retryable: status === "queued" };
  }
  switch (result.result.kind) {
    case "sent":
      return { ...notification, status: "sent", retryable: false, errorCode: undefined };
    case "requeued":
      return { ...notification, status: "queued", retryable: true, errorCode: result.result.errorCode };
    case "waiting_recipient":
      return { ...notification, status: "waiting_recipient", retryable: true, errorCode: result.result.errorCode };
    case "ambiguous_deferred":
      return { ...notification, status: "processing", retryable: false };
    case "dead":
      return { ...notification, status: "dead", retryable: result.result.errorCode === "provider_rejected", errorCode: result.result.errorCode };
    case "suppressed":
      return { ...notification, status: "suppressed", retryable: false };
    case "disabled":
    case "released_insufficient_time":
      return { ...notification, status: "queued", retryable: true };
    case "stale_claim":
      return { ...notification, status: "processing", retryable: false };
  }
}

export type GroupInvitation = {
  id: string;
  repo: string;
  email: string;
  role: GroupInvitationRole;
  status: GroupInvitationStatus;
  inviterDid: string;
  inviterHandle: string | null;
  inviterEmail: string | null;
  groupName: string | null;
  groupHandle: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByDid: string | null;
  acceptedByEmail: string | null;
  emailSentAt: string | null;
  lastEmailError: string | null;
  notification: InvitationNotificationSummary | null;
};

const TABLE = "cgs_group_invitations";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVITATION_SELECT = [
  "id",
  "repo",
  "email",
  "role",
  "status",
  "inviter_did",
  "inviter_handle",
  "inviter_email",
  "group_name",
  "group_handle",
  "created_at",
  "expires_at",
  "accepted_at",
  "accepted_by_did",
  "accepted_by_email",
  "email_sent_at",
  "last_email_error",
].join(",");

type RawInvitation = {
  id?: unknown;
  repo?: unknown;
  email?: unknown;
  role?: unknown;
  status?: unknown;
  inviter_did?: unknown;
  inviter_handle?: unknown;
  inviter_email?: unknown;
  group_name?: unknown;
  group_handle?: unknown;
  created_at?: unknown;
  expires_at?: unknown;
  accepted_at?: unknown;
  accepted_by_did?: unknown;
  accepted_by_email?: unknown;
  email_sent_at?: unknown;
  last_email_error?: unknown;
};

type RawNotification = {
  id?: unknown;
  outbox_id?: unknown;
  source_id?: unknown;
  status?: unknown;
  duplicate?: unknown;
  last_error_code?: unknown;
  next_attempt_at?: unknown;
  retryable?: unknown;
};

type RawInvitationMutation = {
  invitation?: unknown;
  notification?: unknown;
};

export class GroupInvitationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GroupInvitationError";
    this.status = status;
  }
}

export function normalizeInvitationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isInvitationRole(value: unknown): value is GroupInvitationRole {
  return value === "member" || value === "admin";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStatus(value: unknown, expiresAt: string | null): GroupInvitationStatus {
  const raw = value === "accepted" || value === "canceled" || value === "expired" ? value : "pending";
  if (raw === "pending" && expiresAt && new Date(expiresAt).getTime() < Date.now()) return "expired";
  return raw;
}

function normalizeInvitation(row: RawInvitation): GroupInvitation | null {
  const id = asString(row.id);
  const repo = asString(row.repo);
  const email = asString(row.email);
  const role = isInvitationRole(row.role) ? row.role : null;
  const inviterDid = asString(row.inviter_did);
  const createdAt = asString(row.created_at);
  const expiresAt = asString(row.expires_at);
  if (!id || !repo || !email || !role || !inviterDid || !createdAt || !expiresAt) return null;

  return {
    id,
    repo,
    email,
    role,
    status: normalizeStatus(row.status, expiresAt),
    inviterDid,
    inviterHandle: asString(row.inviter_handle),
    inviterEmail: asString(row.inviter_email),
    groupName: asString(row.group_name),
    groupHandle: asString(row.group_handle),
    createdAt,
    expiresAt,
    acceptedAt: asString(row.accepted_at),
    acceptedByDid: asString(row.accepted_by_did),
    acceptedByEmail: asString(row.accepted_by_email),
    emailSentAt: asString(row.email_sent_at),
    lastEmailError: asString(row.last_email_error),
    notification: null,
  };
}

function normalizeInvitations(rows: RawInvitation[]): GroupInvitation[] {
  return rows.flatMap((row) => {
    const invitation = normalizeInvitation(row);
    return invitation ? [invitation] : [];
  });
}

function normalizeNotification(value: unknown): InvitationNotificationSummary | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as RawNotification;
  const outboxId = asString(row.outbox_id) ?? asString(row.id);
  const status = asString(row.status);
  if (!outboxId || !status || !["waiting_recipient", "queued", "processing", "sent", "suppressed", "dead"].includes(status)) return null;
  const errorCode = asString(row.last_error_code) ?? undefined;
  const retryable = typeof row.retryable === "boolean"
    ? row.retryable
    : status === "queued" || status === "waiting_recipient" || (status === "dead" && errorCode === "provider_rejected");
  return {
    outboxId,
    status: status as InvitationNotificationStatus,
    retryable,
    ...(errorCode ? { errorCode } : {}),
    ...(asString(row.next_attempt_at) ? { nextAttemptAt: asString(row.next_attempt_at)! } : {}),
    ...(typeof row.duplicate === "boolean" ? { duplicate: row.duplicate } : {}),
  };
}

async function withNotifications(invitations: GroupInvitation[]): Promise<GroupInvitation[]> {
  if (invitations.length === 0) return invitations;
  const ids = invitations.map(invitation => invitation.id);
  const rows = await supabaseSelect<RawNotification>(
    `/notification_outbox?select=id,source_id,status,last_error_code,next_attempt_at&source_id=in.(${ids.join(",")})`,
  );
  const byInvitation = new Map<string, InvitationNotificationSummary>();
  for (const row of rows) {
    const sourceId = asString(row.source_id);
    const notification = normalizeNotification(row);
    if (sourceId && notification) byInvitation.set(sourceId, notification);
  }
  return invitations.map(invitation => ({ ...invitation, notification: byInvitation.get(invitation.id) ?? null }));
}

function invitationQuery(filters: string): string {
  return `/${TABLE}?select=${INVITATION_SELECT}&${filters}`;
}

export async function getGroupInvitation(invitationId: string): Promise<GroupInvitation | null> {
  const rows = await supabaseSelect<RawInvitation>(invitationQuery(`id=eq.${supabaseFilterValue(invitationId)}&limit=1`));
  return normalizeInvitations(rows)[0] ?? null;
}

export async function listPendingGroupInvitationsForEmail(email: string): Promise<GroupInvitation[]> {
  const normalizedEmail = normalizeInvitationEmail(email);
  const rows = await supabaseSelect<RawInvitation>(invitationQuery([
    `email=eq.${supabaseFilterValue(normalizedEmail)}`,
    "status=eq.pending",
    `expires_at=gt.${supabaseFilterValue(new Date().toISOString())}`,
    "order=created_at.desc",
    "limit=50",
  ].join("&")));
  return normalizeInvitations(rows);
}

/**
 * Emails of members who joined the group by accepting an email invitation,
 * keyed by member DID. PRIVATE data: callers must only expose this to
 * verified members of the same organization.
 */
export async function listAcceptedGroupInvitationEmailsForRepo(repo: string): Promise<Map<string, string>> {
  const rows = await supabaseSelect<RawInvitation>(invitationQuery([
    `repo=eq.${supabaseFilterValue(repo)}`,
    "status=eq.accepted",
    "accepted_by_did=not.is.null",
    "order=accepted_at.desc",
    "limit=200",
  ].join("&")));

  const emails = new Map<string, string>();
  for (const invitation of normalizeInvitations(rows)) {
    const did = invitation.acceptedByDid;
    const email = invitation.acceptedByEmail ?? invitation.email;
    if (did && email && !emails.has(did)) emails.set(did, email);
  }
  return emails;
}

export async function listPendingGroupInvitationsForRepo(repo: string): Promise<GroupInvitation[]> {
  const rows = await supabaseSelect<RawInvitation>(invitationQuery([
    `repo=eq.${supabaseFilterValue(repo)}`,
    "status=eq.pending",
    `expires_at=gt.${supabaseFilterValue(new Date().toISOString())}`,
    "order=created_at.desc",
    "limit=100",
  ].join("&")));
  return withNotifications(normalizeInvitations(rows));
}

function publicBaseUrl(origin: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || origin).replace(/\/$/, "");
}

async function inviterDisplay(inviterDid: string, inviterHandle: string | null, origin: string): Promise<{ name: string; url: string | null }> {
  const card = await getCertifiedProfileCard(inviterDid).catch(() => null);
  const name = card?.displayName?.trim() || "Unknown User";
  const identifier = inviterHandle?.trim() || card?.handle?.trim() || inviterDid;
  return {
    name,
    url: identifier ? new URL(accountPath(identifier), publicBaseUrl(origin)).toString() : null,
  };
}

async function groupDisplay(repo: string): Promise<{ name: string | null; handle: string | null; avatarUrl: string | null }> {
  if (!repo.startsWith("did:")) return { name: repo, handle: repo, avatarUrl: null };
  const card = await getCertifiedProfileCard(repo).catch(() => null);
  return {
    name: card?.displayName?.trim() || card?.handle?.trim() || repo,
    handle: card?.handle?.trim() || null,
    avatarUrl: card?.avatarUrl?.trim() || null,
  };
}

function currentRole(members: Array<{ did: string; role: CgsServerRole }>, did: string): CgsServerRole | null {
  return members.find((member) => member.did === did)?.role ?? null;
}

function canInvite(role: CgsServerRole | null, inviteRole: GroupInvitationRole): boolean {
  if (role === "owner") return true;
  if (role === "admin") return inviteRole === "member";
  return false;
}

function canCancelInvitation(role: CgsServerRole | null, invitationRole: GroupInvitationRole): boolean {
  if (role === "owner") return true;
  if (role === "admin") return invitationRole === "member";
  return false;
}

async function addMemberViaAuthService(invitation: GroupInvitation, memberDid: string): Promise<void> {
  const internalKey = getAuthInternalServiceToken();
  if (!internalKey) throw new GroupInvitationError("We couldn’t add you to the organization right now. Please try again later.", 500);

  const response = await fetch(new URL("/api/internal/cgs/member-add", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      authorization: `Bearer ${internalKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      actorDid: invitation.inviterDid,
      repo: invitation.repo,
      memberDid,
      role: invitation.role,
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null) as { message?: string; error?: string } | null;
  if (!response.ok || data?.error) {
    const upstreamMessage = data?.message ?? data?.error ?? `Auth service returned ${response.status || "an error"}`;
    console.warn("[cgs-invitations] Auth service member-add failed", {
      status: response.status || null,
      invitationId: invitation.id,
      repo: invitation.repo,
      upstreamMessage,
    });
    throw new GroupInvitationError("We couldn’t add you to the organization right now. Please try again later.", 502);
  }
}

function mutationResult(value: unknown): { invitation: GroupInvitation; notification: InvitationNotificationSummary | null } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const result = value as RawInvitationMutation;
  if (typeof result.invitation !== "object" || result.invitation === null || Array.isArray(result.invitation)) return null;
  const invitation = normalizeInvitation(result.invitation as RawInvitation);
  if (!invitation) return null;
  const notification = result.notification === null || result.notification === undefined
    ? null
    : normalizeNotification(result.notification);
  if (result.notification !== null && result.notification !== undefined && !notification) return null;
  return { invitation: { ...invitation, notification }, notification };
}

function knownRpcError(error: unknown, operation: "create" | "close" | "retry"): GroupInvitationError {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("invitation_role_conflict")) {
    return new GroupInvitationError("Cancel the pending invitation before changing this person’s role.", 409);
  }
  if (message.includes("invitation_retry_cooldown")) {
    return new GroupInvitationError("Please wait a minute before trying to send this email again.", 429);
  }
  if (message.includes("invitation_notification_not_safely_retryable")) {
    return new GroupInvitationError("This email can’t be retried safely. Copy the invitation link and share it directly.", 409);
  }
  if (message.includes("invitation_not_found")) return new GroupInvitationError("Invitation not found.", 404);
  if (message.includes("invitation_not_pending")) return new GroupInvitationError("This invitation is no longer pending.", 409);
  const fallback = operation === "create"
    ? "Invitation could not be saved. Please try again."
    : operation === "retry"
      ? "The email could not be queued again. Please try later."
      : "The invitation could not be updated. Please try again.";
  return new GroupInvitationError(fallback, 502);
}

export async function createGroupInvitation({
  repo,
  email,
  role,
  session,
  cookie,
  origin,
  acceptLanguage,
  enqueueNotification,
}: {
  repo: string;
  email: string;
  role: GroupInvitationRole;
  session: Extract<AuthSession, { isLoggedIn: true }>;
  cookie: string | null;
  origin: string;
  acceptLanguage: string | null;
  enqueueNotification: boolean;
}): Promise<GroupInvitation> {
  const normalizedEmail = normalizeInvitationEmail(email);
  if (!repo.trim()) throw new GroupInvitationError("Choose an organization before inviting someone.", 400);
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new GroupInvitationError("Enter a valid email address.", 400);

  const memberResult = await fetchCgsMembersWithCookie({ repo, cookie, limit: 100 });
  const actorRole = currentRole(memberResult.members, session.did);
  if (!canInvite(actorRole, role)) {
    throw new GroupInvitationError(role === "admin" ? "Only organization owners can invite admins." : "Only organization owners and admins can invite members.", 403);
  }

  const now = new Date();
  const invitationId = crypto.randomUUID();
  const group = await groupDisplay(repo);
  const inviter = await inviterDisplay(session.did, session.handle, origin);
  try {
    const raw = await supabaseRpc<unknown>("notification_invitation_create", {
      p_invitation_id: invitationId,
      p_repo: repo,
      p_email: normalizedEmail,
      p_role: role,
      p_inviter_did: session.did,
      p_inviter_handle: session.handle,
      p_inviter_email: session.email ?? null,
      p_group_name: group.name,
      p_group_handle: group.handle,
      p_inviter_name: inviter.name,
      p_inviter_url: inviter.url,
      p_public_origin: publicBaseUrl(origin),
      p_locale: resolveGroupInvitationEmailLocale({ acceptLanguage }),
      p_enqueue_notification: enqueueNotification,
      p_created_at: now.toISOString(),
      p_expires_at: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
    });
    const result = mutationResult(raw);
    if (!result) throw new GroupInvitationError("Invitation service returned an invalid response.", 502);
    return result.invitation;
  } catch (error) {
    if (error instanceof GroupInvitationError) throw error;
    throw knownRpcError(error, "create");
  }
}

async function closeInvitation(
  invitationId: string,
  status: "accepted" | "canceled" | "expired",
  acceptedByDid: string | null = null,
  acceptedByEmail: string | null = null,
): Promise<GroupInvitation> {
  try {
    const result = mutationResult(await supabaseRpc<unknown>("notification_invitation_close", {
      p_invitation_id: invitationId,
      p_status: status,
      p_accepted_by_did: acceptedByDid,
      p_accepted_by_email: acceptedByEmail,
    }));
    if (!result) throw new GroupInvitationError("Invitation service returned an invalid response.", 502);
    return result.invitation;
  } catch (error) {
    if (error instanceof GroupInvitationError) throw error;
    throw knownRpcError(error, "close");
  }
}

export async function cancelGroupInvitation({
  invitationId,
  actorRole,
}: {
  invitationId: string;
  actorRole: CgsServerRole | null;
}): Promise<GroupInvitation> {
  const invitation = await getGroupInvitation(invitationId);
  if (!invitation) throw new GroupInvitationError("Invitation not found.", 404);
  if (!canCancelInvitation(actorRole, invitation.role)) throw new GroupInvitationError("Only organization owners and admins can remove invitations.", 403);
  if (invitation.status !== "pending") throw new GroupInvitationError("This invitation is no longer pending.", 409);
  return closeInvitation(invitation.id, "canceled");
}

export async function retryGroupInvitation({
  invitationId,
  actorRole,
}: {
  invitationId: string;
  actorRole: CgsServerRole | null;
}): Promise<InvitationNotificationSummary> {
  const invitation = await getGroupInvitation(invitationId);
  if (!invitation) throw new GroupInvitationError("Invitation not found.", 404);
  if (!canCancelInvitation(actorRole, invitation.role)) throw new GroupInvitationError("Only organization owners and admins can retry invitation emails.", 403);
  if (invitation.status !== "pending") throw new GroupInvitationError("This invitation is no longer pending.", 409);
  try {
    const notification = normalizeNotification(await supabaseRpc<unknown>("notification_invitation_retry", {
      p_invitation_id: invitationId,
    }));
    if (!notification) throw new GroupInvitationError("Invitation service returned an invalid response.", 502);
    return notification;
  } catch (error) {
    if (error instanceof GroupInvitationError) throw error;
    throw knownRpcError(error, "retry");
  }
}

export async function acceptGroupInvitation({
  invitationId,
  session,
}: {
  invitationId: string;
  session: Extract<AuthSession, { isLoggedIn: true }>;
}): Promise<GroupInvitation> {
  const invitation = await getGroupInvitation(invitationId);
  if (!invitation) throw new GroupInvitationError("Invitation not found.", 404);
  if (invitation.status !== "pending") throw new GroupInvitationError("This invitation is no longer pending.", 409);
  if (new Date(invitation.expiresAt).getTime() < Date.now()) {
    await closeInvitation(invitation.id, "expired").catch(() => undefined);
    throw new GroupInvitationError("This invitation has expired.", 410);
  }

  const sessionEmail = session.email ? normalizeInvitationEmail(session.email) : "";
  if (!sessionEmail) throw new GroupInvitationError("Your signed-in account does not have an email address available.", 403);
  if (sessionEmail !== invitation.email) {
    throw new GroupInvitationError("Sign in with the email address that received this invitation.", 403);
  }

  await addMemberViaAuthService(invitation, session.did);
  return closeInvitation(invitation.id, "accepted", session.did, sessionEmail);
}
