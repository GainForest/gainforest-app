import { describe, expect, it } from "vitest";
import { hasLabelEvidence } from "./evidence";

describe("labeler evidence filter", () => {
  it("excludes a note-only occurrence whose image upload never completed", () => {
    expect(hasLabelEvidence({ imageRef: null, audioRef: null, audioUrl: null, media: [] })).toBe(false);
  });

  it("does not count an external thumbnail as stored image evidence", () => {
    expect(hasLabelEvidence({ imageRef: null, audioRef: null, audioUrl: null, media: ["image"] })).toBe(false);
  });

  it("includes stored visual and audio evidence", () => {
    expect(hasLabelEvidence({ imageRef: "bafy-photo", audioRef: null, audioUrl: null, media: ["image"] })).toBe(true);
    expect(hasLabelEvidence({ imageRef: null, audioRef: "bafy-audio", audioUrl: null, media: ["audio"] })).toBe(true);
  });
});
