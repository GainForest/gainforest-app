import { afterEach, describe, expect, it, vi } from "vitest";
import { renderGroupInvitationEmailTemplate } from "./group-invitation-template";

describe("renderGroupInvitationEmailTemplate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the production site for default email assets", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    const rendered = renderGroupInvitationEmailTemplate({
      locale: "en",
      invitedEmail: "member@example.com",
      role: "member",
      acceptUrl: "https://www.gainforest.app/invite/example",
    });

    expect(rendered.html).toContain("https://www.gainforest.app/icons/icon-192.png");
    expect(rendered.html).not.toContain("certs-rewrite.gainforest.app");
  });
});
