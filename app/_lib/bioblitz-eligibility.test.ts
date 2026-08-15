import { describe, expect, it } from "vitest";
import {
  bioblitzObservationPoints,
  classifyBioblitzImage,
  hasBioblitzSpeciesLabel,
  isEligibleBioblitzCategory,
  isEligibleBioblitzDescription,
} from "./bioblitz-eligibility";

describe("BioBlitz image eligibility", () => {
  it.each([
    "A potted plant with glossy, dark green leaves. The plant is in a brown plastic pot.",
    "A succulent plant in a black pot with soil.",
    "The photo shows two marigold flowers with green leaves. The flowers are in a pot with dark soil.",
    "A small plant in a black pot with soil. It appears to be a houseplant.",
  ])("classifies potted plants: %s", (notes) => {
    expect(classifyBioblitzImage({ notes })).toBe("potted-plant");
  });

  it.each([
    "A person is observing a body of water with a spotting scope.",
    "The image shows two individuals observing the environment.",
    "A group of men are standing in front of two informational signs.",
    "The photo shows a boat traveling down a river. Two people are visible in the boat.",
  ])("classifies people or human activities as the subject: %s", (notes) => {
    expect(classifyBioblitzImage({ notes })).toBe("person");
  });

  it("classifies explicitly indoor observations", () => {
    expect(classifyBioblitzImage({ notes: "A flowering plant photographed inside a room." })).toBe("indoors");
  });

  it.each([
    ["A Collared Kingfisher is perched on a branch, holding a small fish in its beak.", "wildlife"],
    ["A small crab is visible on a muddy surface.", "wildlife"],
    ["A cluster of bright yellow flowers is visible. A human hand is partially visible in the corner.", "plant"],
    ["Two fruits, one whole and one cut in half, are held in a person's hand.", "plant"],
    ["A dense mangrove forest with numerous prop roots above the water.", "plant"],
  ] as const)("keeps outdoor biodiversity subjects: %s", (notes, expected) => {
    const category = classifyBioblitzImage({ notes });
    expect(category).toBe(expected);
    expect(isEligibleBioblitzCategory(category)).toBe(true);
  });

  it("uses kingdom metadata when a description does not name the subject type", () => {
    expect(classifyBioblitzImage({ notes: "A single specimen is visible.", kingdom: "Plantae" })).toBe("plant");
    expect(classifyBioblitzImage({ notes: "A single specimen is visible.", kingdom: "Animalia" })).toBe("wildlife");
  });

  it("keeps unclear images off the automatic leaderboard", () => {
    expect(classifyBioblitzImage({ notes: null })).toBe("unclassified");
    expect(isEligibleBioblitzDescription({ notes: null })).toBe(false);
  });
});

describe("BioBlitz points scoring", () => {
  const WILDLIFE_NOTES = "A Collared Kingfisher is perched on a branch.";
  const PLANT_NOTES = "A dense mangrove forest with numerous prop roots above the water.";

  it("scores 2 points for an unlabeled animal photo and 1 for an unlabeled plant photo", () => {
    expect(bioblitzObservationPoints({ notes: WILDLIFE_NOTES })).toBe(2);
    expect(bioblitzObservationPoints({ notes: PLANT_NOTES })).toBe(1);
  });

  it("adds the 0.5 label bonus when the species is named", () => {
    expect(
      bioblitzObservationPoints({ notes: WILDLIFE_NOTES, scientificName: "Todiramphus chloris" }),
    ).toBe(2.5);
    expect(bioblitzObservationPoints({ notes: PLANT_NOTES, vernacularName: "Red mangrove" })).toBe(1.5);
  });

  it("gives no bonus for unidentified-style placeholder labels", () => {
    expect(hasBioblitzSpeciesLabel({ scientificName: "Unidentified" })).toBe(false);
    expect(hasBioblitzSpeciesLabel({ vernacularName: "unknown bird" })).toBe(false);
    expect(hasBioblitzSpeciesLabel({ scientificName: "  " })).toBe(false);
    expect(hasBioblitzSpeciesLabel({})).toBe(false);
    expect(bioblitzObservationPoints({ notes: WILDLIFE_NOTES, scientificName: "Unidentified" })).toBe(2);
  });

  it("accepts a real label in either name field", () => {
    expect(hasBioblitzSpeciesLabel({ scientificName: "Unidentified", vernacularName: "Scarlet macaw" })).toBe(true);
  });

  it("scores 0 for ineligible observations even when labeled", () => {
    expect(
      bioblitzObservationPoints({
        notes: "A succulent plant in a black pot with soil.",
        scientificName: "Echeveria elegans",
      }),
    ).toBe(0);
    expect(bioblitzObservationPoints({ notes: null })).toBe(0);
  });
});
