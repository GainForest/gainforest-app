import { describe, expect, it } from "vitest";
import { audiomothStorageKey } from "./ac-audio";

describe("audiomothStorageKey", () => {
  const key = "audiomoth/did:plc:abc123/unassigned/20240402_212051.WAV";

  it("extracts the key from an absolute accessUri", () => {
    expect(audiomothStorageKey(`https://www.gainforest.app/api/audiomoth/recordings?key=${encodeURIComponent(key)}`)).toBe(key);
  });

  it("extracts the key regardless of origin (previews, localhost)", () => {
    expect(audiomothStorageKey(`http://localhost:3040/api/audiomoth/recordings?key=${encodeURIComponent(key)}`)).toBe(key);
  });

  it("accepts a relative accessUri", () => {
    expect(audiomothStorageKey(`/api/audiomoth/recordings?key=${encodeURIComponent(key)}`)).toBe(key);
  });

  it("returns null for missing or empty values", () => {
    expect(audiomothStorageKey(null)).toBeNull();
    expect(audiomothStorageKey(undefined)).toBeNull();
    expect(audiomothStorageKey("")).toBeNull();
  });

  it("returns null for third-party URIs that merely carry a key param", () => {
    expect(audiomothStorageKey(`https://evil.example/download?key=${encodeURIComponent(key)}`)).toBeNull();
  });

  it("returns null when the key is outside the audiomoth namespace", () => {
    expect(
      audiomothStorageKey("https://www.gainforest.app/api/audiomoth/recordings?key=data-jobs%2Fsomething.zip"),
    ).toBeNull();
  });

  it("returns null when there is no key param", () => {
    expect(audiomothStorageKey("https://www.gainforest.app/api/audiomoth/recordings")).toBeNull();
  });
});
