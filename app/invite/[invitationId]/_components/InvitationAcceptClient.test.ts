import { describe, expect, it } from "vitest";
import { invitationAcceptErrorKey } from "./InvitationAcceptClient";

describe("invitationAcceptErrorKey", () => {
  it.each([
    ["membership_outcome_unknown", "membershipOutcomeUnknown"],
    ["invitation_acceptance_incomplete", "acceptanceIncomplete"],
    ["unknown", "acceptError"],
    [undefined, "acceptError"],
  ])("maps %s to translated copy", (code, expected) => {
    expect(invitationAcceptErrorKey(code)).toBe(expected);
  });
});
