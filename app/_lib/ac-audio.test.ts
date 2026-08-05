import { describe, expect, it } from "vitest";
import {
  audiomothStorageKey,
  indexUploadedRecordingKeys,
  legacyRecordingKey,
  type UploadedRecordingKeys,
} from "./ac-audio";

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

describe("indexUploadedRecordingKeys", () => {
  const emptyKeys = (): UploadedRecordingKeys => ({
    cids: new Set(),
    legacy: new Set(),
    countsByDeployment: new Map(),
  });

  it("indexes CID-bearing records by content only — never by name+size", () => {
    // Two AudioMoths on the same schedule produce files with identical names
    // and sizes; only the content CID tells their recordings apart.
    const keys = emptyKeys();
    indexUploadedRecordingKeys(keys, {
      originalCid: "bafkreiabc",
      name: "20260801_060000.WAV",
      metadata: { fileSizeBytes: 105_600_044 },
    });
    expect(keys.cids.has("bafkreiabc")).toBe(true);
    expect(keys.legacy.has(legacyRecordingKey("20260801_060000.WAV", 105_600_044))).toBe(false);
  });

  it("indexes records without a CID by name+size (pre-CID fallback)", () => {
    const keys = emptyKeys();
    indexUploadedRecordingKeys(keys, {
      name: "20240402_212051.WAV",
      metadata: { fileSizeBytes: 42 },
    });
    expect(keys.cids.size).toBe(0);
    expect(keys.legacy.has(legacyRecordingKey("20240402_212051.WAV", 42))).toBe(true);
  });

  it("counts recordings per deployment", () => {
    const keys = emptyKeys();
    const dep = "at://did:plc:abc/app.gainforest.ac.deployment/xyz";
    indexUploadedRecordingKeys(keys, { originalCid: "bafkrei1", deploymentRef: dep });
    indexUploadedRecordingKeys(keys, { originalCid: "bafkrei2", deploymentRef: dep });
    expect(keys.countsByDeployment.get(dep)).toBe(2);
  });

  it("ignores malformed values", () => {
    const keys = emptyKeys();
    indexUploadedRecordingKeys(keys, null);
    indexUploadedRecordingKeys(keys, "nope");
    indexUploadedRecordingKeys(keys, { name: 7, metadata: { fileSizeBytes: "big" } });
    expect(keys.cids.size).toBe(0);
    expect(keys.legacy.size).toBe(0);
    expect(keys.countsByDeployment.size).toBe(0);
  });
});
