import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStallTimer, withReadTimeout } from "./stall-timeout";

describe("createStallTimer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires when nothing reports progress", () => {
    const onStall = vi.fn();
    createStallTimer(1_000, onStall);
    vi.advanceTimersByTime(1_000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("does not fire while progress keeps arriving", () => {
    const onStall = vi.fn();
    const timer = createStallTimer(1_000, onStall);
    for (let i = 0; i < 10; i += 1) {
      vi.advanceTimersByTime(900);
      timer.bump();
    }
    expect(onStall).not.toHaveBeenCalled();
  });

  it("fires once progress dries up mid-transfer", () => {
    const onStall = vi.fn();
    const timer = createStallTimer(1_000, onStall);
    vi.advanceTimersByTime(900);
    timer.bump();
    vi.advanceTimersByTime(1_000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("never fires after stop", () => {
    const onStall = vi.fn();
    const timer = createStallTimer(1_000, onStall);
    timer.stop();
    vi.advanceTimersByTime(10_000);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("ignores a bump after stop", () => {
    const onStall = vi.fn();
    const timer = createStallTimer(1_000, onStall);
    timer.stop();
    timer.bump();
    vi.advanceTimersByTime(10_000);
    expect(onStall).not.toHaveBeenCalled();
  });
});

describe("withReadTimeout", () => {
  it("returns the value when the read finishes in time", async () => {
    await expect(withReadTimeout(Promise.resolve("ok"), 1_000, null)).resolves.toBe("ok");
  });

  it("returns the fallback when the read rejects", async () => {
    await expect(withReadTimeout(Promise.reject(new Error("unreadable")), 1_000, null)).resolves.toBeNull();
  });

  it("returns the fallback when the read never settles", async () => {
    vi.useFakeTimers();
    try {
      const pending = withReadTimeout(new Promise<string>(() => {}), 1_000, null);
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
