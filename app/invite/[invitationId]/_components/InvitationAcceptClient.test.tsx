import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    membershipOutcomeUnknown: "We could not confirm that you joined. Try again.",
    errorTitle: "Could not accept invitation",
    acceptError: "Could not accept invitation.",
    tryAgain: "Try again",
  })[key] ?? key,
}));

import { InvitationAcceptErrorScene } from "./InvitationAcceptClient";

const invitation = {
  id: "81000000-0000-4000-8000-000000000001",
  repo: "did:plc:forest",
  email: "invitee@example.com",
  role: "member" as const,
  status: "pending" as const,
  inviterDid: "did:plc:owner",
  inviterHandle: "owner.example.com",
  inviterEmail: "owner@example.com",
  groupName: "Forest Circle",
  groupHandle: "forest.example.com",
  createdAt: "2026-08-18T12:00:00.000Z",
  expiresAt: "2026-08-25T12:00:00.000Z",
  acceptedAt: null,
  acceptedByDid: null,
  acceptedByEmail: null,
  emailSentAt: null,
  lastEmailError: null,
  notification: null,
};

describe("InvitationAcceptErrorScene", () => {
  it("shows localized retry guidance and a retry button for an unknown membership outcome", () => {
    const html = renderToStaticMarkup(
      <InvitationAcceptErrorScene
        invitation={invitation}
        error="Untranslated server fallback"
        errorCode="membership_outcome_unknown"
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain("We could not confirm that you joined. Try again.");
    expect(html).not.toContain("Untranslated server fallback");
    expect(html).toContain(">Try again</button>");
  });
});
