/**
 * Client-side spectrogram generation for uploaded recordings.
 *
 * `computeSpectrogram` is pure math (Hann window → radix-2 FFT → dB
 * magnitudes) so it can be unit-tested in Node; `renderSpectrogramPng`
 * paints the result to a canvas with an inferno-style colour map and
 * returns PNG bytes for a PDS blob (`common.defs#spectrogram`, ≤5MB).
 */

export interface SpectrogramOptions {
  /** FFT size (power of two). Height of the image = fftSize / 2. */
  fftSize?: number;
  /** Samples between successive columns. */
  hopSize?: number;
}

export interface SpectrogramData {
  /** Number of time columns. */
  columns: number;
  /** Number of frequency bins (fftSize / 2), low frequency first. */
  bins: number;
  /** Column-major magnitudes in dBFS: value(col, bin) = data[col * bins + bin]. */
  magnitudesDb: Float32Array;
}

const DEFAULT_FFT_SIZE = 256;
const DEFAULT_HOP_SIZE = 512;
const MIN_DB = -100;
const MAX_DB = -20;

/** In-place iterative radix-2 Cooley–Tukey FFT. Lengths must be a power of two. */
export function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error("FFT size must be a power of two");

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const evenRe = re[i + j]!;
        const evenIm = im[i + j]!;
        const oddRe = re[i + j + len / 2]!;
        const oddIm = im[i + j + len / 2]!;
        const tRe = oddRe * curRe - oddIm * curIm;
        const tIm = oddRe * curIm + oddIm * curRe;
        re[i + j] = evenRe + tRe;
        im[i + j] = evenIm + tIm;
        re[i + j + len / 2] = evenRe - tRe;
        im[i + j + len / 2] = evenIm - tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Short-time FFT magnitudes in dBFS for 16-bit PCM samples. */
export function computeSpectrogram(samples: Int16Array, options: SpectrogramOptions = {}): SpectrogramData {
  const fftSize = options.fftSize ?? DEFAULT_FFT_SIZE;
  const hopSize = options.hopSize ?? DEFAULT_HOP_SIZE;
  const bins = fftSize / 2;
  const columns = Math.max(0, Math.floor((samples.length - fftSize) / hopSize) + 1);
  const magnitudesDb = new Float32Array(columns * bins).fill(MIN_DB);

  // Hann window, precomputed
  const window = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }
  const windowSum = window.reduce((a, b) => a + b, 0);

  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);

  for (let col = 0; col < columns; col += 1) {
    const start = col * hopSize;
    for (let i = 0; i < fftSize; i += 1) {
      re[i] = ((samples[start + i] ?? 0) / 32768) * window[i]!;
      im[i] = 0;
    }
    fftRadix2(re, im);
    for (let bin = 0; bin < bins; bin += 1) {
      // Normalise by window sum; ×2 for one-sided spectrum.
      const magnitude = (2 * Math.hypot(re[bin]!, im[bin]!)) / windowSum;
      magnitudesDb[col * bins + bin] = 20 * Math.log10(Math.max(magnitude, 1e-10));
    }
  }

  return { columns, bins, magnitudesDb };
}

/* ── Rendering (browser only) ────────────────────────────────────────────── */

/** Inferno-ish colour stops (dark purple → orange → light yellow). */
const COLOR_STOPS: Array<[number, number, number]> = [
  [0, 0, 4],
  [40, 11, 84],
  [101, 21, 110],
  [159, 42, 99],
  [212, 72, 66],
  [245, 125, 21],
  [250, 193, 39],
  [252, 255, 164],
];

function colorFor(normalized: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, normalized)) * (COLOR_STOPS.length - 1);
  const i = Math.min(COLOR_STOPS.length - 2, Math.floor(t));
  const f = t - i;
  const a = COLOR_STOPS[i]!;
  const b = COLOR_STOPS[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/**
 * Render 16-bit PCM samples to a PNG spectrogram (time → x, frequency → y
 * with low frequencies at the bottom). Returns null when canvas support is
 * unavailable or the clip is too short.
 */
export async function renderSpectrogramPng(
  samples: Int16Array,
  options: SpectrogramOptions = {},
): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;
  const { columns, bins, magnitudesDb } = computeSpectrogram(samples, options);
  if (columns < 2) return null;

  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = bins;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const image = ctx.createImageData(columns, bins);
  for (let col = 0; col < columns; col += 1) {
    for (let bin = 0; bin < bins; bin += 1) {
      const db = magnitudesDb[col * bins + bin]!;
      const normalized = (db - MIN_DB) / (MAX_DB - MIN_DB);
      const [r, g, b] = colorFor(normalized);
      // Flip vertically: bin 0 (lowest frequency) at the bottom row.
      const y = bins - 1 - bin;
      const offset = (y * columns + col) * 4;
      image.data[offset] = Math.round(r);
      image.data[offset + 1] = Math.round(g);
      image.data[offset + 2] = Math.round(b);
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}
