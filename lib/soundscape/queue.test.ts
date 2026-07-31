import { describe, expect, it } from "vitest";
import { isOutstanding, isRetryable, type AnalysisState } from "./queue";

describe("isRetryable", () => {
  it("treats untouched recordings as pending", () => {
    expect(isRetryable(undefined)).toBe(true);
    expect(isRetryable({ status: "idle" })).toBe(true);
  });

  it("retries transient failures", () => {
    expect(isRetryable({ status: "error", errorKind: "download" })).toBe(true);
    expect(isRetryable({ status: "error", errorKind: "decode" })).toBe(true);
  });

  it("never retries recordings that are too short to analyze", () => {
    // Deterministic: the file will never contain a full 60-second segment, so
    // counting it would leave the Analyze button permanently offering work.
    expect(isRetryable({ status: "error", errorKind: "tooShort" })).toBe(false);
  });

  it("does not requeue in-flight or finished recordings", () => {
    const busy: AnalysisState[] = [
      { status: "queued" },
      { status: "downloading" },
      { status: "analyzing" },
      { status: "done", pmn: [1, 2, 3, 4, 5] },
    ];
    for (const state of busy) expect(isRetryable(state)).toBe(false);
  });

  it("counts only genuinely pending work, so a run in progress offers none", () => {
    // Regression: the Analyze button showed a stale "Analyze 1 recording"
    // mid-run because errored rows (including too-short ones) were counted
    // as remaining while everything else was queued or done.
    const midRun: Array<AnalysisState | undefined> = [
      { status: "done", pmn: [0, 0, 0, 0, 0] },
      { status: "downloading" },
      { status: "queued" },
      { status: "error", errorKind: "tooShort" },
    ];
    expect(midRun.filter(isRetryable)).toHaveLength(0);

    // Once the run settles, only the transient failure is offered again.
    const settled: Array<AnalysisState | undefined> = [
      { status: "done", pmn: [0, 0, 0, 0, 0] },
      { status: "error", errorKind: "tooShort" },
      { status: "error", errorKind: "download" },
    ];
    expect(settled.filter(isRetryable)).toHaveLength(1);
  });
});

describe("isOutstanding", () => {
  it("counts queued and in-flight recordings", () => {
    expect(isOutstanding({ status: "queued" })).toBe(true);
    expect(isOutstanding({ status: "downloading" })).toBe(true);
    expect(isOutstanding({ status: "analyzing" })).toBe(true);
  });

  it("ignores recordings that are not on the conveyor belt", () => {
    expect(isOutstanding(undefined)).toBe(false);
    expect(isOutstanding({ status: "idle" })).toBe(false);
    expect(isOutstanding({ status: "done", pmn: [0, 0, 0, 0, 0] })).toBe(false);
    expect(isOutstanding({ status: "error", errorKind: "download" })).toBe(false);
  });

  it("keeps the queue alive across a pause, because the aborted download requeues", () => {
    // Pausing aborts the in-flight download and puts that recording back to
    // "queued", so the paused header must still offer Resume rather than
    // falling back to the Analyze button as if the run had finished.
    const paused: Array<AnalysisState | undefined> = [
      { status: "done", pmn: [0, 0, 0, 0, 0] },
      { status: "queued" }, // the one that was downloading when paused
      { status: "queued" },
      { status: "error", errorKind: "tooShort" },
    ];
    expect(paused.filter(isOutstanding)).toHaveLength(2);
    // ...and none of it is "retryable" work the Analyze button should re-offer.
    expect(paused.filter(isRetryable)).toHaveLength(0);
  });
});
