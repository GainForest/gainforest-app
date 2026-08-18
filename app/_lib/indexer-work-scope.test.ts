import { describe, expect, it } from "vitest";
import { extractWorkScopeTags } from "./indexer";

describe("extractWorkScopeTags", () => {
  it("drops sentence fragments from comma/semicolon work-scope strings", () => {
    expect(
      extractWorkScopeTags({
        scope: [
          "Reforestation",
          "GainForest members across different countries have started an informal initiative to observe biodiversity in their own local environments. The goal is threefold: to encourage healthier",
          "More active habits by getting members outdoors regularly",
          "To deepen our own understanding of the biodiversity around us",
          "Wherever we happen to be based",
        ].join("; "),
      }),
    ).toEqual(["reforestation"]);
  });

  it("keeps known and concise custom tags", () => {
    expect(
      extractWorkScopeTags({
        scope: "forest protection, agroforestry, soil health",
      }),
    ).toEqual(["forest_protection", "agroforestry", "soil health"]);
  });

  it("ignores non-tag string literals inside CEL expressions", () => {
    expect(
      extractWorkScopeTags({
        expression: 'scope.hasAny(["reforestation", "biodiversity_monitoring"]) && note == "To deepen our own understanding of biodiversity around us"',
      }),
    ).toEqual(["reforestation", "biodiversity_monitoring"]);
  });

  it("keeps plausible area tags", () => {
    expect(extractWorkScopeTags({ scope: "⬡ 24164249 ha" })).toEqual(["⬡ 24.2M ha"]);
  });
});
