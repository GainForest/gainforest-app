import { describe, expect, it } from "vitest";
import { cardOutline, formatCardDateRange, nearestSource } from "./card";
import type { SoundscapeSource } from "./record";

function source(minuteOfDay: number, pmn: number[], audioUri = `at://a/${minuteOfDay}`): SoundscapeSource {
  return { audioUri, name: `${minuteOfDay}.wav`, date: "2024-04-03", minuteOfDay, pmn };
}

describe("cardOutline", () => {
  it("averages each band within a bin (a typical day, like the full dial) and skips empty bins", () => {
    const points = cardOutline(
      [source(10, [1, 5]), source(20, [3, 3]), source(720, [9, 9])],
      2,
      48, // 30-minute bins
    );
    expect(points).toHaveLength(2);
    expect(points[0].pmn).toEqual([2, 4]);
    expect(points[1].pmn).toEqual([9, 9]);
  });

  it("orders bins around the clock and centers their minute", () => {
    const points = cardOutline([source(1380, [1]), source(60, [1])], 1, 24); // hourly bins
    expect(points.map((point) => point.minuteOfDay)).toEqual([90, 1410]);
  });

  it("wraps out-of-range minutes into the day", () => {
    const points = cardOutline([source(1445, [1])], 1, 48);
    expect(points[0].minuteOfDay).toBeLessThan(60);
  });
});

describe("nearestSource", () => {
  const sources = [source(300, [1]), source(1400, [1]), source(1400, [8], "at://loud")];

  it("finds the closest recording, wrapping past midnight", () => {
    expect(nearestSource(sources, 290)?.minuteOfDay).toBe(300);
    // 20 past midnight is 60 minutes from 23:20 (wrapping), 280 from 05:00.
    expect(nearestSource(sources, 20)?.minuteOfDay).toBe(1400);
  });

  it("prefers the loudest among equally near recordings", () => {
    expect(nearestSource(sources, 1400)?.audioUri).toBe("at://loud");
  });

  it("has nothing to play without sources", () => {
    expect(nearestSource([], 100)).toBeNull();
  });
});

describe("formatCardDateRange", () => {
  it("formats one day, a same-month span, and a cross-month span (en-GB)", () => {
    expect(formatCardDateRange(["2024-04-03"], "en-GB")).toBe("3 Apr 2024");
    expect(formatCardDateRange(["2024-04-03", "2024-04-07"], "en-GB")).toMatch(/^3\s?[\u2013-]\s?7 Apr 2024$/);
    expect(formatCardDateRange(["2024-03-28", "2024-04-02"], "en-GB")).toMatch(/28 Mar.*2 Apr 2024/);
    expect(formatCardDateRange(["2023-12-30", "2024-01-02"], "en-GB")).toMatch(/30 Dec 2023.*2 Jan 2024/);
  });

  it("falls back to the raw strings when a date is malformed", () => {
    expect(formatCardDateRange(["soon", "later"], "en")).toBe("soon \u2013 later");
  });
});
