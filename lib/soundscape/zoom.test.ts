import { describe, expect, it } from "vitest";
import {
  centerWindow,
  clampWindow,
  formatWindowMinute,
  FULL_DAY_WINDOW,
  isFullDay,
  isInWindow,
  MIN_WINDOW_SPAN,
  MINUTES_PER_DAY,
  minuteAtFraction,
  panWindow,
  tickStepMinutes,
  windowEnd,
  windowFraction,
  windowTicks,
  zoomWindow,
} from "./zoom";

describe("clampWindow", () => {
  it("keeps a sane window untouched", () => {
    expect(clampWindow({ start: 300, span: 120 })).toEqual({ start: 300, span: 120 });
  });

  it("never zooms past the minimum span", () => {
    expect(clampWindow({ start: 300, span: 1 }).span).toBe(MIN_WINDOW_SPAN);
  });

  it("never zooms out past a full day", () => {
    expect(clampWindow({ start: 300, span: 5000 })).toEqual({ start: 0, span: MINUTES_PER_DAY });
  });

  it("lets a window run past midnight, keeping the start inside the day", () => {
    expect(clampWindow({ start: 1400, span: 120 })).toEqual({ start: 1400, span: 120 });
    expect(clampWindow({ start: -60, span: 120 })).toEqual({ start: 1380, span: 120 });
  });

  it("a window across midnight holds the minutes on both sides", () => {
    const night = { start: 1320, span: 300 }; // 22:00 -> 03:00
    expect(isInWindow(1350, night)).toBe(true); // 22:30
    expect(isInWindow(60, night)).toBe(true); // 01:00
    expect(isInWindow(600, night)).toBe(false); // 10:00
    expect(windowFraction(1320, night)).toBeCloseTo(0, 5);
    expect(windowFraction(60, night)).toBeCloseTo(0.6, 5);
    expect(windowFraction(180, night)).toBeCloseTo(1, 5);
  });

  it("survives non-finite input", () => {
    expect(clampWindow({ start: Number.NaN, span: Number.NaN })).toEqual(FULL_DAY_WINDOW);
  });
});

describe("zoomWindow", () => {
  it("keeps the focused minute in the same relative place", () => {
    const zoomed = zoomWindow({ start: 0, span: 1440 }, 0.5, 360);
    expect(windowFraction(360, zoomed)).toBeCloseTo(0.25, 5);
    expect(zoomed.span).toBe(720);
  });

  it("zooms around the middle when no focus is given", () => {
    const zoomed = zoomWindow({ start: 600, span: 120 }, 0.5);
    expect(zoomed.start + zoomed.span / 2).toBe(660);
    expect(zoomed.span).toBe(60);
  });

  it("clamps at the tightest zoom", () => {
    let window = { start: 600, span: 120 };
    for (let i = 0; i < 20; i++) window = zoomWindow(window, 0.5);
    expect(window.span).toBe(MIN_WINDOW_SPAN);
  });

  it("zooming out lands back on the whole day", () => {
    let window = { start: 600, span: 30 };
    for (let i = 0; i < 20; i++) window = zoomWindow(window, 2);
    expect(isFullDay(window)).toBe(true);
    expect(window).toEqual(FULL_DAY_WINDOW);
  });

  it("zooming out at the edge of the day wraps the start backwards", () => {
    const zoomed = zoomWindow({ start: 0, span: 60 }, 2, 0);
    expect(zoomed.span).toBe(120);
    expect(zoomed.start).toBe(0);
    const around = zoomWindow({ start: 0, span: 60 }, 2, 30);
    expect(around.start).toBe(MINUTES_PER_DAY - 30);
  });
});

describe("panWindow / centerWindow", () => {
  it("slides without changing the span", () => {
    expect(panWindow({ start: 300, span: 60 }, 30)).toEqual({ start: 330, span: 60 });
  });

  it("rolls around midnight instead of stopping", () => {
    expect(panWindow({ start: 30, span: 60 }, -60)).toEqual({ start: 1410, span: 60 });
    expect(panWindow({ start: 1400, span: 60 }, 60)).toEqual({ start: 20, span: 60 });
  });

  it("centres on a minute", () => {
    expect(centerWindow({ start: 0, span: 60 }, 500)).toEqual({ start: 470, span: 60 });
  });

  it("centring near midnight wraps rather than clamping", () => {
    expect(centerWindow({ start: 0, span: 60 }, 5)).toEqual({ start: 1415, span: 60 });
    expect(centerWindow({ start: 0, span: 60 }, 1430)).toEqual({ start: 1400, span: 60 });
  });
});

describe("window mapping", () => {
  it("maps minutes to fractions and back", () => {
    const window = { start: 240, span: 120 };
    expect(windowFraction(300, window)).toBeCloseTo(0.5, 5);
    expect(minuteAtFraction(0.5, window)).toBeCloseTo(300, 5);
  });

  it("knows what is inside", () => {
    const window = { start: 240, span: 120 };
    expect(isInWindow(240, window)).toBe(true);
    expect(isInWindow(360, window)).toBe(true);
    expect(isInWindow(361, window)).toBe(false);
  });
});

describe("ticks", () => {
  it("uses coarse steps for the whole day and fine steps when zoomed", () => {
    expect(tickStepMinutes(1440)).toBe(120);
    expect(tickStepMinutes(120)).toBe(10);
    expect(tickStepMinutes(10)).toBe(1);
  });

  it("aligns ticks to whole steps inside the window", () => {
    const ticks = windowTicks({ start: 247, span: 60 });
    expect(ticks[0] % 5).toBe(0);
    expect(ticks[0]).toBeGreaterThanOrEqual(247);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(307);
    expect(ticks.length).toBeLessThanOrEqual(12);
  });

  it("never returns more labels than asked for", () => {
    for (const span of [10, 17, 45, 120, 361, 720, 1440]) {
      expect(windowTicks({ start: 0, span }).length).toBeLessThanOrEqual(13);
    }
  });
});

describe("formatWindowMinute", () => {
  it("reads the end of the day as 24:00", () => {
    expect(formatWindowMinute(MINUTES_PER_DAY)).toBe("24:00");
    expect(formatWindowMinute(0)).toBe("00:00");
    expect(formatWindowMinute(725)).toBe("12:05");
  });
});
