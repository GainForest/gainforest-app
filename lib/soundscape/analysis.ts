/**
 * Soundscape analysis shared helpers: the five frequency bins, their colours,
 * the radix-2 FFT (used by the PMN pipeline in ./pmn), and the 24-hour dial
 * aggregation. The Power-Minus-Noise computation itself lives in ./pmn and is
 * a faithful port of github.com/varunghat/circadian_soundscape.
 */

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

// ---------------------------------------------------------------------------
// FFT (iterative radix-2, in place) — the length-128 kernel used by the
// 384-point DFT in ./pmn.
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
// Aggregation for the 24-hour clock
// ---------------------------------------------------------------------------

export type SoundscapePoint = {
  /** Minutes since midnight (0..1439). */
  minuteOfDay: number;
  /** Max PMN per frequency bin among recordings starting in this minute. */
  pmn: number[];
};

/**
 * Folds per-recording results onto a 24-hour dial: one point per distinct
 * start minute, keeping the max PMN per bin when several recordings share a
 * minute (e.g. the same schedule slot across multiple days).
 */
export function buildSoundscapePoints(
  recordings: Array<{ minuteOfDay: number; pmn: number[] }>,
): SoundscapePoint[] {
  const byMinute = new Map<number, number[]>();
  for (const recording of recordings) {
    const minute = ((Math.round(recording.minuteOfDay) % 1440) + 1440) % 1440;
    const existing = byMinute.get(minute);
    if (!existing) {
      byMinute.set(minute, [...recording.pmn]);
      continue;
    }
    for (let i = 0; i < existing.length; i++) {
      existing[i] = Math.max(existing[i], recording.pmn[i] ?? 0);
    }
  }
  return [...byMinute.entries()]
    .map(([minuteOfDay, pmn]) => ({ minuteOfDay, pmn }))
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay);
}
