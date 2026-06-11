import { describe, expect, it } from "vitest";
import {
  getTreeMeasurementDraft,
  toFloraMeasurementPayload,
  validateMeasurementDraft,
  type FloraMeasurement,
  type TreeMeasurementDraft,
} from "./tree-manager-utils";

const FLORA_TYPE = "app.gainforest.dwc.measurement#floraMeasurement" as const;

const EMPTY_DRAFT: TreeMeasurementDraft = {
  dbh: "",
  totalHeight: "",
  diameter: "",
  canopyCoverPercent: "",
};

describe("tree manager root collar diameter support", () => {
  it("loads existing basal diameter values into the root collar diameter draft field", () => {
    const measurement: FloraMeasurement = {
      $type: FLORA_TYPE,
      basalDiameter: "4.5",
    };

    expect(getTreeMeasurementDraft(measurement)).toMatchObject({ diameter: "4.5" });
  });

  it("saves the root collar diameter draft value as the supported basal diameter field", () => {
    expect(toFloraMeasurementPayload({ ...EMPTY_DRAFT, diameter: "4.5" })).toEqual({
      $type: FLORA_TYPE,
      basalDiameter: "4.5",
    });
  });

  it("keeps DBH and root collar diameter optional and separate", () => {
    expect(validateMeasurementDraft(EMPTY_DRAFT)).toBeNull();
    expect(toFloraMeasurementPayload({ ...EMPTY_DRAFT, dbh: "18.2", diameter: "4.5" })).toEqual({
      $type: FLORA_TYPE,
      dbh: "18.2",
      basalDiameter: "4.5",
    });
  });
});
