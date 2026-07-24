import { describe, expect, it } from "vitest";
import { grantApplicationPermission } from "./application-permission";

describe("grantApplicationPermission", () => {
  it("allows a personal account", () => {
    expect(grantApplicationPermission({ type: "personal" })).toBe("allowed");
  });

  it.each(["owner", "admin", "member"])("allows a confirmed %s group membership", (membershipRole) => {
    expect(grantApplicationPermission({ type: "group", accountListStatus: "ready", membershipRole })).toBe("allowed");
  });

  it("waits for the active group membership before enabling Apply", () => {
    expect(grantApplicationPermission({ type: "group", accountListStatus: "loading", membershipRole: null })).toBe("loading");
  });

  it.each([
    { accountListStatus: "error" as const, membershipRole: "admin" },
    { accountListStatus: "ready" as const, membershipRole: null },
    { accountListStatus: "ready" as const, membershipRole: "unknown" },
  ])("denies an unconfirmed or unknown group context", (account) => {
    expect(grantApplicationPermission({ type: "group", ...account })).toBe("denied");
  });

  it("requires sign-in before selecting an acting account", () => {
    expect(grantApplicationPermission({ type: "signedOut" })).toBe("signIn");
  });
});
