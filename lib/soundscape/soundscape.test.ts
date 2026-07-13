import { describe, expect, it } from "vitest";
import {
  formatMinuteOfDay,
  openWav,
  parseAudioMothTimestamp,
  wallClockDateKey,
  wallClockFromEpochMillis,
  wallClockMinuteOfDay,
  WavDecodeError,
} from "./audiomoth";
import {
  ANALYSIS_WINDOW_SIZE,
  analyzeRecording,
  buildSoundscapePoints,
  fftRadix2,
  formatBandLabel,
  FREQUENCY_BANDS,
  percentile,
  RecordingTooShortError,
} from "./analysis";

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

describe("percentile", () => {
  it("returns values at the requested fraction", () => {
    expect(percentile([5, 1, 3], 0)).toBe(1);
    expect(percentile([5, 1, 3], 1)).toBe(5);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("analyzeRecording", () => {
  it("attributes a tone burst to the right band", async () => {
    const sampleRate = 48000;
    const totalSamples = sampleRate; // 1 second
    const samples: number[] = new Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      // Quiet noise floor everywhere, loud 440 Hz tone in the middle fifth.
      const noise = (((i * 2654435761) % 1000) / 1000 - 0.5) * 0.002;
      const inBurst = i > totalSamples * 0.4 && i < totalSamples * 0.6;
      samples[i] = noise + (inBurst ? 0.8 * Math.sin((2 * Math.PI * 440 * i) / sampleRate) : 0);
    }
    const wav = openWav(makeWavBuffer({ sampleRate, samples }));
    const { maxPmnDb } = await analyzeRecording(wav);

    expect(maxPmnDb).toHaveLength(FREQUENCY_BANDS.length);
    expect(FREQUENCY_BANDS).toHaveLength(5);
    // 440 Hz sits in band 0; its power-minus-noise must dominate the rest.
    expect(maxPmnDb[0]).toBeGreaterThan(0);
    for (let band = 1; band < maxPmnDb.length; band++) {
      expect(maxPmnDb[0]).toBeGreaterThan(maxPmnDb[band] * 4);
    }
  });

  it("rejects recordings shorter than one window", async () => {
    const wav = openWav(makeWavBuffer({ sampleRate: 48000, samples: new Array(ANALYSIS_WINDOW_SIZE - 1).fill(0) }));
    await expect(analyzeRecording(wav)).rejects.toBeInstanceOf(RecordingTooShortError);
  });
});

describe("buildSoundscapePoints", () => {
  it("merges recordings in the same minute with per-band max and sorts", () => {
    const points = buildSoundscapePoints([
      { minuteOfDay: 930, pmnDb: [1, 2, 3, 4, 5] },
      { minuteOfDay: 90, pmnDb: [5, 5, 5, 5, 5] },
      { minuteOfDay: 930, pmnDb: [4, 1, 6, 2, 9] },
    ]);
    expect(points.map((point) => point.minuteOfDay)).toEqual([90, 930]);
    expect(points[1].pmnDb).toEqual([4, 2, 6, 4, 9]);
  });
});

describe("frequency bins", () => {
  it("exposes the five GainForest soundscape bins verbatim", () => {
    expect(FREQUENCY_BANDS.map(formatBandLabel)).toEqual([
      "0-1500",
      "1500-5000",
      "5000-10000",
      "10k-20000",
      "20k-60000",
    ]);
  });
});
