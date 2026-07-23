import { describe, expect, it } from "vitest";
import { isFeedFilterVisible } from "./feed-visibility";

describe("feed filter visibility", () => {
  it("hides viewer and moderator filters until their gates pass", () => {
    expect(isFeedFilterVisible({ authOnly: true }, false, false)).toBe(false);
    expect(isFeedFilterVisible({ authOnly: true }, true, false)).toBe(true);
    expect(isFeedFilterVisible({ adminOnly: true }, true, false)).toBe(false);
    expect(isFeedFilterVisible({ adminOnly: true }, true, true)).toBe(true);
  });
});
