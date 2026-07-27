import { describe, expect, it } from "vitest";
import { observationBatchGridLayout, observationBatchTileLayout } from "./feed-layout";

describe("observation batch montage", () => {
  it.each([
    [1, "grid-cols-1"],
    [2, "grid-cols-2"],
    [3, "grid-cols-2 grid-rows-2"],
    [4, "grid-cols-2 grid-rows-2"],
  ])("uses a stable media frame for %i thumbnails", (count, expected) => {
    expect(observationBatchGridLayout(count)).toBe(expected);
  });

  it("lets the lead image span both rows in a three-image montage", () => {
    expect(observationBatchTileLayout(3, 0)).toBe("row-span-2");
    expect(observationBatchTileLayout(3, 1)).toBeUndefined();
    expect(observationBatchTileLayout(4, 0)).toBeUndefined();
  });
});
