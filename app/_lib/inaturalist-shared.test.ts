import { describe, expect, it } from "vitest";
import { parseINaturalistProjectUrl } from "./inaturalist-shared";

describe("parseINaturalistProjectUrl", () => {
  it("accepts a normal project URL", () => {
    expect(parseINaturalistProjectUrl("https://www.inaturalist.org/projects/cobec-biodiversity-blocks")?.slug).toBe("cobec-biodiversity-blocks");
  });

  it("accepts missing protocol, query strings, and subroutes", () => {
    expect(parseINaturalistProjectUrl("www.inaturalist.org/projects/cobec-biodiversity-blocks?tab=observations")?.slug).toBe("cobec-biodiversity-blocks");
    expect(parseINaturalistProjectUrl("inaturalist.org/projects/cobec-biodiversity-blocks/journal")?.slug).toBe("cobec-biodiversity-blocks");
  });

  it("accepts project slugs and relative project paths", () => {
    expect(parseINaturalistProjectUrl("cobec-biodiversity-blocks")?.normalizedUrl).toBe("https://www.inaturalist.org/projects/cobec-biodiversity-blocks");
    expect(parseINaturalistProjectUrl("/projects/cobec-biodiversity-blocks")?.slug).toBe("cobec-biodiversity-blocks");
    expect(parseINaturalistProjectUrl("projects/cobec-biodiversity-blocks")?.slug).toBe("cobec-biodiversity-blocks");
  });

  it("rejects non-iNaturalist URLs", () => {
    expect(parseINaturalistProjectUrl("https://example.com/projects/cobec-biodiversity-blocks")).toBeNull();
  });
});
