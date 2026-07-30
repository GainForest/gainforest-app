import { describe, expect, it } from "vitest";
import { isDeletableAudiomothKey } from "./storage-keys";

const ME = "did:plc:rs55bgvfmpwkspawejnyv775";
const OTHER = "did:plc:someoneelse123456789abcd";

describe("isDeletableAudiomothKey", () => {
  it("allows my own uploaded WAVs (unassigned and deployment folders)", () => {
    expect(isDeletableAudiomothKey(`audiomoth/${ME}/unassigned/20240402_212051.WAV`, ME)).toBe("ok");
    expect(isDeletableAudiomothKey(`audiomoth/${ME}/0123456789abcdef/rec.wav`, ME)).toBe("ok");
  });

  it("refuses another user's namespace", () => {
    expect(isDeletableAudiomothKey(`audiomoth/${OTHER}/unassigned/20240402_212051.WAV`, ME)).toBe("forbidden");
  });

  it("refuses a DID that is a prefix of mine (and vice versa)", () => {
    expect(isDeletableAudiomothKey(`audiomoth/${ME}abc/unassigned/a.wav`, ME)).toBe("forbidden");
    expect(isDeletableAudiomothKey(`audiomoth/${ME.slice(0, -2)}/unassigned/a.wav`, ME)).toBe("forbidden");
  });

  it("refuses case-shifted namespaces (keys are written verbatim, lowercase)", () => {
    expect(isDeletableAudiomothKey(`audiomoth/${ME.toUpperCase()}/unassigned/a.wav`.replace("AUDIOMOTH", "audiomoth"), ME)).not.toBe("ok");
  });

  it("refuses anything outside the audiomoth namespace", () => {
    expect(isDeletableAudiomothKey("data-jobs/archive.zip", ME)).toBe("not_found");
    expect(isDeletableAudiomothKey(`prefix/audiomoth/${ME}/unassigned/a.wav`, ME)).toBe("not_found");
  });

  it("refuses non-wav objects", () => {
    expect(isDeletableAudiomothKey(`audiomoth/${ME}/unassigned/metadata.json`, ME)).toBe("not_found");
    expect(isDeletableAudiomothKey(`audiomoth/${ME}/unassigned/wav`, ME)).toBe("not_found");
  });

  it("refuses dot segments", () => {
    expect(isDeletableAudiomothKey(`audiomoth/${ME}/unassigned/..`, ME)).toBe("not_found");
    expect(isDeletableAudiomothKey(`audiomoth/${ME}/unassigned/.`, ME)).toBe("not_found");
  });

  it("refuses slashes smuggled into the filename", () => {
    expect(isDeletableAudiomothKey(`audiomoth/${ME}/unassigned/a/b.wav`, ME)).toBe("not_found");
    expect(isDeletableAudiomothKey(`audiomoth/${ME}/unassigned/${encodeURIComponent("../x.wav")}`, ME)).toBe("not_found");
  });

  it("refuses empty and junk keys", () => {
    expect(isDeletableAudiomothKey("", ME)).toBe("not_found");
    expect(isDeletableAudiomothKey("audiomoth", ME)).toBe("not_found");
    expect(isDeletableAudiomothKey(`audiomoth/${ME}/badfolder/a.wav`, ME)).toBe("not_found");
  });
});
