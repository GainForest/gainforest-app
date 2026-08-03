import { describe, expect, it } from "vitest";
import { overviewAccountLinks } from "./AccountStatList";

describe("overviewAccountLinks", () => {
  it("keeps every social link in the combined social tile", () => {
    const socialLinks = ["https://mangaroa-farms.nz/", "https://instagram.com/mangaroafarms"];

    expect(overviewAccountLinks(null, socialLinks)).toEqual({
      website: null,
      socialLinks,
    });
  });

  it("keeps an explicit website separate without removing any social link", () => {
    expect(overviewAccountLinks(" https://mangaroa-farms.nz ", ["https://example.org/donate"])).toEqual({
      website: "https://mangaroa-farms.nz",
      socialLinks: ["https://example.org/donate"],
    });
  });
});
