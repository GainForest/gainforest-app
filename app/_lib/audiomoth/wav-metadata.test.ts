import { describe, expect, it } from "vitest";
import {
  encodeWav,
  extractBatteryState,
  extractDeploymentId,
  extractDeviceId,
  extractGain,
  extractRecordedAt,
  extractTemperature,
  parseWavHeader,
} from "./wav-metadata";

/** A real-world-shaped AudioMoth 1.8+ comment string. */
const COMMENT =
  "Recorded at 19:05:00 15/04/2024 (UTC) by AudioMoth 24F3190361DA539A at medium-high gain while battery state was 4.1V and temperature was 23.3C during deployment 0FE081F80FE081F8.";

const COMMENT_TZ =
  "Recorded at 09:30:00 14/04/2025 (UTC-02:30) by AudioMoth 2495F30155D8D1AC at low gain while battery state was <2.5V and temperature was -1.2C.";

/** Build a tiny AudioMoth-style WAV: fmt + LIST INFO(ICMT, IART) + data. */
function buildTestWav(options: {
  sampleRate?: number;
  channels?: number;
  comment?: string;
  artist?: string;
  seconds?: number;
} = {}): ArrayBuffer {
  const sampleRate = options.sampleRate ?? 48000;
  const channels = options.channels ?? 1;
  const comment = options.comment ?? COMMENT;
  const artist = options.artist ?? "AudioMoth 24F3190361DA539A";
  const dataSize = Math.round((options.seconds ?? 2) * sampleRate) * channels * 2;

  const pad = (s: string) => (s.length % 2 ? `${s}\0` : s);
  const icmt = pad(comment);
  const iart = pad(artist);
  const listSize = 4 + 8 + icmt.length + 8 + iart.length;
  const total = 12 + 8 + 16 + 8 + listSize + 8 + dataSize;

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  let o = 0;
  const w = (text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(o + i, text.charCodeAt(i));
    o += text.length;
  };
  const u32 = (v: number) => {
    view.setUint32(o, v, true);
    o += 4;
  };
  const u16 = (v: number) => {
    view.setUint16(o, v, true);
    o += 2;
  };

  w("RIFF");
  u32(total - 8);
  w("WAVE");
  w("fmt ");
  u32(16);
  u16(1);
  u16(channels);
  u32(sampleRate);
  u32(sampleRate * channels * 2);
  u16(channels * 2);
  u16(16);
  w("LIST");
  u32(listSize);
  w("INFO");
  w("ICMT");
  u32(icmt.length);
  w(icmt);
  w("IART");
  u32(iart.length);
  w(iart);
  w("data");
  u32(dataSize);
  return buffer;
}

describe("parseWavHeader", () => {
  it("reads fmt, INFO and data chunks from an AudioMoth-style WAV", () => {
    const header = parseWavHeader(buildTestWav({ seconds: 2 }));
    expect(header).not.toBeNull();
    expect(header!.sampleRate).toBe(48000);
    expect(header!.channels).toBe(1);
    expect(header!.bitsPerSample).toBe(16);
    expect(header!.durationSeconds).toBeCloseTo(2, 3);
    expect(header!.comment).toContain("during deployment");
    expect(header!.artist).toBe("AudioMoth 24F3190361DA539A");
  });

  it("rejects non-WAV data", () => {
    expect(parseWavHeader(new ArrayBuffer(100))).toBeNull();
    expect(parseWavHeader(new TextEncoder().encode("not a wav file at all, sorry!").buffer.slice(0, 29))).toBeNull();
  });

  it("round-trips through encodeWav", () => {
    const samples = new Int16Array([0, 1000, -1000, 32767, -32768]);
    const bytes = encodeWav(samples, 8000);
    const header = parseWavHeader(bytes.buffer as ArrayBuffer);
    expect(header).not.toBeNull();
    expect(header!.sampleRate).toBe(8000);
    expect(header!.channels).toBe(1);
    expect(header!.dataLength).toBe(10);
  });
});

describe("AudioMoth comment extraction", () => {
  it("finds the deployment ID (lowercased)", () => {
    expect(extractDeploymentId(COMMENT)).toBe("0fe081f80fe081f8");
    expect(extractDeploymentId(COMMENT_TZ)).toBeNull();
    expect(extractDeploymentId(null)).toBeNull();
  });

  it("finds the device ID from artist or comment", () => {
    expect(extractDeviceId(COMMENT, null)).toBe("24F3190361DA539A");
    expect(extractDeviceId(null, "AudioMoth 2495F30155D8D1AC")).toBe("2495F30155D8D1AC");
    expect(extractDeviceId(null, null)).toBeNull();
  });

  it("parses UTC timestamps", () => {
    const date = extractRecordedAt(COMMENT);
    expect(date?.toISOString()).toBe("2024-04-15T19:05:00.000Z");
  });

  it("parses timezone-offset timestamps back to UTC", () => {
    const date = extractRecordedAt(COMMENT_TZ);
    // 09:30 at UTC-02:30 = 12:00 UTC
    expect(date?.toISOString()).toBe("2025-04-14T12:00:00.000Z");
  });

  it("extracts gain, battery and temperature", () => {
    expect(extractGain(COMMENT)).toBe("medium-high");
    expect(extractGain(COMMENT_TZ)).toBe("low");
    expect(extractBatteryState(COMMENT)).toBe("4.1V");
    expect(extractBatteryState(COMMENT_TZ)).toBe("<2.5V");
    expect(extractTemperature(COMMENT)).toBe("23.3C");
    expect(extractTemperature(COMMENT_TZ)).toBe("-1.2C");
  });
});
