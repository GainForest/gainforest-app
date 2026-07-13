/**
 * Faithful TypeScript port of the GainForest / varunghat circadian_soundscape
 * "Power-Minus-Noise" (PMN) pipeline, so the numbers match that tool's scale.
 *
 * Source of truth: github.com/varunghat/circadian_soundscape
 *   - prototype/prototype_calculate_PMN_for_dir.py  (spectrogram + PMN steps)
 *   - prototype/roll_meandB_py.py                   (rolling-mean helpers)
 *   - scripts/process.py                            (frequency binning + max)
 *
 * Per 60-second segment: Hamming (wl=384) magnitude spectrogram in dB ->
 * modal background-noise removal -> 9x3 neighbourhood threshold -> SUM across
 * time per FFT bin. FFT bins are mapped to pseudo-Hz via index*750 and cut into
 * five bins; each recording contributes the MAX PMN per bin ("Max PMN Values").
 */

import { fftRadix2 } from "./analysis";
import type { WavRecording } from "./audiomoth";

export const WINDOW_LENGTH = 384;
const HALF = WINDOW_LENGTH / 2; // 192 retained FFT bins
const SEGMENT_SECONDS = 60;
const NOISE_CLAMP_DB = -90;
const NEIGHBORHOOD_THRESHOLD_DB = 3;
const NEIGH_ROWS = 9;
const NEIGH_COLS = 3;
const FREQUENCY_SCALE = 750; // process.py: df["Frequency"] *= 750
const BIN_EDGES = [0, 1500, 5000, 10000, 20000, 60000] as const;
export const PMN_BIN_COUNT = BIN_EDGES.length - 1;

export class RecordingTooShortError extends Error {
  constructor() {
    super("Recording shorter than one 60-second segment");
    this.name = "RecordingTooShortError";
  }
}

// --- Hamming window (periodic / fftbins=True), normalized by its sum ----------
const HAMMING = (() => {
  const w = new Float64Array(WINDOW_LENGTH);
  let sum = 0;
  for (let n = 0; n < WINDOW_LENGTH; n++) {
    w[n] = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / WINDOW_LENGTH);
    sum += w[n];
  }
  for (let n = 0; n < WINDOW_LENGTH; n++) w[n] /= sum;
  return w;
})();

// --- 384-point DFT magnitude via 3 x 128 Cooley-Tukey (radix-2 for the 128) ---
// x[n] = x[128*n1 + n2]; X[3*k2 + k1] = C[k1][k2].
const N2 = 128; // power of two -> radix-2
const N1 = 3;
// Twiddles W384^{n2*k1} for k1 in {1,2}, n2 in 0..127.
const TW1_RE = new Float64Array(N2);
const TW1_IM = new Float64Array(N2);
const TW2_RE = new Float64Array(N2);
const TW2_IM = new Float64Array(N2);
for (let n2 = 0; n2 < N2; n2++) {
  const a1 = (-2 * Math.PI * n2 * 1) / WINDOW_LENGTH;
  TW1_RE[n2] = Math.cos(a1);
  TW1_IM[n2] = Math.sin(a1);
  const a2 = (-2 * Math.PI * n2 * 2) / WINDOW_LENGTH;
  TW2_RE[n2] = Math.cos(a2);
  TW2_IM[n2] = Math.sin(a2);
}
// 3-point DFT twiddles e^{-2pi i /3} and e^{-4pi i /3}.
const C3 = -0.5;
const S3 = -0.8660254037844386; // -sin(120deg)

/** Magnitudes of the first 192 DFT bins of a real, windowed length-384 signal. */
export function dft384Magnitude(windowed: Float64Array, out: Float64Array): void {
  // Split into three interleaved length-128 sequences, 3-point DFT per n2.
  const b0Re = scratch.b0Re;
  const b0Im = scratch.b0Im;
  const b1Re = scratch.b1Re;
  const b1Im = scratch.b1Im;
  const b2Re = scratch.b2Re;
  const b2Im = scratch.b2Im;
  for (let n2 = 0; n2 < N2; n2++) {
    const x0 = windowed[n2];
    const x1 = windowed[N2 + n2];
    const x2 = windowed[2 * N2 + n2];
    // 3-point DFT of real inputs. e^{-2pi i/3} = C3 + i*S3, e^{-4pi i/3} = C3 - i*S3.
    // A0 = x0 + x1 + x2
    b0Re[n2] = x0 + x1 + x2;
    b0Im[n2] = 0;
    // A1 = x0 + x1*(C3+iS3) + x2*(C3-iS3)
    const A1Re = x0 + x1 * C3 + x2 * C3;
    const A1Im = x1 * S3 - x2 * S3;
    // A2 = x0 + x1*(C3-iS3) + x2*(C3+iS3)
    const A2Re = x0 + x1 * C3 + x2 * C3;
    const A2Im = -x1 * S3 + x2 * S3;
    // Apply twiddles W384^{n2*k1}
    b1Re[n2] = A1Re * TW1_RE[n2] - A1Im * TW1_IM[n2];
    b1Im[n2] = A1Re * TW1_IM[n2] + A1Im * TW1_RE[n2];
    b2Re[n2] = A2Re * TW2_RE[n2] - A2Im * TW2_IM[n2];
    b2Im[n2] = A2Re * TW2_IM[n2] + A2Im * TW2_RE[n2];
  }
  // 128-point FFTs for each k1.
  fftRadix2(b0Re, b0Im);
  fftRadix2(b1Re, b1Im);
  fftRadix2(b2Re, b2Im);
  // X[3*k2 + k1] = C[k1][k2]; keep bins 0..191.
  for (let bin = 0; bin < HALF; bin++) {
    const k1 = bin % 3;
    const k2 = (bin - k1) / 3;
    let re: number;
    let im: number;
    if (k1 === 0) {
      re = b0Re[k2];
      im = b0Im[k2];
    } else if (k1 === 1) {
      re = b1Re[k2];
      im = b1Im[k2];
    } else {
      re = b2Re[k2];
      im = b2Im[k2];
    }
    out[bin] = Math.hypot(re, im);
  }
}

const scratch = {
  b0Re: new Float64Array(N2),
  b0Im: new Float64Array(N2),
  b1Re: new Float64Array(N2),
  b1Im: new Float64Array(N2),
  b2Re: new Float64Array(N2),
  b2Im: new Float64Array(N2),
};

// --- spectrogram in dB, matching calculate_spectrogram_amplitude -------------
export function spectrogramDb(segment: Float32Array | Float64Array): { data: Float64Array; timeSteps: number } {
  // Normalize by max abs.
  let maxAbs = 0;
  for (let i = 0; i < segment.length; i++) {
    const a = Math.abs(segment[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const invMax = maxAbs > 0 ? 1 / maxAbs : 0;

  const timeSteps = Math.floor((segment.length - WINDOW_LENGTH) / WINDOW_LENGTH) + 1;
  if (timeSteps <= 0) throw new RecordingTooShortError();

  // amplitude stored row-major as [bin * timeSteps + t]
  const amp = new Float64Array(HALF * timeSteps);
  const windowed = new Float64Array(WINDOW_LENGTH);
  const mag = new Float64Array(HALF);
  let globalMax = 0;

  for (let t = 0; t < timeSteps; t++) {
    const start = t * WINDOW_LENGTH;
    for (let n = 0; n < WINDOW_LENGTH; n++) windowed[n] = segment[start + n] * invMax * HAMMING[n];
    dft384Magnitude(windowed, mag);
    for (let bin = 0; bin < HALF; bin++) {
      const v = mag[bin];
      amp[bin * timeSteps + t] = v;
      if (v > globalMax) globalMax = v;
    }
  }

  const invGlobal = globalMax > 0 ? 1 / globalMax : 0;
  for (let i = 0; i < amp.length; i++) {
    amp[i] = 20 * Math.log10(amp[i] * invGlobal + 1e-10);
  }
  return { data: amp, timeSteps };
}

// --- rolling mean helpers (dB domain), matching roll_meandB_* ----------------
function meanDb(sumLin: number, count: number): number {
  return 10 * Math.log10(sumLin / count);
}

/** roll_meandB_efficient over frequency rows (window 3), then clamp >= -90. */
function smoothNoiseProfile(spectro: Float64Array, rows: number, cols: number): Float64Array {
  const out = new Float64Array(spectro.length);
  for (let t = 0; t < cols; t++) {
    for (let i = 0; i < rows; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(rows - 1, i + 1);
      let sum = 0;
      let count = 0;
      for (let r = a; r <= b; r++) {
        sum += Math.pow(10, spectro[r * cols + t] / 10);
        count++;
      }
      const v = meanDb(sum, count);
      out[i * cols + t] = v < NOISE_CLAMP_DB ? NOISE_CLAMP_DB : v;
    }
  }
  return out;
}

/** roll_meandB_vector over a 1D array (dB domain). */
function rollMeanDbVector(x: Float64Array, windowSize: number): Float64Array {
  const n = x.length;
  const half = Math.floor(windowSize / 2);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n - 1, i + half);
    let sum = 0;
    for (let k = a; k <= b; k++) sum += Math.pow(10, x[k] / 10);
    out[i] = meanDb(sum, b - a + 1);
  }
  return out;
}

/** dB_mode_per_row: histogram (99 bins) + smoothed-count argmax per row. */
function dbModePerRow(rolled: Float64Array, rows: number, cols: number): Float64Array {
  const modes = new Float64Array(rows);
  const counts = new Float64Array(99);
  for (let i = 0; i < rows; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    const base = i * cols;
    for (let t = 0; t < cols; t++) {
      const v = rolled[base + t];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo === hi) {
      modes[i] = lo;
      continue;
    }
    counts.fill(0);
    const width = (hi - lo) / 99; // 100 edges -> 99 bins
    for (let t = 0; t < cols; t++) {
      let idx = Math.floor((rolled[base + t] - lo) / width);
      if (idx < 0) idx = 0;
      else if (idx >= 99) idx = 98; // np.histogram includes the right edge in the last bin
      counts[idx]++;
    }
    const smoothed = rollMeanDbVector(counts, 5);
    let bestIdx = 0;
    let best = -Infinity;
    for (let k = 0; k < 99; k++) {
      if (smoothed[k] > best) {
        best = smoothed[k];
        bestIdx = k;
      }
    }
    // mid of bin bestIdx: lo + (bestIdx + 0.5) * width
    modes[i] = lo + (bestIdx + 0.5) * width;
  }
  return modes;
}

/** apply_threshold_neighborhood (9x3, threshold 3 dB), zero-padded. */
function thresholdNeighborhood(less: Float64Array, rows: number, cols: number): Float64Array {
  const rp = (NEIGH_ROWS - 1) / 2; // 4
  const cp = (NEIGH_COLS - 1) / 2; // 1
  const pr = rows + 2 * rp;
  const pc = cols + 2 * cp;
  const paddedDb = new Float64Array(pr * pc); // zeros
  const paddedLin = new Float64Array(pr * pc);
  for (let i = 0; i < pr * pc; i++) paddedLin[i] = 1; // 10^(0/10) = 1 for zero pad
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const v = less[i * cols + j];
      const pi = (i + rp) * pc + (j + cp);
      paddedDb[pi] = v;
      paddedLin[pi] = Math.pow(10, v / 10);
    }
  }
  // Column-cumulative then row-cumulative integral image of paddedLin.
  const count = NEIGH_ROWS * NEIGH_COLS;
  const out = new Float64Array(rows * cols);
  // integral image (pr+1) x (pc+1)
  const iiW = pc + 1;
  const ii = new Float64Array((pr + 1) * iiW);
  for (let i = 0; i < pr; i++) {
    let rowSum = 0;
    for (let j = 0; j < pc; j++) {
      rowSum += paddedLin[i * pc + j];
      ii[(i + 1) * iiW + (j + 1)] = ii[i * iiW + (j + 1)] + rowSum;
    }
  }
  const box = (i: number, j: number) =>
    ii[(i + NEIGH_ROWS) * iiW + (j + NEIGH_COLS)] -
    ii[i * iiW + (j + NEIGH_COLS)] -
    ii[(i + NEIGH_ROWS) * iiW + j] +
    ii[i * iiW + j];

  // Separable min over the padded dB neighbourhood (rows 9, then cols 3).
  const minRow = new Float64Array(rows * pc);
  for (let j = 0; j < pc; j++) {
    for (let i = 0; i < rows; i++) {
      let m = Infinity;
      for (let r = 0; r < NEIGH_ROWS; r++) {
        const v = paddedDb[(i + r) * pc + j];
        if (v < m) m = v;
      }
      minRow[i * pc + j] = m;
    }
  }

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const meanDbVal = 10 * Math.log10(box(i, j) / count);
      if (meanDbVal > NEIGHBORHOOD_THRESHOLD_DB) {
        out[i * cols + j] = less[i * cols + j];
      } else {
        let m = Infinity;
        for (let c = 0; c < NEIGH_COLS; c++) {
          const v = minRow[i * pc + (j + c)];
          if (v < m) m = v;
        }
        out[i * cols + j] = m;
      }
    }
  }
  return out;
}

/** PMN per FFT bin (length 192) for one 60-second segment. */
export function segmentPmn(segment: Float32Array | Float64Array): Float64Array {
  const { data: raw, timeSteps } = spectrogramDb(segment);
  const rolled = smoothNoiseProfile(raw, HALF, timeSteps);
  let mode = dbModePerRow(rolled, HALF, timeSteps);
  mode = rollMeanDbVector(mode, 5);
  // subtract background noise from the ORIGINAL raw spectrogram, clamp >= 0
  const less = new Float64Array(raw.length);
  for (let i = 0; i < HALF; i++) {
    const m = mode[i];
    for (let t = 0; t < timeSteps; t++) {
      const v = raw[i * timeSteps + t] - m;
      less[i * timeSteps + t] = v > 0 ? v : 0;
    }
  }
  const ale = thresholdNeighborhood(less, HALF, timeSteps);
  const pmn = new Float64Array(HALF);
  for (let i = 0; i < HALF; i++) {
    let sum = 0;
    for (let t = 0; t < timeSteps; t++) sum += ale[i * timeSteps + t];
    pmn[i] = sum;
  }
  return pmn;
}

/** Aggregate a length-192 PMN spectrum into the five frequency bins (max). */
export function binnedMaxPmn(pmn192: Float64Array): number[] {
  const result = new Array(PMN_BIN_COUNT).fill(0);
  const seen = new Array(PMN_BIN_COUNT).fill(false);
  for (let f = 1; f <= HALF; f++) {
    const pseudoHz = f * FREQUENCY_SCALE;
    // pd.cut default right=True: (edge_k, edge_{k+1}]
    for (let k = 0; k < PMN_BIN_COUNT; k++) {
      if (pseudoHz > BIN_EDGES[k] && pseudoHz <= BIN_EDGES[k + 1]) {
        const value = pmn192[f - 1];
        if (!seen[k] || value > result[k]) {
          result[k] = value;
          seen[k] = true;
        }
        break;
      }
    }
  }
  return result;
}

export type PmnResult = {
  /** Max PMN per frequency bin (5 values). */
  pmnPerBand: number[];
  minutes: number;
};

/**
 * Full-file PMN: split into whole 60-second segments, PMN each, then take the
 * per-bin max across all segments (matching process.py's groupby-max).
 */
export async function computeRecordingPmn(
  recording: WavRecording,
  onProgress?: (fraction: number) => void,
): Promise<PmnResult> {
  const segmentSamples = Math.floor(recording.sampleRate * SEGMENT_SECONDS);
  const minutes = Math.floor(recording.totalSamples / segmentSamples);
  if (minutes < 1) throw new RecordingTooShortError();

  const perBandMax = new Array(PMN_BIN_COUNT).fill(0);
  const segment = new Float32Array(segmentSamples);
  for (let m = 0; m < minutes; m++) {
    recording.readWindow(m * segmentSamples, segment);
    const pmn192 = segmentPmn(segment);
    const binned = binnedMaxPmn(pmn192);
    for (let k = 0; k < PMN_BIN_COUNT; k++) perBandMax[k] = Math.max(perBandMax[k], binned[k]);
    onProgress?.((m + 1) / minutes);
    if (minutes > 1) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { pmnPerBand: perBandMax, minutes };
}
