import { describe, expect, it } from "vitest";
import { heroDateLabel } from "./AccountProfileHero";

describe("heroDateLabel", () => {
  it("uses a year-only date for an organization overview", () => {
    expect(heroDateLabel("2022-06-01T00:00:00.000Z", "en-US", true)).toBe("2022");
  });

  it("omits invalid dates instead of showing misleading metadata", () => {
    expect(heroDateLabel("not-a-date", "en-US", false)).toBeNull();
  });
});
