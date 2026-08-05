import "server-only";

import { renderWelcomeEmailTemplate, resolveWelcomeEmailLocale } from "@/lib/email/welcome-template";
import type { Json, NotificationRenderer, RenderableRow, RenderedNotification } from "./types";

const ERROR_MESSAGE = "Welcome notification row is invalid. Verify the event producer and template registry.";

interface WelcomePayload {
  readonly displayName: string | null;
  readonly occurredAt: string;
  readonly organizationDid?: string | null;
  readonly organizationName?: string | null;
  readonly userDid: string;
}

function object(value: Json): Record<string, Json> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, Json>
    : null;
}

function optionalBoundedString(value: Json | undefined, maximum: number): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === "string" && value.length <= maximum);
}

function validDid(value: Json | undefined): value is string {
  return typeof value === "string"
    && value.length <= 256
    && /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(value);
}

function payload(value: Json): WelcomePayload | null {
  const item = object(value);
  if (!item
    || !optionalBoundedString(item.displayName, 200)
    || typeof item.occurredAt !== "string"
    || item.occurredAt.length > 64
    || Number.isNaN(new Date(item.occurredAt).getTime())
    || !validDid(item.userDid)
    || !optionalBoundedString(item.organizationName, 200)
    || !(item.organizationDid === undefined || item.organizationDid === null || validDid(item.organizationDid))) {
    return null;
  }
  return item as unknown as WelcomePayload;
}

export class WelcomeNotificationRenderer implements NotificationRenderer {
  async render(row: RenderableRow): Promise<RenderedNotification> {
    const expectedTemplate = row.eventType === "signup"
      ? "welcome-signup"
      : row.eventType === "membership_joined"
        ? "welcome-membership-joined"
        : null;
    const input = payload(row.payload);
    if (!expectedTemplate || row.templateKey !== expectedTemplate || !input) throw new Error(ERROR_MESSAGE);

    return renderWelcomeEmailTemplate({
      variant: row.eventType === "signup" ? "direct-signup" : "organization-invite",
      locale: resolveWelcomeEmailLocale({ explicitLocale: row.locale }),
      name: input.displayName,
      organizationName: input.organizationName ?? null,
      invitedByName: undefined,
      invitedByEmail: undefined,
    });
  }
}
