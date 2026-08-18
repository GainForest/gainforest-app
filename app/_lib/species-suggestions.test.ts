import { describe, expect, it } from "vitest";
import { formatSpeciesSuggestion, parseSpeciesSuggestion } from "./species-suggestions";

describe("species suggestions", () => {
  it("formats and parses translated identification comments", () => {
    const text = formatSpeciesSuggestion(
      {
        scientificName: "Panthera onca",
        vernacularName: "Jaguar",
        note: "Rosettes contain central spots.",
      },
      {
        suggestion: "Sugerencia de especie",
        commonName: "Nombre común",
        note: "Nota de evidencia",
      },
    );

    expect(parseSpeciesSuggestion(text)).toEqual({
      scientificName: "Panthera onca",
      vernacularName: "Jaguar",
      note: "Rosettes contain central spots.",
    });
  });

  it("does not treat ordinary comments as identifications", () => {
    expect(parseSpeciesSuggestion("This looks like a jaguar.")).toBeNull();
  });

  it("normalizes line breaks so fields cannot change the comment structure", () => {
    const text = formatSpeciesSuggestion(
      { scientificName: "Panthera\nonca", vernacularName: null, note: null },
      { suggestion: "Species suggestion", commonName: "Common name", note: "Evidence note" },
    );
    expect(parseSpeciesSuggestion(text)?.scientificName).toBe("Panthera onca");
  });
});
