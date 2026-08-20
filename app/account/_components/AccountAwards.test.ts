import { describe, expect, it } from "vitest";
import { groupAwardKeys } from "./AccountAwards";

describe("groupAwardKeys", () => {
  it("groups all BioBlitz winning badges into one emblem", () => {
    expect(
      groupAwardKeys([
        "bioblitz-best-picture-round-1",
        "bioblitz-most-images-round-7",
        "rewilding-grant",
      ]),
    ).toEqual([
      {
        key: "rewilding-grant",
        badges: ["rewilding-grant"],
        isBioblitz: false,
      },
      {
        key: "bioblitz-wins",
        badges: ["bioblitz-most-images-round-7", "bioblitz-best-picture-round-1"],
        isBioblitz: true,
      },
    ]);
  });

  it("counts winning badges even when two belong to the same round", () => {
    const groups = groupAwardKeys([
      "bioblitz-best-picture-round-7",
      "bioblitz-most-images-round-7",
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.badges).toHaveLength(2);
  });
});
