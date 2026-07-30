import { describe, expect, it } from "vitest";
import { isAudioMothUploadTrayFlagEnabled } from "./feature-flags";

describe("AudioMoth upload tray feature flag", () => {
  it("is disabled by default", () => {
    expect(isAudioMothUploadTrayFlagEnabled(undefined)).toBe(false);
  });

  it.each(["true", "TRUE", " true "])("can be enabled with %j", (value) => {
    expect(isAudioMothUploadTrayFlagEnabled(value)).toBe(true);
  });

  it.each(["false", "1", "yes", ""])("does not treat %j as enabled", (value) => {
    expect(isAudioMothUploadTrayFlagEnabled(value)).toBe(false);
  });
});
