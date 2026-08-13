import { describe, expect, it } from "vitest";
import {
  buildAudioPace,
  buildAudioSeries,
  buildAudioStats,
  EMPTY_AUDIO_STATS,
  type AudioUploadEvent,
} from "./rewilding-audio";
import {
  REWILDING_GRANT_END_ISO,
  REWILDING_GRANT_START_ISO,
} from "@/app/_lib/rewilding-milestones";

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

describe("buildAudioSeries", () => {
  it("is null without any audio", () => {
    expect(buildAudioSeries([], NOW)).toBeNull();
    expect(buildAudioSeries([upload(1, 0)], NOW)).toBeNull();
  });

  it("runs from the first upload through today", () => {
    const series = buildAudioSeries([upload(3, 600)], NOW)!;
    expect(series.days[0]).toBe("2026-08-10");
    expect(series.days.at(-1)).toBe("2026-08-13");
    expect(series.days).toHaveLength(4);
  });

  it("accumulates minutes and never decreases", () => {
    const series = buildAudioSeries([upload(3, 600), upload(1, 300)], NOW)!;
    expect(series.values[0]).toBeCloseTo(10, 5);
    expect(series.values.at(-1)).toBeCloseTo(15, 5);
    for (let i = 1; i < series.values.length; i += 1) {
      expect(series.values[i]).toBeGreaterThanOrEqual(series.values[i - 1]!);
    }
  });

  it("keeps days and values the same length", () => {
    const series = buildAudioSeries([upload(40, 600), upload(2, 120)], NOW)!;
    expect(series.days).toHaveLength(series.values.length);
  });

  it("flattens through a stretch with no uploads", () => {
    // One upload 5 days ago, nothing since: the tail holds its value.
    const series = buildAudioSeries([upload(5, 1_200)], NOW)!;
    expect(series.values.at(-1)).toBeCloseTo(20, 5);
    expect(series.values.at(-1)).toBeCloseTo(series.values.at(-2)!, 5);
  });

  it("ends the series at the headline total", () => {
    const events = [upload(30, 3_000), upload(9, 1_200), upload(1, 900)];
    const stats = buildAudioStats(events, NOW);
    expect(Math.round(stats.audioSeries!.values.at(-1)!)).toBe(stats.audioMinutes);
  });
});

describe("buildAudioPace", () => {
  const START = Date.parse(REWILDING_GRANT_START_ISO);
  const END = Date.parse(REWILDING_GRANT_END_ISO);
  const TARGET = 7_000;
  /** Mid-grant: 15 October 2026. */
  const MID = Date.parse("2026-10-15T12:00:00.000Z");

  const pace = (audioMinutes: number, now = MID) =>
    buildAudioPace({ audioMinutes, targetMinutes: TARGET, startMs: START, endMs: END, now });

  it("uses the program window constants", () => {
    expect(REWILDING_GRANT_START_ISO).toBe("2026-09-01T00:00:00.000Z");
    expect(REWILDING_GRANT_END_ISO).toBe("2026-11-30T23:59:59.999Z");
    // September through November inclusive.
    expect(Math.round((END - START) / 86_400_000)).toBe(91);
  });

  it("reports days left until the grant closes", () => {
    // 15 Oct → 30 Nov 2026.
    expect(pace(100).daysRemaining).toBe(46);
  });

  it("is behind when uploads trail the straight line to target", () => {
    const result = pace(292);
    expect(result.status).toBe("active");
    // ~49% of the window elapsed, so ~3,400 minutes were due by now.
    expect(result.deltaVsPace).toBeLessThan(-3_000);
  });

  it("is ahead when uploads run past the straight line", () => {
    expect(pace(5_000).deltaVsPace).toBeGreaterThan(0);
  });

  it("asks for the remaining minutes spread over the days left", () => {
    const result = pace(1_000);
    expect(result.remainingMinutes).toBe(6_000);
    // 6,000 minutes over ~46 days.
    expect(result.requiredPerDay).toBeCloseTo(6_000 / (result.daysRemaining + 0.5), 0);
  });

  it("marks the target met and stops asking for a pace", () => {
    const result = pace(7_200);
    expect(result.status).toBe("met");
    expect(result.remainingMinutes).toBe(0);
    expect(result.requiredPerDay).toBeNull();
  });

  it("closes once the deadline passes without the target", () => {
    const result = pace(500, Date.parse("2026-12-01T12:00:00.000Z"));
    expect(result.status).toBe("closed");
    expect(result.daysRemaining).toBe(0);
    expect(result.requiredPerDay).toBeNull();
  });

  it("projects where the current pace lands by the deadline", () => {
    // 440 minutes over 44.5 elapsed days ≈ 9.9/day, with ~46 days left.
    const result = pace(440);
    expect(result.actualPerDay).toBeCloseTo(9.89, 1);
    expect(result.projectedMinutes).toBeGreaterThan(850);
    expect(result.projectedMinutes).toBeLessThan(950);
  });

  describe("before the grant opens", () => {
    // 13 August 2026 — the window has not started.
    const upcoming = (audioMinutes: number) => pace(audioMinutes, NOW);

    it("is upcoming rather than behind", () => {
      const result = upcoming(292);
      expect(result.status).toBe("upcoming");
      // Nobody can be behind a pace that has not started.
      expect(result.deltaVsPace).toBe(0);
    });

    it("counts the days until it opens", () => {
      expect(upcoming(0).daysUntilStart).toBe(19);
    });

    it("quotes the pace the whole window will demand", () => {
      // 7,000 minutes across 91 days.
      expect(upcoming(0).requiredPerDay).toBeCloseTo(7_000 / 91, 1);
    });

    it("claims no achieved rate for time outside the window", () => {
      const result = upcoming(292);
      expect(result.actualPerDay).toBe(0);
      expect(result.projectedMinutes).toBe(292);
    });

    it("reports no days until start once the grant is running", () => {
      expect(pace(100).daysUntilStart).toBe(0);
    });
  });

  it("does not blow up on a grant that just started", () => {
    const result = buildAudioPace({
      audioMinutes: 0,
      targetMinutes: TARGET,
      startMs: START,
      endMs: END,
      now: START,
    });
    expect(Number.isFinite(result.actualPerDay)).toBe(true);
    expect(result.actualPerDay).toBe(0);
    expect(result.deltaVsPace).toBe(0);
  });
});
