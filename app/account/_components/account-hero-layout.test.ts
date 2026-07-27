import { describe, expect, it } from "vitest";
import { accountHeroPresentation } from "./account-hero-layout";

describe("account hero presentation", () => {
  it("keeps the full hero on Overview", () => {
    expect(accountHeroPresentation("/account/gainforest", "gainforest")).toBe("full");
  });

  it.each([
    "/account/gainforest/projects",
    "/account/gainforest/observations",
    "/account/gainforest/settings",
  ])("uses a compact hero on %s", (pathname) => {
    expect(accountHeroPresentation(pathname, "gainforest")).toBe("compact");
  });
});
