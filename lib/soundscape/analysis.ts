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
  /** Mean PMN per frequency bin across recordings in this time slot. */
  pmn: number[];
  /** 10th percentile per bin — bottom of the "usual" range. */
  low: number[];
  /** 90th percentile per bin — top of the "usual" range. */
  high: number[];
  /** How many recordings were averaged into this point (>= 1). */
  count: number;
};

/**
 * Linear-interpolated percentile of an ascending array. With one or two
 * samples there is no distribution to speak of, so this degrades to the min
 * and max rather than pretending to a percentile.
 */
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Slot widths the dial can fold recordings into. Each divides 1440. */
export const SLOT_OPTIONS = [1, 2, 5, 10, 15, 30] as const;

/** Fraction of recordings that must share a slot before it counts as aligned. */
const ALIGNMENT_TARGET = 0.6;

/**
 * Picks how wide a time slot has to be for the days to actually fold together.
 *
 * A scheduled AudioMoth stamps 07:00:00 every day, so minute-wide slots line
 * up perfectly and nothing needs widening. Continuous recording is different:
 * files are back-to-back, so their start times can walk a few minutes per day
 * and never share a minute. Minute-wide slots would then hold one recording
 * each and a three-week deployment would draw 1440 lonely samples instead of
 * an average — exactly the noisy dial that averaging was meant to fix.
 *
 * So: widen only until most recordings have company, and never widen a
 * single-day view, where there is nothing to average in the first place.
 */
export function chooseSlotMinutes(minutesOfDay: number[], dayCount: number): number {
  if (dayCount < 2 || minutesOfDay.length === 0) return 1;
  for (const slot of SLOT_OPTIONS) {
    const perSlot = new Map<number, number>();
    for (const minute of minutesOfDay) {
      const key = snapToSlot(minute, slot);
      perSlot.set(key, (perSlot.get(key) ?? 0) + 1);
    }
    let shared = 0;
    for (const count of perSlot.values()) if (count > 1) shared += count;
    if (shared / minutesOfDay.length >= ALIGNMENT_TARGET) return slot;
  }
  // Nothing lines up even at half-hour slots: leave the times alone rather
  // than smearing genuinely unrelated recordings together.
  return 1;
}

/** Rounds a minute of the day onto the nearest slot boundary. */
export function snapToSlot(minuteOfDay: number, slotMinutes: number): number {
  const minute = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  return (Math.round(minute / slotMinutes) * slotMinutes) % 1440;
}

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

/**
 * Compact axis/tooltip formatting for PMN values (e.g. `1.5k`, `12k`, `1.4M`).
 * Thousands keep a decimal below 10k, otherwise an axis running 0..2000 would
 * label both 1500 and 2000 as "2k".
 */
export function formatPmnValue(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (abs >= 10) return `${Math.round(value)}`;
  return value.toPrecision(2);
}

/**
 * Folds per-recording results onto a 24-hour dial: one point per distinct
 * start minute, averaging the PMN per bin when several recordings share a
 * minute (e.g. the same schedule slot across multiple days).
 *
 * The mean, not the max: on a multi-day view one unusually loud morning would
 * otherwise stand in for every morning, overstating the site's typical sound
 * and making the multi-day dial incomparable with a single-day one. Averaging
 * gives a typical day, and `count` says how many recordings back each point.
 */
export function buildSoundscapePoints(
  recordings: Array<{ minuteOfDay: number; pmn: number[] }>,
  options: { slotMinutes?: number } = {},
): SoundscapePoint[] {
  const slotMinutes = options.slotMinutes && options.slotMinutes > 0 ? options.slotMinutes : 1;
  const bySlot = new Map<number, number[][]>();
  for (const recording of recordings) {
    const slot = snapToSlot(recording.minuteOfDay, slotMinutes);
    const existing = bySlot.get(slot);
    if (!existing) {
      bySlot.set(
        slot,
        recording.pmn.map((value) => [value]),
      );
      continue;
    }
    for (let i = 0; i < existing.length; i++) {
      existing[i].push(recording.pmn[i] ?? 0);
    }
  }
  return [...bySlot.entries()]
    .map(([minuteOfDay, perBand]) => {
      const count = perBand[0]?.length ?? 0;
      const pmn: number[] = [];
      const low: number[] = [];
      const high: number[] = [];
      for (const values of perBand) {
        pmn.push(values.reduce((sum, value) => sum + value, 0) / values.length);
        const sorted = [...values].sort((a, b) => a - b);
        low.push(percentile(sorted, 0.1));
        high.push(percentile(sorted, 0.9));
      }
      return { minuteOfDay, pmn, low, high, count };
    })
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay);
}
