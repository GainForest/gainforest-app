import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import { fetchCgsMembersWithCookie, type CgsServerRole } from "@/app/_lib/cgs-server";
import { renderGroupInvitationEmailTemplate, resolveGroupInvitationEmailLocale } from "@/lib/email/group-invitation-template";
import { supabaseFilterValue, supabaseInsert, supabasePatch, supabaseSelect } from "@/lib/supabase/rest";
import type { AuthSession } from "./auth";

export type GroupInvitationRole = "member" | "admin";
export type GroupInvitationStatus = "pending" | "accepted" | "canceled" | "expired";

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
  };
}

function normalizeInvitations(rows: RawInvitation[]): GroupInvitation[] {
  return rows.flatMap((row) => {
    const invitation = normalizeInvitation(row);
    return invitation ? [invitation] : [];
  });
}

function invitationQuery(filters: string): string {
  return `/${TABLE}?select=${INVITATION_SELECT}&${filters}`;
}

export async function getGroupInvitation(invitationId: string): Promise<GroupInvitation | null> {
  const rows = await supabaseSelect<RawInvitation>(invitationQuery(`id=eq.${supabaseFilterValue(invitationId)}&limit=1`));
  return normalizeInvitations(rows)[0] ?? null;
}

async function getPendingInvitation(repo: string, email: string): Promise<GroupInvitation | null> {
  const rows = await supabaseSelect<RawInvitation>(invitationQuery([
    `repo=eq.${supabaseFilterValue(repo)}`,
    `email=eq.${supabaseFilterValue(email)}`,
    "status=eq.pending",
    "limit=1",
  ].join("&")));
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

function publicInvitationUrl(origin: string, invitationId: string): string {
  return new URL(`/invite/${encodeURIComponent(invitationId)}`, origin).toString();
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

async function sendInvitationEmail({
  invitation,
  origin,
  acceptLanguage,
}: {
  invitation: GroupInvitation;
  origin: string;
  acceptLanguage: string | null;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVITATION_FROM_EMAIL?.trim() || process.env.FROM_EMAIL?.trim() || "GainForest <noreply@gainforest.id>";
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required to send invitations.");
  }

  const acceptUrl = publicInvitationUrl(origin, invitation.id);
  const rendered = renderGroupInvitationEmailTemplate({
    locale: resolveGroupInvitationEmailLocale({ acceptLanguage }),
    invitedEmail: invitation.email,
    organizationName: invitation.groupName,
    inviterName: invitation.inviterHandle ?? invitation.inviterEmail,
    role: invitation.role,
    acceptUrl,
    siteUrl: origin,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [invitation.email],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null) as { message?: string; error?: string } | null;
  if (!response.ok) throw new Error(data?.message ?? data?.error ?? "Invitation email could not be sent.");
}

async function addMemberViaAuthService(invitation: GroupInvitation, memberDid: string): Promise<void> {
  const internalKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!internalKey) throw new GroupInvitationError("SUPABASE_SERVICE_ROLE_KEY is required to accept invitations.", 500);

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
    throw new GroupInvitationError(data?.message ?? data?.error ?? "Could not add you to this organization.", response.status || 502);
  }
}

export async function createGroupInvitation({
  repo,
  email,
  role,
  session,
  cookie,
  origin,
  acceptLanguage,
}: {
  repo: string;
  email: string;
  role: GroupInvitationRole;
  session: Extract<AuthSession, { isLoggedIn: true }>;
  cookie: string | null;
  origin: string;
  acceptLanguage: string | null;
}): Promise<GroupInvitation> {
  const normalizedEmail = normalizeInvitationEmail(email);
  if (!repo.trim()) throw new GroupInvitationError("Choose an organization before inviting someone.", 400);
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new GroupInvitationError("Enter a valid email address.", 400);

  const memberResult = await fetchCgsMembersWithCookie({ repo, cookie, limit: 100 });
  const actorRole = currentRole(memberResult.members, session.did);
  if (!canInvite(actorRole, role)) {
    throw new GroupInvitationError(role === "admin" ? "Only organization owners can invite admins." : "Only organization owners and admins can invite members.", 403);
  }

  const existing = await getPendingInvitation(repo, normalizedEmail);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const group = await groupDisplay(repo);
  const baseFields = {
    repo,
    email: normalizedEmail,
    role,
    status: "pending",
    inviter_did: session.did,
    inviter_handle: session.handle,
    inviter_email: session.email ?? null,
    group_name: group.name,
    group_handle: group.handle,
    expires_at: expiresAt,
    last_email_error: null,
  };

  let invitation: GroupInvitation | null;
  if (existing) {
    const updated = await supabasePatch<RawInvitation>(`/${TABLE}?id=eq.${supabaseFilterValue(existing.id)}`, {
      ...baseFields,
      updated_at: now,
    });
    invitation = normalizeInvitations(updated)[0] ?? null;
  } else {
    invitation = normalizeInvitation(await supabaseInsert<RawInvitation>(`/${TABLE}`, {
      id: crypto.randomUUID(),
      ...baseFields,
      created_at: now,
    }));
  }
  if (!invitation) throw new GroupInvitationError("Invitation could not be saved.", 502);

  try {
    await sendInvitationEmail({ invitation, origin, acceptLanguage });
    const updated = await supabasePatch<RawInvitation>(`/${TABLE}?id=eq.${supabaseFilterValue(invitation.id)}`, {
      email_sent_at: new Date().toISOString(),
      last_email_error: null,
    });
    return normalizeInvitations(updated)[0] ?? invitation;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invitation email could not be sent.";
    await supabasePatch<RawInvitation>(`/${TABLE}?id=eq.${supabaseFilterValue(invitation.id)}`, {
      last_email_error: message,
    }).catch(() => undefined);
    throw new GroupInvitationError(message, 502);
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
    await supabasePatch<RawInvitation>(`/${TABLE}?id=eq.${supabaseFilterValue(invitation.id)}`, { status: "expired" }).catch(() => undefined);
    throw new GroupInvitationError("This invitation has expired.", 410);
  }

  const sessionEmail = session.email ? normalizeInvitationEmail(session.email) : "";
  if (!sessionEmail) throw new GroupInvitationError("Your signed-in account does not have an email address available.", 403);
  if (sessionEmail !== invitation.email) {
    throw new GroupInvitationError("Sign in with the email address that received this invitation.", 403);
  }

  await addMemberViaAuthService(invitation, session.did);

  const updated = await supabasePatch<RawInvitation>(`/${TABLE}?id=eq.${supabaseFilterValue(invitation.id)}`, {
    status: "accepted",
    accepted_at: new Date().toISOString(),
    accepted_by_did: session.did,
    accepted_by_email: sessionEmail,
  });
  return normalizeInvitations(updated)[0] ?? { ...invitation, status: "accepted", acceptedAt: new Date().toISOString(), acceptedByDid: session.did, acceptedByEmail: sessionEmail };
}
