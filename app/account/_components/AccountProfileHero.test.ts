import { describe, expect, it } from "vitest";
import { splitAccountLinks } from "./AccountProfileHero";

describe("splitAccountLinks", () => {
  it("uses a root organization URL as the named website", () => {
    expect(splitAccountLinks(null, ["https://mangaroa-farms.nz/", "https://instagram.com/mangaroafarms"])).toEqual({
      website: "https://mangaroa-farms.nz/",
      socialLinks: ["https://instagram.com/mangaroafarms"],
    });
  });

  it("does not mislabel contact and donation links as an organization website", () => {
    const links = ["https://example.org/contact", "https://example.org/donate"];
    expect(splitAccountLinks(null, links)).toEqual({ website: null, socialLinks: links });
  });

  it("keeps an explicit website separate from organization reference links", () => {
    expect(splitAccountLinks("https://mangaroa-farms.nz", ["https://example.org/donate"])).toEqual({
      website: "https://mangaroa-farms.nz",
      socialLinks: ["https://example.org/donate"],
    });
  });
});
