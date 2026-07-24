import { describe, expect, it } from "vitest";
import { isSoundscapeNavigationKey, nextSoundscapePointIndex } from "./SoundscapeClock";

describe("soundscape chart keyboard navigation", () => {
  it("moves through points and wraps with arrow keys", () => {
    expect(nextSoundscapePointIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextSoundscapePointIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextSoundscapePointIndex(0, "ArrowLeft", 3)).toBe(2);
  });

  it("supports Home and End", () => {
    expect(nextSoundscapePointIndex(2, "Home", 4)).toBe(0);
    expect(nextSoundscapePointIndex(0, "End", 4)).toBe(3);
  });

  it("consumes navigation keys even when one point cannot move", () => {
    expect(isSoundscapeNavigationKey("ArrowRight")).toBe(true);
    expect(nextSoundscapePointIndex(0, "ArrowRight", 1)).toBe(0);
    expect(isSoundscapeNavigationKey("Tab")).toBe(false);
  });
});
