import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const DID = "did:plc:example";
const OTHER_DID = "did:plc:other";
const LAT = 17.8807;
const LON = 102.734;

async function loadFuzz() {
  vi.resetModules();
  return (await import("./org-location-fuzz")).fuzzCoordinateForDid;
}

describe("fuzzCoordinateForDid", () => {
  beforeEach(() => {
    vi.stubEnv("COORDINATE_FUZZING_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is deterministic — saving the same location twice publishes the same point", async () => {
    const fuzz = await loadFuzz();
    expect(fuzz(DID, LAT, LON)).toEqual(fuzz(DID, LAT, LON));
  });

  it("gives a different offset to a different organization", async () => {
    const fuzz = await loadFuzz();
    expect(fuzz(DID, LAT, LON)).not.toEqual(fuzz(OTHER_DID, LAT, LON));
  });

  it("gives an unrelated offset to a nearby coordinate, so a coarse guess can't be checked", async () => {
    const fuzz = await loadFuzz();
    const exact = fuzz(DID, LAT, LON);
    const nudged = fuzz(DID, LAT + 0.00001, LON);
    // A 1 m change in the input moves the output far more than 1 m.
    expect(Math.abs(nudged.latitude - exact.latitude)).toBeGreaterThan(0.0001);
  });

  it("stays within the advertised per-axis offset", async () => {
    const fuzz = await loadFuzz();
    for (let i = 0; i < 200; i++) {
      const lat = -80 + i * 0.8;
      const out = fuzz(DID, lat, LON);
      expect(Math.abs(out.latitude - lat)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(out.longitude - LON)).toBeLessThanOrEqual(0.1);
    }
  });

  it("clamps latitude and wraps longitude at the antimeridian", async () => {
    const fuzz = await loadFuzz();
    for (let i = 0; i < 50; i++) {
      const pole = fuzz(DID, 89.95, i);
      expect(pole.latitude).toBeLessThanOrEqual(90);
      const wrap = fuzz(DID, 0, 179.95 - i * 0.001);
      expect(wrap.longitude).toBeGreaterThanOrEqual(-180);
      expect(wrap.longitude).toBeLessThanOrEqual(180);
    }
  });

  it("refuses to fuzz in production without a secret", async () => {
    vi.stubEnv("COORDINATE_FUZZING_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const fuzz = await loadFuzz();
    expect(() => fuzz(DID, LAT, LON)).toThrow(/COORDINATE_FUZZING_SECRET/);
  });

  it("falls back with a warning outside production", async () => {
    vi.stubEnv("COORDINATE_FUZZING_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fuzz = await loadFuzz();
    expect(() => fuzz(DID, LAT, LON)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
