/**
 * Soundscape analysis shared helpers: the five frequency bins, their colours,
 * the radix-2 FFT (used by the PMN pipeline in ./pmn), and the 24-hour dial
 * aggregation. The Power-Minus-Noise computation itself lives in ./pmn and is
 * a faithful port of github.com/varunghat/circadian_soundscape.
 */

export type FrequencyBand = {
  id: string;
  /** Key under `common.soundscape.bands` holding the human-readable name. */
  labelKey: string;
  minHz: number;
  /** `null` means open-ended: everything up to the recording's Nyquist limit. */
  maxHz: number | null;
};

/**
 * Frequency bands in REAL Hz, grouped by the kind of voice that occupies them.
 *
 * The reference pipeline (github.com/GainForest/xprize, varunghat/
 * circadian_soundscape) labelled its bins by `FFT index * 750`, which is only
 * true Hz for a 288 kHz sample rate (384-point window * 750). At AudioMoth's
 * usual 48 kHz a bin is 125 Hz wide, so those labels overstated frequency 6x
 * AND silently discarded every bin above pseudo-60 kHz — real 10-24 kHz, 112
 * of 192 bins, the richest insect range. These bands are derived from each
 * recording's own sample rate instead, so nothing is dropped and the numbers
 * mean what they say.
 *
 * Ranges are deliberately broad and region-neutral: they describe where energy
 * sits, not which species produced it. Real voices overlap heavily, and the
 * mapping differs by region — site-specific naming belongs to a later layer
 * driven by actual `dwc.occurrence` labels, not to hard-coded constants.
 */
export const FREQUENCY_BANDS: readonly FrequencyBand[] = [
  { id: "rumble", labelKey: "rumble", minHz: 0, maxHz: 250 },
  { id: "lowCalls", labelKey: "lowCalls", minHz: 250, maxHz: 1000 },
  { id: "birdSong", labelKey: "birdSong", minHz: 1000, maxHz: 3000 },
  { id: "highCalls", labelKey: "highCalls", minHz: 3000, maxHz: 8000 },
  { id: "insects", labelKey: "insects", minHz: 8000, maxHz: null },
] as const;

/** Colours matching the reference matplotlib figure (blue→purple). */
export const BAND_COLORS = ["#1f3fd6", "#189d18", "#f0a500", "#e01a1a", "#8e30b0"] as const;

/** Highest frequency a recording can represent. */
export function nyquistHz(sampleRate: number): number {
  return sampleRate / 2;
}

function isKHz(hz: number): boolean {
  return hz >= 1000;
}

function formatHz(hz: number, withUnit = true): string {
  if (hz === 0) return "0";
  if (!isKHz(hz)) return withUnit ? `${Math.round(hz)} Hz` : `${Math.round(hz)}`;
  const kHz = hz / 1000;
  const value = Number.isInteger(kHz) ? `${kHz}` : kHz.toFixed(1);
  return withUnit ? `${value} kHz` : value;
}

/**
 * Human-readable range for a band, e.g. "1–3 kHz" or "250 Hz–1 kHz". The
 * open-ended top band is closed at `ceilingHz` (the Nyquist limit of the
 * recordings being shown), so it never advertises frequencies the hardware
 * cannot capture. The unit is only repeated when the two bounds need different
 * ones.
 */
export function formatBandRange(band: FrequencyBand, ceilingHz: number): string {
  const max = band.maxHz === null ? ceilingHz : Math.min(band.maxHz, ceilingHz);
  const sameUnit = isKHz(band.minHz) === isKHz(max);
  return `${formatHz(band.minHz, !sameUnit)}–${formatHz(max)}`;
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
 * Rounds a maximum up to a friendly 1/2/5/10 axis bound, so the radial and
 * linear charts label their grid with round numbers.
 */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Compact axis/tooltip formatting for PMN values (e.g. `12k`, `1.4M`). */
export function formatPmnValue(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${Math.round(value / 1000)}k`;
  if (abs >= 10) return `${Math.round(value)}`;
  return value.toPrecision(2);
}

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
