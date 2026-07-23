export type AnalysisGeneration = { current: number };

export function createAnalysisGeneration(): AnalysisGeneration {
  return { current: 0 };
}

export function beginAnalysis(generation: AnalysisGeneration): number {
  return generation.current;
}

export function invalidateAnalyses(generation: AnalysisGeneration): void {
  generation.current += 1;
}

export function shouldApplyAnalysis(generation: AnalysisGeneration, startedAt: number): boolean {
  return generation.current === startedAt;
}
