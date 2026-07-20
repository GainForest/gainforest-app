import { describe, expect, it } from "vitest";
import { isAudioMothLabellingFlagEnabled } from "./feature-flags";

describe("AudioMoth labelling feature flag", () => {
  it("is available for admin review by default", () => {
    expect(isAudioMothLabellingFlagEnabled(undefined)).toBe(true);
  });

  it.each(["false", "FALSE", " false "])("can be disabled with %j", (value) => {
    expect(isAudioMothLabellingFlagEnabled(value)).toBe(false);
  });

  it("does not treat other values as disabled", () => {
    expect(isAudioMothLabellingFlagEnabled("true")).toBe(true);
  });
});
