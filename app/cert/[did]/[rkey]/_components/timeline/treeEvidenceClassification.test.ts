import { describe, expect, it } from "vitest";
import {
  getOccurrenceDatasetRef,
  isTreeDatasetOccurrence,
} from "./treeEvidenceClassification";

const datasetUri = "at://org/app.gainforest.dwc.dataset/trees";

function occurrence(overrides: {
  datasetRef?: string | null;
  dynamicProperties?: string | null;
  establishmentMeans?: string | null;
} = {}) {
  return {
    datasetRef: overrides.datasetRef ?? datasetUri,
    dynamicProperties: overrides.dynamicProperties ?? null,
    establishmentMeans: overrides.establishmentMeans ?? null,
  };
}

describe("tree evidence classification", () => {
  it("uses dynamic datasetRef when the record field is absent", () => {
    expect(getOccurrenceDatasetRef(occurrence({
      datasetRef: null,
      dynamicProperties: JSON.stringify({ datasetRef: datasetUri }),
    }))).toBe(datasetUri);
  });

  it("treats bumicerts measured-tree dynamic properties as tree data", () => {
    expect(isTreeDatasetOccurrence(occurrence({
      dynamicProperties: JSON.stringify({ dataType: "measuredTree", source: "bumicerts" }),
    }))).toBe(true);
  });

  it("does not treat generic establishmentMeans as tree data without tree dataset metadata", () => {
    expect(isTreeDatasetOccurrence(occurrence({ establishmentMeans: "cultivated" }))).toBe(false);
  });

  it("allows establishmentMeans when the referenced dataset has tree metadata", () => {
    expect(isTreeDatasetOccurrence(
      occurrence({ establishmentMeans: "cultivated" }),
      { treeDatasetUrisWithMetadata: new Set([datasetUri]) },
    )).toBe(true);
  });
});
