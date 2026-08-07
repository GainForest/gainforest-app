import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: () => null }));

import {
  invitationDeliveryState,
  PendingInvitationRow,
} from "./GroupMembers";
import type { CgsPendingInvitation } from "../../_lib/cgs";

const invitation: CgsPendingInvitation = {
  id: "81000000-0000-4000-8000-000000000001",
  email: "invitee@example.com",
  role: "member",
  status: "pending",
  notification: {
    outboxId: "10000000-0000-4000-8000-000000000001",
    status: "queued",
    retryable: true,
  },
};

describe("invitationDeliveryState", () => {
  it.each([
    ["sent", "sent"],
    ["waiting_recipient", "delayed"],
    ["queued", "delayed"],
    ["processing", "delayed"],
    ["suppressed", "unavailable"],
    ["dead", "unavailable"],
    [null, "unavailable"],
  ] as const)("classifies %s as %s", (status, expected) => {
    expect(invitationDeliveryState(status)).toBe(expected);
  });
});

describe("PendingInvitationRow", () => {
  it("hides invitation-link copying when the viewer cannot manage the invitation", () => {
    const html = renderToStaticMarkup(createElement(PendingInvitationRow, {
      invitation,
      roleLabel: "Member",
      statusLabel: "Pending · Email delayed",
      canCancel: false,
      canCopy: false,
      canRetry: false,
      isPending: false,
      retryLabel: "Retry",
      copyLabel: "Copy link",
      cancelLabel: "Cancel",
      onRetry: () => undefined,
      onCopy: () => undefined,
      onCancel: () => undefined,
    }));

    expect(html).not.toContain("Copy link");
  });

  it("shows invitation-link copying to an authorized manager", () => {
    const html = renderToStaticMarkup(createElement(PendingInvitationRow, {
      invitation,
      roleLabel: "Member",
      statusLabel: "Pending · Email delayed",
      canCancel: true,
      canCopy: true,
      canRetry: true,
      isPending: false,
      retryLabel: "Retry",
      copyLabel: "Copy link",
      cancelLabel: "Cancel",
      onRetry: () => undefined,
      onCopy: () => undefined,
      onCancel: () => undefined,
    }));

    expect(html).toContain("Copy link");
  });
});
