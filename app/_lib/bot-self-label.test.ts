import { describe, expect, it } from "vitest";
import { labelsIncludeBot } from "./bot-self-label";

describe("labelsIncludeBot", () => {
  const selfLabels = (vals: string[]) => ({
    $type: "com.atproto.label.defs#selfLabels",
    values: vals.map((val) => ({ $type: "com.atproto.label.defs#selfLabel", val })),
  });

  it("detects the bot self-label", () => {
    expect(labelsIncludeBot(selfLabels(["bot"]))).toBe(true);
  });

  it("detects bot among other self-labels", () => {
    expect(labelsIncludeBot(selfLabels(["graphic-media", "bot"]))).toBe(true);
  });

  it("rejects other labels and malformed shapes", () => {
    expect(labelsIncludeBot(selfLabels(["graphic-media"]))).toBe(false);
    expect(labelsIncludeBot(undefined)).toBe(false);
    expect(labelsIncludeBot(null)).toBe(false);
    expect(labelsIncludeBot("bot")).toBe(false);
    expect(labelsIncludeBot({ values: "bot" })).toBe(false);
    expect(labelsIncludeBot({ values: [{ val: 1 }] })).toBe(false);
    expect(labelsIncludeBot({})).toBe(false);
  });
});
