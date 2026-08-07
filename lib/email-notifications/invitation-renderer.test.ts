import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderGroupInvitationEmailTemplate } from "@/lib/email/group-invitation-template";
import { InvitationNotificationRenderer } from "./invitation-renderer";
import type { RenderableRow } from "./types";

const row: RenderableRow = {
  id: "10000000-0000-4000-8000-000000000001",
  eventType: "invitation",
  payload: {
    invitationId: "81000000-0000-4000-8000-000000000001",
    invitedEmail: "invitee@example.com",
    organizationName: "Forest Circle",
    inviterName: "Forest Owner",
    inviterUrl: "https://example.test/account/owner",
    role: "member",
    acceptUrl: "https://example.test/invite/81000000-0000-4000-8000-000000000001",
    siteUrl: "https://example.test",
  },
  sourceId: "81000000-0000-4000-8000-000000000001",
  recipientEmail: "invitee@example.com",
  templateKey: "organization-invitation",
  locale: "pt-BR",
};

describe("InvitationNotificationRenderer", () => {
  it("renders the committed payload through the existing localized invitation template", async () => {
    await expect(new InvitationNotificationRenderer().render(row)).resolves.toEqual(
      renderGroupInvitationEmailTemplate({
        locale: "pt",
        invitedEmail: "invitee@example.com",
        organizationName: "Forest Circle",
        inviterName: "Forest Owner",
        inviterUrl: "https://example.test/account/owner",
        role: "member",
        acceptUrl: "https://example.test/invite/81000000-0000-4000-8000-000000000001",
        siteUrl: "https://example.test",
      }),
    );
  });

  it.each([
    [{ ...row, eventType: "signup" }, "event type"],
    [{ ...row, sourceId: "81000000-0000-4000-8000-000000000099" }, "source"],
    [{ ...row, templateKey: "other" }, "template"],
    [{ ...row, recipientEmail: "other@example.com" }, "recipient"],
    [{ ...row, payload: { ...row.payload as object, role: "owner" } }, "role"],
    [{ ...row, payload: { ...row.payload as object, acceptUrl: "http://example.test/invite/id" } }, "insecure accept URL"],
    [{ ...row, payload: { invitedEmail: "private@example.com" } }, "payload"],
  ])("rejects invalid %s input with a fixed redacted error", async (invalid, _label) => {
    const error = await new InvitationNotificationRenderer().render(invalid as RenderableRow).catch((reason: unknown) => reason);
    expect((error as Error).message).toBe("Invitation notification row is invalid. Verify the transactional producer and template registry.");
    expect((error as Error).message).not.toContain("private@example.com");
    expect((error as Error).stack ?? "").not.toContain("private@example.com");
  });
});
