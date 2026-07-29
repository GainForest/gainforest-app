import { describe, expect, it } from "vitest";
import {
  formatMinuteOfDay,
  openWav,
  parseAudioMothTimestamp,
  wallClockDateKey,
  wallClockFromEpochMillis,
  wallClockFromIso,
  wallClockMinuteOfDay,
  WavDecodeError,
} from "./audiomoth";
import { parsePmnCache, toCacheEntry, trimPmnCache } from "./pmn-cache";
import {
  buildSoundscapePoints,
  chooseSlotMinutes,
  fftRadix2,
  formatBandRange,
  formatPmnValue,
  FREQUENCY_BANDS,
  nyquistHz,
} from "./analysis";
import {
  binnedMaxPmn,
  computeRecordingPmn,
  dft384Magnitude,
  MIN_SEGMENT_SECONDS,
  PMN_BIN_COUNT,
  RecordingTooShortError,
  segmentPmn,
  WINDOW_LENGTH,
} from "./pmn";

// ---------------------------------------------------------------------------
// Filename parsing
// ---------------------------------------------------------------------------

describe("parseAudioMothTimestamp", () => {
  it("parses the standard AudioMoth name", () => {
    const time = parseAudioMothTimestamp("20240404_153000.WAV");
    expect(time).toEqual({ year: 2024, month: 4, day: 4, hour: 15, minute: 30, second: 0 });
    expect(wallClockDateKey(time!)).toBe("2024-04-04");
    expect(wallClockMinuteOfDay(time!)).toBe(15 * 60 + 30);
  });

  it("accepts a triggered-recording suffix and lowercase extensions", () => {
    expect(parseAudioMothTimestamp("20240404_060102T.wav")).toEqual({
      year: 2024,
      month: 4,
      day: 4,
      hour: 6,
      minute: 1,
      second: 2,
    });
  });

  it("parses legacy hex names as UTC epoch seconds", () => {
    // 0x5E92CA80 = 1586678400 = 2020-04-12 08:00:00 UTC
    const time = parseAudioMothTimestamp("5E92CA80.WAV");
    expect(time).toEqual({ year: 2020, month: 4, day: 12, hour: 8, minute: 0, second: 0 });
  });

  it("rejects names without a timestamp or with impossible fields", () => {
    expect(parseAudioMothTimestamp("recording.wav")).toBeNull();
    expect(parseAudioMothTimestamp("20241399_250000.WAV")).toBeNull();
    expect(parseAudioMothTimestamp("notes.txt")).toBeNull();
  });
});

describe("wall clock helpers", () => {
  it("derives a UTC wall clock from epoch millis", () => {
    const time = wallClockFromEpochMillis(Date.UTC(2024, 3, 4, 15, 30, 0), "utc");
    expect(time).toEqual({ year: 2024, month: 4, day: 4, hour: 15, minute: 30, second: 0 });
  });

  it("formats minutes of day and wraps", () => {
    expect(formatMinuteOfDay(0)).toBe("00:00");
    expect(formatMinuteOfDay(15 * 60 + 5)).toBe("15:05");
    expect(formatMinuteOfDay(1440)).toBe("00:00");
  });

  it("reads the device wall clock from a recordedAt ISO string via UTC components", () => {
    // Upload stores the AudioMoth device clock as a UTC instant, so the UTC
    // fields are the wall clock regardless of the viewer's timezone.
    expect(wallClockFromIso("2024-04-04T15:30:00.000Z")).toEqual({
      year: 2024,
      month: 4,
      day: 4,
      hour: 15,
      minute: 30,
      second: 0,
    });
    // Offset forms are normalized to the same instant first.
    expect(wallClockFromIso("2024-04-04T17:30:00+02:00")).toEqual(
      wallClockFromIso("2024-04-04T15:30:00Z"),
    );
    expect(wallClockFromIso("")).toBeNull();
    expect(wallClockFromIso(null)).toBeNull();
    expect(wallClockFromIso("not a date")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PMN cache
// ---------------------------------------------------------------------------

describe("pmn cache", () => {
  const bands = [1, 2, 3, 4, 5];
  const spectrum = Array.from({ length: 192 }, (_, index) => index);
  const vector = { bands, spectrum, sampleRate: 48000 };

  it("round-trips valid entries and drops malformed ones", () => {
    const raw = JSON.stringify({
      good: vector,
      wrongBandCount: { bands: [1, 2], spectrum, sampleRate: 48000 },
      wrongSpectrumLength: { bands, spectrum: [1, 2, 3], sampleRate: 48000 },
      missingSampleRate: { bands, spectrum },
      nonFiniteSampleRate: { bands, spectrum, sampleRate: Number.NaN },
      wrongType: "nope",
      nonFinite: { bands: [1, 2, 3, 4, Number.NaN], spectrum, sampleRate: 48000 },
    });
    expect(parsePmnCache(raw)).toEqual({ good: vector });
  });

  it("ignores v1 entries, whose bands used the old pseudo-Hz edges", () => {
    // v1 stored a bare five-number vector. Those bands are not comparable to
    // the real-Hz ones, so they must be recomputed rather than migrated.
    expect(parsePmnCache(JSON.stringify({ legacy: bands }))).toEqual({});
  });

  it("rounds the cached spectrum to keep the payload small", () => {
    const entry = toCacheEntry(bands, [1.4, 2.6, ...spectrum.slice(2)], 48000);
    expect(entry.spectrum.slice(0, 2)).toEqual([1, 3]);
    expect(entry.spectrum).toHaveLength(192);
  });

  it("tolerates missing or corrupt storage", () => {
    expect(parsePmnCache(null)).toEqual({});
    expect(parsePmnCache("not json")).toEqual({});
    expect(parsePmnCache("[1,2,3]")).toEqual({});
  });

  it("trims the earliest-inserted entries beyond the cap", () => {
    const cache = Object.fromEntries(["a", "b", "c", "d"].map((key) => [key, vector]));
    expect(Object.keys(trimPmnCache(cache, 2))).toEqual(["c", "d"]);
    expect(trimPmnCache(cache, 10)).toBe(cache);
  });
});

// ---------------------------------------------------------------------------
// WAV reading
// ---------------------------------------------------------------------------

function makeWavBuffer(options: {
  sampleRate: number;
  samples: number[];
  channels?: number;
  extraChunk?: boolean;
}): ArrayBuffer {
  const channels = options.channels ?? 1;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = options.samples.length * blockAlign;
  const extraSize = options.extraChunk ? 8 + 4 : 0;
  const buffer = new ArrayBuffer(44 + extraSize + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, options.sampleRate, true);
  view.setUint32(28, options.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  let offset = 36;
  if (options.extraChunk) {
    writeAscii(offset, "LIST");
    view.setUint32(offset + 4, 4, true);
    writeAscii(offset + 8, "INFO");
    offset += 12;
  }

  writeAscii(offset, "data");
  view.setUint32(offset + 4, dataSize, true);
  let sampleOffset = offset + 8;
  for (const sample of options.samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    for (let channel = 0; channel < channels; channel++) {
      view.setInt16(sampleOffset, Math.round(clamped * 32767), true);
      sampleOffset += 2;
    }
  }
  return buffer;
}

describe("openWav", () => {
  it("reads header fields and samples of a 16-bit PCM file", () => {
    const wav = openWav(makeWavBuffer({ sampleRate: 48000, samples: [0, 0.5, -0.5, 1] }));
    expect(wav.sampleRate).toBe(48000);
    expect(wav.channels).toBe(1);
    expect(wav.totalSamples).toBe(4);

    const out = new Float32Array(4);
    wav.readWindow(0, out);
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[1]).toBeCloseTo(0.5, 2);
    expect(out[2]).toBeCloseTo(-0.5, 2);
    expect(out[3]).toBeCloseTo(1, 2);
  });

  it("skips unknown chunks before the data chunk", () => {
    const wav = openWav(makeWavBuffer({ sampleRate: 32000, samples: [0.25, 0.25], extraChunk: true }));
    expect(wav.sampleRate).toBe(32000);
    expect(wav.totalSamples).toBe(2);
  });

  it("zero-fills reads past the end of the recording", () => {
    const wav = openWav(makeWavBuffer({ sampleRate: 48000, samples: [1, 1] }));
    const out = new Float32Array(4);
    wav.readWindow(1, out);
    expect(out[0]).toBeCloseTo(1, 2);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
  });

  it("rejects non-WAV buffers", () => {
    expect(() => openWav(new ArrayBuffer(10))).toThrow(WavDecodeError);
    const junk = new Uint8Array(64).fill(65);
    expect(() => openWav(junk.buffer)).toThrow(WavDecodeError);
  });
});

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

describe("fftRadix2", () => {
  it("finds the bin of a pure tone", () => {
    const n = 64;
    const real = new Float64Array(n);
    const imag = new Float64Array(n);
    for (let i = 0; i < n; i++) real[i] = Math.sin((2 * Math.PI * 4 * i) / n);
    fftRadix2(real, imag);
    const magnitudes = [...real.keys()].map((i) => Math.hypot(real[i], imag[i]));
    const peak = magnitudes.indexOf(Math.max(...magnitudes.slice(0, n / 2)));
    expect(peak).toBe(4);
  });
});

describe("dft384Magnitude", () => {
  it("matches a naive DFT of a real length-384 signal", () => {
    const x = new Float64Array(WINDOW_LENGTH);
    for (let i = 0; i < WINDOW_LENGTH; i++) {
      x[i] = Math.sin((2 * Math.PI * 17 * i) / WINDOW_LENGTH) + 0.4 * Math.cos((2 * Math.PI * 53 * i) / WINDOW_LENGTH);
    }
    const out = new Float64Array(WINDOW_LENGTH / 2);
    dft384Magnitude(x, out);
    for (let k = 0; k < WINDOW_LENGTH / 2; k++) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < WINDOW_LENGTH; n++) {
        const angle = (-2 * Math.PI * k * n) / WINDOW_LENGTH;
        re += x[n] * Math.cos(angle);
        im += x[n] * Math.sin(angle);
      }
      expect(out[k]).toBeCloseTo(Math.hypot(re, im), 5);
    }
  });
});

describe("binnedMaxPmn", () => {
  it("maps FFT bins to voice bands by real Hz (index x sampleRate / 384)", () => {
    const pmn = new Float64Array(WINDOW_LENGTH / 2);
    // At 48 kHz a bin spans 125 Hz, so index f sits at f * 125 Hz:
    // 2->250 (rumble), 6->750 (low), 20->2500 (bird song),
    // 40->5000 (high), 100->12500 (insects).
    pmn[1] = 10;
    pmn[5] = 20;
    pmn[19] = 30;
    pmn[39] = 40;
    pmn[99] = 50;
    expect(binnedMaxPmn(pmn, 48000)).toEqual([10, 20, 30, 40, 50]);
    expect(PMN_BIN_COUNT).toBe(5);
  });

  it("keeps every bin up to Nyquist — nothing is silently discarded", () => {
    // Regression: the old pseudo-Hz cut dropped indices 81-192 (real
    // 10-24 kHz at 48 kHz), 58% of the spectrum and the richest insect range.
    for (let index = 1; index <= WINDOW_LENGTH / 2; index++) {
      const pmn = new Float64Array(WINDOW_LENGTH / 2);
      pmn[index - 1] = 1234;
      const banded = binnedMaxPmn(pmn, 48000);
      expect(banded, `FFT index ${index} was dropped`).toContain(1234);
    }
  });

  it("tracks the sample rate: the same bin means a different band", () => {
    const pmn = new Float64Array(WINDOW_LENGTH / 2);
    pmn[39] = 7; // index 40
    // 40 * 125 Hz = 5 kHz -> "high calls"; 40 * 651 Hz = 26 kHz -> "insects".
    expect(binnedMaxPmn(pmn, 48000).indexOf(7)).toBe(3);
    expect(binnedMaxPmn(pmn, 250000).indexOf(7)).toBe(4);
  });
});

describe("segmentPmn", () => {
  it("peaks at the FFT bin of a tone burst", () => {
    const sampleRate = 48000;
    const windows = 30;
    const total = windows * WINDOW_LENGTH;
    const toneBin = 48; // 6000 Hz at 48 kHz, wl=384 (48000/384 = 125 Hz/bin)
    const segment = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const w = Math.floor(i / WINDOW_LENGTH);
      const noise = (((i * 2654435761) % 1000) / 1000 - 0.5) * 0.002;
      const inBurst = w >= 12 && w < 20;
      segment[i] = noise + (inBurst ? 0.8 * Math.sin((2 * Math.PI * toneBin * i) / WINDOW_LENGTH) : 0);
    }
    const pmn = segmentPmn(segment);
    let argmax = 0;
    for (let k = 1; k < pmn.length; k++) if (pmn[k] > pmn[argmax]) argmax = k;
    expect(Math.abs(argmax - toneBin)).toBeLessThanOrEqual(2);
    expect(pmn[argmax]).toBeGreaterThan(0);
  });
});

describe("computeRecordingPmn", () => {
  /**
   * A tone that bursts once a second over quiet noise: PMN measures energy
   * above the background, so a steady tone would read as background and score
   * zero. Evenly spaced bursts make the score roughly proportional to duration.
   */
  function burstySamples(sampleRate: number, seconds: number): number[] {
    const total = Math.round(sampleRate * seconds);
    const samples = new Array<number>(total);
    for (let i = 0; i < total; i++) {
      const noise = (((i * 2654435761) % 1000) / 1000 - 0.5) * 0.01;
      const inBurst = i % sampleRate < sampleRate / 2;
      samples[i] = noise + (inBurst ? 0.6 * Math.sin((2 * Math.PI * 48 * i) / WINDOW_LENGTH) : 0);
    }
    return samples;
  }

  it(`rejects recordings shorter than ${MIN_SEGMENT_SECONDS} seconds`, async () => {
    const wav = openWav(makeWavBuffer({ sampleRate: 8000, samples: new Array(1000).fill(0) }));
    await expect(computeRecordingPmn(wav)).rejects.toBeInstanceOf(RecordingTooShortError);
  });

  it("analyzes a recording shorter than a minute but at or above the minimum", async () => {
    // A 55-second duty cycle is a common recorder schedule.
    const wav = openWav(makeWavBuffer({ sampleRate: 1000, samples: burstySamples(1000, 55) }));
    const result = await computeRecordingPmn(wav);
    expect(result.minutes).toBe(1);
    expect(result.pmnPerBand).toHaveLength(PMN_BIN_COUNT);
    expect(Math.max(...result.pmnPerBand)).toBeGreaterThan(0);
  });

  it("scales a partial segment to a full minute, so 55s and 60s read alike", async () => {
    const sampleRate = 1000;
    const full = await computeRecordingPmn(
      openWav(makeWavBuffer({ sampleRate, samples: burstySamples(sampleRate, 60) })),
    );
    const partial = await computeRecordingPmn(
      openWav(makeWavBuffer({ sampleRate, samples: burstySamples(sampleRate, 55) })),
    );
    const fullPeak = Math.max(...full.pmnPerBand);
    const partialPeak = Math.max(...partial.pmnPerBand);
    // Without scaling the shorter clip would sum ~8% less energy.
    expect(Math.abs(partialPeak - fullPeak) / fullPeak).toBeLessThan(0.05);
  });

  it("leaves recordings with at least one whole segment untouched", async () => {
    // 90 seconds: the reference pipeline analyzes the first minute and ignores
    // the tail, and so do we — published numbers must not shift.
    const sampleRate = 1000;
    const minute = await computeRecordingPmn(
      openWav(makeWavBuffer({ sampleRate, samples: burstySamples(sampleRate, 60) })),
    );
    const minuteAndAHalf = await computeRecordingPmn(
      openWav(makeWavBuffer({ sampleRate, samples: burstySamples(sampleRate, 90) })),
    );
    expect(minuteAndAHalf.minutes).toBe(1);
    expect(minuteAndAHalf.pmnPerBand).toEqual(minute.pmnPerBand);
  });
});

describe("buildSoundscapePoints", () => {
  it("merges recordings in the same minute with a per-bin mean and sorts", () => {
    const points = buildSoundscapePoints([
      { minuteOfDay: 930, pmn: [1, 2, 3, 4, 5] },
      { minuteOfDay: 90, pmn: [5, 5, 5, 5, 5] },
      { minuteOfDay: 930, pmn: [4, 1, 6, 2, 9] },
    ]);
    expect(points.map((point) => point.minuteOfDay)).toEqual([90, 930]);
    expect(points[1].pmn).toEqual([2.5, 1.5, 4.5, 3, 7]);
    expect(points.map((point) => point.count)).toEqual([1, 2]);
  });

  it("never lets one loud day stand in for the others", () => {
    const quiet = { minuteOfDay: 360, pmn: [10, 10, 10, 10, 10] };
    const loud = { minuteOfDay: 360, pmn: [1000, 1000, 1000, 1000, 1000] };
    const [point] = buildSoundscapePoints([quiet, quiet, loud]);
    for (const value of point.pmn) {
      expect(value).toBeGreaterThan(10);
      expect(value).toBeLessThan(1000);
    }
    expect(point.count).toBe(3);
  });

  it("leaves a single recording per minute untouched", () => {
    const points = buildSoundscapePoints([
      { minuteOfDay: 60, pmn: [1, 2, 3, 4, 5] },
      { minuteOfDay: 120, pmn: [9, 8, 7, 6, 5] },
    ]);
    expect(points.map((point) => point.pmn)).toEqual([
      [1, 2, 3, 4, 5],
      [9, 8, 7, 6, 5],
    ]);
    expect(points.map((point) => point.count)).toEqual([1, 1]);
    // Nothing to disagree with, so the ribbon has no width.
    expect(points[0].low).toEqual(points[0].high);
  });

  it("reports the spread of the recordings behind a point", () => {
    const [point] = buildSoundscapePoints(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 100].map((value) => ({ minuteOfDay: 300, pmn: [value] })),
    );
    expect(point.low[0]).toBeLessThan(point.pmn[0]);
    expect(point.high[0]).toBeGreaterThan(point.pmn[0]);
    // The 100 is one recording in ten: inside the mean, outside the ribbon.
    expect(point.high[0]).toBeLessThan(100);
  });

  it("folds recordings into a wider slot when asked", () => {
    const points = buildSoundscapePoints(
      [
        { minuteOfDay: 418, pmn: [10] },
        { minuteOfDay: 421, pmn: [20] },
        { minuteOfDay: 600, pmn: [30] },
      ],
      { slotMinutes: 5 },
    );
    expect(points.map((point) => point.minuteOfDay)).toEqual([420, 600]);
    expect(points[0].pmn).toEqual([15]);
    expect(points[0].count).toBe(2);
  });
});

describe("chooseSlotMinutes", () => {
  it("keeps minute slots for a scheduled deployment that lands on the same times", () => {
    const minutes: number[] = [];
    for (let day = 0; day < 21; day++) for (const slot of [0, 360, 720, 1080]) minutes.push(slot);
    expect(chooseSlotMinutes(minutes, 21)).toBe(1);
  });

  it("widens the slot when start times walk across the days", () => {
    // Continuous recording: every day's schedule shifts by a few minutes, so
    // no two days ever share a minute.
    const minutes: number[] = [];
    for (let day = 0; day < 21; day++) for (let slot = 0; slot < 1440; slot += 60) minutes.push(slot + day * 3);
    const chosen = chooseSlotMinutes(minutes, 21);
    expect(chosen).toBeGreaterThan(1);
    const points = buildSoundscapePoints(
      minutes.map((minuteOfDay) => ({ minuteOfDay, pmn: [1] })),
      { slotMinutes: chosen },
    );
    const averaged = points.filter((point) => point.count > 1).length;
    expect(averaged).toBeGreaterThan(points.length / 2);
  });

  it("never widens a single day, where there is nothing to average", () => {
    expect(chooseSlotMinutes([0, 3, 7, 11, 19], 1)).toBe(1);
  });

  it("leaves unrelated one-off recordings alone rather than smearing them", () => {
    expect(chooseSlotMinutes([0, 200, 640, 900, 1300], 5)).toBe(1);
  });
});

describe("voice bands", () => {
  it("describes ranges in real Hz, closing the top band at Nyquist", () => {
    const ranges = FREQUENCY_BANDS.map((band) => formatBandRange(band, nyquistHz(48000)));
    expect(ranges).toEqual(["0\u2013250 Hz", "250 Hz\u20131 kHz", "1\u20133 kHz", "3\u20138 kHz", "8\u201324 kHz"]);
  });

  it("never advertises range the recording cannot capture", () => {
    const insects = FREQUENCY_BANDS[FREQUENCY_BANDS.length - 1];
    expect(insects.maxHz).toBeNull();
    // A 22.05 kHz-Nyquist recording must not claim it reaches 24 kHz.
    expect(formatBandRange(insects, nyquistHz(44100))).toBe("8\u201322.1 kHz");
    expect(formatBandRange(insects, nyquistHz(250000))).toBe("8\u2013125 kHz");
  });

  it("covers the spectrum without gaps", () => {
    for (let index = 1; index < FREQUENCY_BANDS.length; index++) {
      expect(FREQUENCY_BANDS[index].minHz).toBe(FREQUENCY_BANDS[index - 1].maxHz);
    }
    expect(FREQUENCY_BANDS[0].minHz).toBe(0);
  });
});

describe("formatPmnValue", () => {
  it("keeps neighbouring axis labels distinct in the thousands", () => {
    expect(formatPmnValue(0)).toBe("0");
    expect(formatPmnValue(500)).toBe("500");
    expect(formatPmnValue(1000)).toBe("1k");
    expect(formatPmnValue(1500)).toBe("1.5k");
    expect(formatPmnValue(2000)).toBe("2k");
    expect(formatPmnValue(12_000)).toBe("12k");
    expect(formatPmnValue(2_400_000)).toBe("2.4M");
  });
});
