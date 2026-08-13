import { describe, expect, it } from "vitest";
import { buildAudioStats, EMPTY_AUDIO_STATS, type AudioUploadEvent } from "./rewilding-audio";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const NOW = Date.parse("2026-08-13T12:00:00.000Z");

function upload(daysAgo: number, seconds: number): AudioUploadEvent {
  return { t: NOW - daysAgo * DAY_MS, seconds };
}

describe("buildAudioStats", () => {
  it("returns the empty stats when there is no audio", () => {
    expect(buildAudioStats([], NOW)).toEqual(EMPTY_AUDIO_STATS);
    expect(buildAudioStats([upload(1, 0)], NOW)).toEqual(EMPTY_AUDIO_STATS);
  });

  it("sums durations into rounded minutes", () => {
    const stats = buildAudioStats([upload(1, 60), upload(2, 30.7), upload(3, 60)], NOW);
    // 150.7 seconds ≈ 3 minutes
    expect(stats.audioMinutes).toBe(3);
  });

  it("ignores negative durations", () => {
    const stats = buildAudioStats([upload(1, 120), upload(2, -600)], NOW);
    expect(stats.audioMinutes).toBe(2);
  });

  it("builds a 12-point cumulative weekly trend, oldest first", () => {
    // 10 minutes three weeks ago, 5 minutes yesterday.
    const stats = buildAudioStats([upload(21, 600), upload(1, 300)], NOW);
    expect(stats.audioTrend).toHaveLength(12);
    // Weeks before the first upload sit at zero…
    expect(stats.audioTrend[0]).toBe(0);
    // …then the trend steps up to 10 and finally 15 minutes.
    expect(stats.audioTrend[9]).toBe(10);
    expect(stats.audioTrend[11]).toBe(15);
    // Cumulative: never decreasing.
    for (let i = 1; i < stats.audioTrend.length; i += 1) {
      expect(stats.audioTrend[i]).toBeGreaterThanOrEqual(stats.audioTrend[i - 1]!);
    }
  });

  it("counts uploads older than the trend window as the baseline", () => {
    const stats = buildAudioStats([upload(400, 6_000)], NOW);
    expect(stats.audioMinutes).toBe(100);
    // Every point carries the pre-window baseline.
    expect(stats.audioTrend.every((value) => value === 100)).toBe(true);
  });

  it("keeps the newest point equal to the headline figure", () => {
    const events = [upload(80, 3_000), upload(30, 1_200), upload(2, 900)];
    const stats = buildAudioStats(events, NOW);
    expect(stats.audioTrend.at(-1)).toBe(stats.audioMinutes);
  });

  it("places boundary uploads in the correct week", () => {
    // Exactly one week ago lands on the second-to-last boundary.
    const stats = buildAudioStats([{ t: NOW - WEEK_MS, seconds: 600 }], NOW);
    expect(stats.audioTrend.at(-2)).toBe(10);
    expect(stats.audioTrend.at(-3)).toBe(0);
  });
});
