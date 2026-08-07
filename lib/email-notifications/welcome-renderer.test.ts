import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderWelcomeEmailTemplate } from "@/lib/email/welcome-template";
import { WelcomeNotificationRenderer } from "./welcome-renderer";
import type { RenderableRow } from "./types";

function row(overrides: Partial<RenderableRow> = {}): RenderableRow {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    eventType: "signup",
    payload: {
      displayName: "Forest Member",
      occurredAt: "2026-08-06T01:00:00.000Z",
      userDid: "did:plc:user",
    },
    sourceId: "auth-event-1",
    recipientEmail: "member@example.com",
    templateKey: "welcome-signup",
    locale: "en",
    ...overrides,
  };
}

describe("WelcomeNotificationRenderer", () => {
  it("renders signup bytes through the existing direct-signup template", async () => {
    const renderer = new WelcomeNotificationRenderer();
    await expect(renderer.render(row())).resolves.toEqual(renderWelcomeEmailTemplate({
      variant: "direct-signup",
      locale: "en",
      name: "Forest Member",
      organizationName: null,
      invitedByName: undefined,
      invitedByEmail: undefined,
    }));
  });

  it("renders membership bytes through the existing organization template", async () => {
    const renderer = new WelcomeNotificationRenderer();
    const membership = row({
      eventType: "membership_joined",
      templateKey: "welcome-membership-joined",
      locale: "pt-BR",
      payload: {
        displayName: null,
        occurredAt: "2026-08-06T01:00:00.000Z",
        organizationDid: "did:plc:forest",
        organizationName: "Forest Circle",
        userDid: "did:plc:user",
      },
    });
    const rendered = await renderer.render(membership);
    expect(rendered).toEqual(renderWelcomeEmailTemplate({
      variant: "organization-invite",
      locale: "pt",
      name: null,
      organizationName: "Forest Circle",
      invitedByName: undefined,
      invitedByEmail: undefined,
    }));
    expect(rendered.subject).toContain("Forest Circle");
  });

  it("rejects DIDs that fail AT Protocol syntax validation", async () => {
    const invalid = row({
      payload: {
        displayName: "Forest Member",
        occurredAt: "2026-08-06T01:00:00.000Z",
        userDid: "did:plc:%",
      },
    });

    await expect(new WelcomeNotificationRenderer().render(invalid)).rejects.toThrow(
      "Welcome notification row is invalid. Verify the event producer and template registry.",
    );
  });

  it.each([
    [row({ templateKey: "other" }), "template"],
    [row({ eventType: "invitation" }), "event"],
    [row({ payload: { displayName: "private@example.com", userDid: 42 } }), "payload"],
  ])("rejects invalid %s input with a fixed redacted error", async (invalid) => {
    const error = await new WelcomeNotificationRenderer().render(invalid).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Welcome notification row is invalid. Verify the event producer and template registry.");
    expect(JSON.stringify(error)).not.toContain("private@example.com");
  });
});
