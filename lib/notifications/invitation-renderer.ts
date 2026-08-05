import "server-only";

import {
  renderGroupInvitationEmailTemplate,
  resolveGroupInvitationEmailLocale,
} from "@/lib/email/group-invitation-template";
import type { Json, NotificationRenderer, RenderableRow, RenderedNotification } from "./types";

const ERROR_MESSAGE = "Invitation notification row is invalid. Verify the transactional producer and template registry.";

interface InvitationPayload {
  readonly invitationId: string;
  readonly invitedEmail: string;
  readonly organizationName: string | null;
  readonly inviterName: string | null;
  readonly inviterUrl: string | null;
  readonly role: "member" | "admin";
  readonly acceptUrl: string;
  readonly siteUrl: string;
}

function object(value: Json): Record<string, Json> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, Json>
    : null;
}

function optionalString(value: Json | undefined, maximum: number): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === "string" && value.length <= maximum);
}

function httpUrl(value: Json | undefined): value is string {
  if (typeof value !== "string" || value.length > 1_024) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function decode(value: Json): InvitationPayload | null {
  const item = object(value);
  if (!item
    || typeof item.invitationId !== "string"
    || item.invitationId.length > 64
    || typeof item.invitedEmail !== "string"
    || item.invitedEmail.length > 320
    || !optionalString(item.organizationName, 200)
    || !optionalString(item.inviterName, 200)
    || !optionalString(item.inviterUrl, 1_024)
    || !(item.inviterUrl === undefined || item.inviterUrl === null || httpUrl(item.inviterUrl))
    || (item.role !== "member" && item.role !== "admin")
    || !httpUrl(item.acceptUrl)
    || !httpUrl(item.siteUrl)) return null;
  return item as unknown as InvitationPayload;
}

export class InvitationNotificationRenderer implements NotificationRenderer {
  async render(row: RenderableRow): Promise<RenderedNotification> {
    const input = decode(row.payload);
    if (row.eventType !== "invitation"
      || row.templateKey !== "organization-invitation"
      || !input
      || row.sourceId !== input.invitationId
      || row.recipientEmail !== input.invitedEmail) throw new Error(ERROR_MESSAGE);

    return renderGroupInvitationEmailTemplate({
      locale: resolveGroupInvitationEmailLocale({ explicitLocale: row.locale }),
      invitedEmail: input.invitedEmail,
      organizationName: input.organizationName,
      inviterName: input.inviterName,
      inviterUrl: input.inviterUrl,
      role: input.role,
      acceptUrl: input.acceptUrl,
      siteUrl: input.siteUrl,
    });
  }
}
