import { describe, expect, it } from "vitest";
import { audioLabelsToCsv, normalizeSpectrogramBox, spectrogramBoxToBounds, type AudioLabel } from "./labels";

describe("spectrogram labels", () => {
  it("normalizes a box drawn in any direction", () => {
    expect(normalizeSpectrogramBox(0.8, 0.9, 0.2, 0.1)).toEqual({
      startX: 0.2,
      endX: 0.8,
      topY: 0.1,
      bottomY: 0.9,
    });
  });

  it("maps the visible box to time and frequency bounds", () => {
    expect(
      spectrogramBoxToBounds(
        { startX: 0.25, endX: 0.5, topY: 0.25, bottomY: 0.75 },
        60,
        24_000,
      ),
    ).toEqual({
      startTimeSeconds: 15,
      endTimeSeconds: 30,
      minFrequencyHz: 6_000,
      maxFrequencyHz: 18_000,
    });
  });

  it("exports notes and species safely as CSV", () => {
    const label: AudioLabel = {
      id: "1",
      fileKey: "file",
      fileName: "field, morning.wav",
      category: "bird",
      species: "Thrush",
      note: 'Two calls, then "alarm"',
      startTimeSeconds: 1.2345,
      endTimeSeconds: 5.6789,
      minFrequencyHz: 1200,
      maxFrequencyHz: 6400,
      box: { startX: 0, endX: 1, topY: 0, bottomY: 1 },
      createdAt: "2026-07-14T00:00:00.000Z",
    };

    const csv = audioLabelsToCsv([label]);
    expect(csv).toContain('"field, morning.wav"');
    expect(csv).toContain('"Two calls, then ""alarm"""');
    expect(csv).toContain("1.234,5.679,1200,6400");
  });
});
