import { describe, expect, it } from "vitest";
import {
  chimeDurationSeconds,
  encodeChimeBits,
  generateChime,
  isValidDeploymentId,
  randomDeploymentIdHex,
} from "./chime";

/**
 * Reference bit sequences produced by the OpenAcousticDevices-derived Python
 * implementation (pi-taina `generate-chime.py`, itself matching
 * AudioMothChime.kt): pack time + location + deployment ID, CRC-16, then
 * Hamming(7,4). Any packing/CRC/FEC drift breaks the acoustic protocol.
 */
const REFERENCE_VECTORS: Array<{
  ts: number;
  lat: number;
  lon: number;
  id: string;
  bits: string;
}> = [
  {
    ts: 1751900000,
    lat: -1.234567,
    lon: -77.891234,
    id: "0123456789abcdef",
    bits:
      "0101000001010010111110101111110110001101101111001001011000000000000000000000000000000000111001011001001011010010001010010111111111111111111101100000100111100111001001110011010010011110101011111111011010000011111001100011001101011011000011010110001111001001101100110001101011110000101010000000001101101001110000010000010001",
  },
  {
    ts: 0,
    lat: 0,
    lon: 0,
    id: "0000000000000000",
    bits:
      "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  },
  {
    ts: 2000000000,
    lat: 47.3769,
    lon: 8.5417,
    id: "ffeeddccbbaa9988",
    bits:
      "0000000000000000100111001001100111110110000000110011110000000000000000000000000000000010001000100000100001110111100101101001011100001111000001000100010001110101101000000010001000100011110011000011000011110000110011000011001111001100110011110000000011110011110000111100000011111111111111111111110011000110011011100000101101",
  },
];

describe("encodeChimeBits", () => {
  it("matches the OpenAcousticDevices reference bit sequences", () => {
    for (const vector of REFERENCE_VECTORS) {
      const bits = encodeChimeBits(vector.ts, vector.lat, vector.lon, vector.id).join("");
      expect(bits).toBe(vector.bits);
    }
  });

  it("emits 322 bits: (21 data + 2 CRC bytes) × 14 Hamming bits", () => {
    const bits = encodeChimeBits(1751900000, 1, 2, randomDeploymentIdHex());
    expect(bits).toHaveLength(322);
  });

  it("rejects malformed deployment IDs", () => {
    expect(() => encodeChimeBits(0, 0, 0, "not-hex")).toThrow();
    expect(() => encodeChimeBits(0, 0, 0, "0123")).toThrow();
  });
});

describe("deployment IDs", () => {
  it("generates valid 16-hex-character IDs", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(isValidDeploymentId(randomDeploymentIdHex())).toBe(true);
    }
  });

  it("validates format strictly", () => {
    expect(isValidDeploymentId("0123456789abcdef")).toBe(true);
    expect(isValidDeploymentId(" 0123456789ABCDEF ")).toBe(true);
    expect(isValidDeploymentId("0123456789abcde")).toBe(false);
    expect(isValidDeploymentId("0123456789abcdeg")).toBe(false);
  });
});

describe("generateChime", () => {
  it("synthesizes a few seconds of bounded 48 kHz samples", () => {
    const samples = generateChime(1751900000, -1.234567, -77.891234, "0123456789abcdef");
    const duration = chimeDurationSeconds(samples);
    expect(duration).toBeGreaterThan(1.5);
    expect(duration).toBeLessThan(6);
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(0.75);
  });
});
