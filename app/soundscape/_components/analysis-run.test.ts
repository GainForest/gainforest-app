import { describe, expect, it } from "vitest";
import {
  beginAnalysis,
  createAnalysisGeneration,
  invalidateAnalyses,
  shouldApplyAnalysis,
} from "./analysis-run";

describe("soundscape analysis generation", () => {
  it("invalidates a late analysis completion when recordings are cleared", () => {
    const generation = createAnalysisGeneration();
    const startedAt = beginAnalysis(generation);

    invalidateAnalyses(generation);

    expect(shouldApplyAnalysis(generation, startedAt)).toBe(false);
  });

  it("accepts the current analysis completion", () => {
    const generation = createAnalysisGeneration();
    expect(shouldApplyAnalysis(generation, beginAnalysis(generation))).toBe(true);
  });
});
