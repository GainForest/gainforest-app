/**
 * Soundscape analysis: short-time FFT over an AudioMoth recording, band power
 * in four frequency ranges, and "power minus noise" (PMN) — how far the
 * loudest moment in each band rises above that recording's background level.
 *
 * The output mirrors classic acoustic-monitoring soundscape clocks: one max
 * PMN value per frequency band per recording, plotted around a 24-hour dial.
 */

import type { WavRecording } from "./audiomoth";

export type FrequencyBand = {
  id: string;
  /** Exact legend label used by the GainForest soundscape plots. */
  label: string;
  minHz: number;
  maxHz: number;
};

/**
 * The same five frequency bins the GainForest xprize soundscape pipeline uses
 * (github.com/GainForest/xprize CircularMultiLineChart). Labels are shown
 * verbatim in the legend. The top bin reaches 60 kHz, so it only carries
 * signal for high-sample-rate AudioMoth recordings (≥120 kHz).
 */
export const FREQUENCY_BANDS: readonly FrequencyBand[] = [
  { id: "b0", label: "0-1500", minHz: 0, maxHz: 1500 },
  { id: "b1", label: "1500-5000", minHz: 1500, maxHz: 5000 },
  { id: "b2", label: "5000-10000", minHz: 5000, maxHz: 10000 },
  { id: "b3", label: "10k-20000", minHz: 10000, maxHz: 20000 },
  { id: "b4", label: "20k-60000", minHz: 20000, maxHz: 60000 },
] as const;

/** Colours matching the reference matplotlib figure (blue→purple). */
export const BAND_COLORS = ["#1f3fd6", "#189d18", "#f0a500", "#e01a1a", "#8e30b0"] as const;

export function formatBandLabel(band: FrequencyBand): string {
  return band.label;
}

/** Analysis window (FFT size). ~21ms at 48 kHz. */
export const ANALYSIS_WINDOW_SIZE = 1024;
/** Cap on analyzed windows per file so huge recordings stay fast. */
const MAX_WINDOWS_PER_RECORDING = 1500;
/** Percentile of window power used as the background-noise estimate. */
const NOISE_PERCENTILE = 0.1;
const YIELD_EVERY_WINDOWS = 200;

export class RecordingTooShortError extends Error {
  constructor() {
    super("Recording shorter than one analysis window");
    this.name = "RecordingTooShortError";
  }
}

// ---------------------------------------------------------------------------
// FFT (iterative radix-2, in place)
// ---------------------------------------------------------------------------

export function fftRadix2(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n !== imag.length || (n & (n - 1)) !== 0) {
    throw new Error("FFT size must be a power of two");
  }

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tempReal = real[i];
      real[i] = real[j];
      real[j] = tempReal;
      const tempImag = imag[i];
      imag[i] = imag[j];
      imag[j] = tempImag;
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const rootReal = Math.cos(angle);
    const rootImag = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let twiddleReal = 1;
      let twiddleImag = 0;
      const half = length >> 1;
      for (let k = 0; k < half; k++) {
        const evenIndex = start + k;
        const oddIndex = start + k + half;
        const oddReal = real[oddIndex] * twiddleReal - imag[oddIndex] * twiddleImag;
        const oddImag = real[oddIndex] * twiddleImag + imag[oddIndex] * twiddleReal;
        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;
        const nextTwiddleReal = twiddleReal * rootReal - twiddleImag * rootImag;
        twiddleImag = twiddleReal * rootImag + twiddleImag * rootReal;
        twiddleReal = nextTwiddleReal;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Recording analysis
// ---------------------------------------------------------------------------

export type RecordingAnalysis = {
  /** Max power-minus-noise per band (linear power, >= 0). */
  maxPmnDb: number[];
  analyzedWindows: number;
};

const hannWindow = (() => {
  const values = new Float64Array(ANALYSIS_WINDOW_SIZE);
  for (let i = 0; i < ANALYSIS_WINDOW_SIZE; i++) {
    values[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (ANALYSIS_WINDOW_SIZE - 1));
  }
  return values;
})();

function bandBinRanges(sampleRate: number): Array<{ start: number; end: number }> {
  const hzPerBin = sampleRate / ANALYSIS_WINDOW_SIZE;
  const nyquistBin = ANALYSIS_WINDOW_SIZE / 2;
  return FREQUENCY_BANDS.map((band) => {
    const start = Math.max(1, Math.ceil(band.minHz / hzPerBin));
    const end = Math.min(nyquistBin, Math.floor(band.maxHz / hzPerBin));
    return { start, end };
  });
}

/** Value at the given fraction (0..1) of the sorted array. */
export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * (sorted.length - 1))));
  return sorted[index];
}

/**
 * Scans up to MAX_WINDOWS_PER_RECORDING evenly spaced windows across the
 * recording, computes per-band power in dB for each, then reports how far the
 * loudest window rises above the file's own background (the 10th-percentile
 * window). Periodically yields so the UI stays responsive.
 */
export async function analyzeRecording(recording: WavRecording): Promise<RecordingAnalysis> {
  if (recording.totalSamples < ANALYSIS_WINDOW_SIZE) throw new RecordingTooShortError();

  const availableWindows = Math.floor(recording.totalSamples / ANALYSIS_WINDOW_SIZE);
  const windowCount = Math.min(availableWindows, MAX_WINDOWS_PER_RECORDING);
  const lastStart = recording.totalSamples - ANALYSIS_WINDOW_SIZE;

  const ranges = bandBinRanges(recording.sampleRate);
  const samples = new Float32Array(ANALYSIS_WINDOW_SIZE);
  const real = new Float64Array(ANALYSIS_WINDOW_SIZE);
  const imag = new Float64Array(ANALYSIS_WINDOW_SIZE);
  const powerDbPerBand: number[][] = FREQUENCY_BANDS.map(() => []);

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
    const start = windowCount === 1 ? 0 : Math.floor((windowIndex * lastStart) / (windowCount - 1));
    recording.readWindow(start, samples);

    for (let i = 0; i < ANALYSIS_WINDOW_SIZE; i++) {
      real[i] = samples[i] * hannWindow[i];
      imag[i] = 0;
    }
    fftRadix2(real, imag);

    for (let bandIndex = 0; bandIndex < ranges.length; bandIndex++) {
      const { start: firstBin, end: lastBin } = ranges[bandIndex];
      if (lastBin < firstBin) {
        // Band lies above this recording's Nyquist frequency.
        powerDbPerBand[bandIndex].push(0);
        continue;
      }
      let power = 0;
      for (let bin = firstBin; bin <= lastBin; bin++) {
        power += real[bin] * real[bin] + imag[bin] * imag[bin];
      }
      // Mean power per bin keeps bands of different widths comparable
      // ("power"); noise removal below yields power-minus-noise.
      powerDbPerBand[bandIndex].push(power / (lastBin - firstBin + 1));
    }

    if (windowIndex > 0 && windowIndex % YIELD_EVERY_WINDOWS === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Power-Minus-Noise: how far the loudest window rises above this
  // recording's own background (the 10th-percentile window).
  const maxPmnDb = powerDbPerBand.map((values) => {
    if (values.length === 0) return 0;
    const noiseFloor = percentile(values, NOISE_PERCENTILE);
    let loudest = 0;
    for (const value of values) if (value > loudest) loudest = value;
    return Math.max(0, loudest - noiseFloor);
  });

  return { maxPmnDb, analyzedWindows: windowCount };
}

// ---------------------------------------------------------------------------
// Aggregation for the 24-hour clock
// ---------------------------------------------------------------------------

export type SoundscapePoint = {
  /** Minutes since midnight (0..1439). */
  minuteOfDay: number;
  /** Max PMN per band (dB) among recordings starting in this minute. */
  pmnDb: number[];
};

/**
 * Folds per-recording results onto a 24-hour dial: one point per distinct
 * start minute, keeping the max PMN per band when several recordings share a
 * minute (e.g. the same schedule slot across multiple days).
 */
export function buildSoundscapePoints(
  recordings: Array<{ minuteOfDay: number; pmnDb: number[] }>,
): SoundscapePoint[] {
  const byMinute = new Map<number, number[]>();
  for (const recording of recordings) {
    const minute = ((Math.round(recording.minuteOfDay) % 1440) + 1440) % 1440;
    const existing = byMinute.get(minute);
    if (!existing) {
      byMinute.set(minute, [...recording.pmnDb]);
      continue;
    }
    for (let i = 0; i < existing.length; i++) {
      existing[i] = Math.max(existing[i], recording.pmnDb[i] ?? 0);
    }
  }
  return [...byMinute.entries()]
    .map(([minuteOfDay, pmnDb]) => ({ minuteOfDay, pmnDb }))
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay);
}
