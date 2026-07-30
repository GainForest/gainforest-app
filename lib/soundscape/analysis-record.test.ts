import { describe, expect, it } from "vitest";
import {
  buildAnalysisRecord,
  isUsableAnalysis,
  parseAnalysisRecord,
  PMN_PIPELINE_VERSION,
  SOUNDSCAPE_ANALYSIS_COLLECTION,
} from "./analysis-record";
import { PMN_BIN_COUNT, PMN_SPECTRUM_BINS } from "./pmn";

const bands = Array.from({ length: PMN_BIN_COUNT }, (_, index) => index * 1000 + 0.4);
const spectrum = Array.from({ length: PMN_SPECTRUM_BINS }, (_, index) => index + 0.6);

const input = {
  audioUri: "at://did:plc:example/app.gainforest.ac.audio/abc123",
  audioCid: "bafyreiexample",
  sampleRate: 48_000,
  bands,
  spectrum,
};

describe("buildAnalysisRecord", () => {
  it("round-trips through the parser", () => {
    const record = buildAnalysisRecord(input, "2026-01-01T00:00:00.000Z");
    expect(record.$type).toBe(SOUNDSCAPE_ANALYSIS_COLLECTION);
    const parsed = parseAnalysisRecord(record);
    expect(parsed).not.toBeNull();
    expect(parsed?.audio).toBe(input.audioUri);
    expect(parsed?.pipeline).toBe(PMN_PIPELINE_VERSION);
    expect(parsed?.sampleRate).toBe(48_000);
  });

  it("stores integers, because a fraction of a decibel-sum is invisible", () => {
    const record = buildAnalysisRecord(input) as { bands: number[]; spectrum: number[] };
    expect(record.bands.every(Number.isInteger)).toBe(true);
    expect(record.spectrum.every(Number.isInteger)).toBe(true);
    expect(record.bands[1]).toBe(1000);
  });
});

describe("parseAnalysisRecord", () => {
  it("rejects anything that isn't a usable analysis", () => {
    expect(parseAnalysisRecord(null)).toBeNull();
    expect(parseAnalysisRecord({})).toBeNull();
    // A truncated spectrum can't be re-banded, so it is no use to anyone.
    expect(parseAnalysisRecord({ ...buildAnalysisRecord(input), spectrum: [1, 2, 3] })).toBeNull();
    expect(parseAnalysisRecord({ ...buildAnalysisRecord(input), sampleRate: 0 })).toBeNull();
    expect(parseAnalysisRecord({ ...buildAnalysisRecord(input), audioCid: 42 })).toBeNull();
  });
});

describe("isUsableAnalysis", () => {
  const stored = parseAnalysisRecord(buildAnalysisRecord(input))!;

  it("accepts an analysis of the same audio from the same pipeline", () => {
    expect(isUsableAnalysis(stored, input.audioCid)).toBe(true);
  });

  it("rejects an analysis of audio that has since been replaced", () => {
    expect(isUsableAnalysis(stored, "bafyreisomethingelse")).toBe(false);
  });

  it("rejects an analysis from an older pipeline", () => {
    expect(isUsableAnalysis({ ...stored, pipeline: "pmn-1" }, input.audioCid)).toBe(false);
  });
});
