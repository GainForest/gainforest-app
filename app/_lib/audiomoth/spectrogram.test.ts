import { describe, expect, it } from "vitest";
import { computeSpectrogram, fftRadix2 } from "./spectrogram";

function makeSine(frequencyHz: number, sampleRate: number, seconds: number, amplitude = 0.8): Int16Array {
  const out = new Int16Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate));
  }
  return out;
}

describe("fftRadix2", () => {
  it("resolves a single complex exponential into one bin", () => {
    const n = 64;
    const k = 5;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      re[i] = Math.cos((2 * Math.PI * k * i) / n);
      im[i] = Math.sin((2 * Math.PI * k * i) / n);
    }
    fftRadix2(re, im);
    for (let bin = 0; bin < n; bin += 1) {
      const magnitude = Math.hypot(re[bin]!, im[bin]!);
      if (bin === k) expect(magnitude).toBeCloseTo(n, 6);
      else expect(magnitude).toBeLessThan(1e-6);
    }
  });

  it("rejects non-power-of-two sizes", () => {
    expect(() => fftRadix2(new Float64Array(12), new Float64Array(12))).toThrow();
  });
});

describe("computeSpectrogram", () => {
  it("puts a pure tone's energy in the right frequency bin", () => {
    const sampleRate = 8000;
    const fftSize = 256;
    const toneHz = 1000;
    const samples = makeSine(toneHz, sampleRate, 1);
    const { columns, bins, magnitudesDb } = computeSpectrogram(samples, { fftSize, hopSize: 256 });

    expect(bins).toBe(fftSize / 2);
    expect(columns).toBeGreaterThan(10);

    const expectedBin = Math.round(toneHz / (sampleRate / fftSize)); // = 32
    const midCol = Math.floor(columns / 2);
    let peakBin = 0;
    for (let bin = 1; bin < bins; bin += 1) {
      if (magnitudesDb[midCol * bins + bin]! > magnitudesDb[midCol * bins + peakBin]!) peakBin = bin;
    }
    expect(peakBin).toBe(expectedBin);
    // A 0.8 amplitude sine ≈ -1.9 dBFS; windowed estimate should be within a few dB.
    expect(magnitudesDb[midCol * bins + peakBin]!).toBeGreaterThan(-6);
    expect(magnitudesDb[midCol * bins + peakBin]!).toBeLessThan(1);
  });

  it("reports near-silence away from the tone", () => {
    const samples = makeSine(1000, 8000, 1);
    const { columns, bins, magnitudesDb } = computeSpectrogram(samples, { fftSize: 256, hopSize: 256 });
    const midCol = Math.floor(columns / 2);
    // Far away from the 1kHz bin (bin 32): check bin 100.
    expect(magnitudesDb[midCol * bins + 100]!).toBeLessThan(-60);
  });
});
