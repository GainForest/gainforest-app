import { describe, expect, it } from "vitest";
import { normalizeAuthRedirect } from "./redirects";

describe("normalizeAuthRedirect", () => {
  it("keeps local paths and decoded query strings", () => {
    expect(normalizeAuthRedirect("/feed?view=following")).toBe("/feed?view=following");
    expect(normalizeAuthRedirect("%2Fprojects%3Ftab%3Dsites")).toBe("/projects?tab=sites");
  });

  it("turns absolute URLs into same-app paths", () => {
    expect(normalizeAuthRedirect("https://example.org/projects?tab=sites#map")).toBe("/projects?tab=sites#map");
  });

  it("rejects protocol-relative and malformed input", () => {
    expect(normalizeAuthRedirect("//example.org/path")).toBe("/manage");
    expect(normalizeAuthRedirect("not a redirect")).toBe("/manage");
    expect(normalizeAuthRedirect(undefined)).toBe("/manage");
  });
});
