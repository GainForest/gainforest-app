import { describe, expect, it } from "vitest";
import { heroDateLabel, splitAccountLinks } from "./AccountProfileHero";

describe("heroDateLabel", () => {
  it("uses a year-only date for an organization overview", () => {
    expect(heroDateLabel("2022-06-01T00:00:00.000Z", "en-US", true)).toBe("2022");
  });

  it("omits invalid dates instead of showing misleading metadata", () => {
    expect(heroDateLabel("not-a-date", "en-US", false)).toBeNull();
  });
});

describe("splitAccountLinks", () => {
  it("keeps a legacy root website in the hero and groups the remaining social links", () => {
    expect(splitAccountLinks(null, ["https://gainforest.earth/", "https://instagram.com/gainforest"])).toEqual({
      website: "https://gainforest.earth/",
      socialLinks: ["https://instagram.com/gainforest"],
    });
  });

  it("uses an explicit website without removing unrelated social links", () => {
    expect(splitAccountLinks(" https://gainforest.earth ", ["https://example.org/donate", "  "])).toEqual({
      website: "https://gainforest.earth",
      socialLinks: ["https://example.org/donate"],
    });
  });
});
