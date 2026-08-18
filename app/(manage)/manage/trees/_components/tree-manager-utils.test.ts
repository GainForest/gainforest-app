import { describe, expect, it } from "vitest";
import {
  getTreeMeasurementDraft,
  toFloraMeasurementPayload,
  validateMeasurementDraft,
  validateOccurrenceDraft,
  type FloraMeasurement,
  type TreeMeasurementDraft,
  type TreeOccurrenceDraft,
} from "./tree-manager-utils";

const FLORA_TYPE = "app.gainforest.dwc.measurement#floraMeasurement" as const;

const EMPTY_DRAFT: TreeMeasurementDraft = {
  dbh: "",
  totalHeight: "",
  diameter: "",
  canopyCoverPercent: "",
};

const VALID_OCCURRENCE_DRAFT: TreeOccurrenceDraft = {
  scientificName: "Cedrela odorata",
  vernacularName: "",
  eventDate: "2020-01-01",
  recordedBy: "",
  locality: "",
  country: "",
  decimalLatitude: "-3.4653",
  decimalLongitude: "-62.2159",
  occurrenceRemarks: "",
  habitat: "",
  establishmentMeans: "",
};

describe("tree manager date validation", () => {
  it("blocks future event dates while allowing today and past dates", () => {
    const today = new Date();
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const futureYear = String(today.getFullYear() + 1);

    expect(validateOccurrenceDraft({ ...VALID_OCCURRENCE_DRAFT, eventDate: futureYear })).toBe("Date cannot be in the future. Use today or an earlier date.");
    expect(validateOccurrenceDraft({ ...VALID_OCCURRENCE_DRAFT, eventDate: todayValue })).toBeNull();
    expect(validateOccurrenceDraft({ ...VALID_OCCURRENCE_DRAFT, eventDate: "2020-01-01" })).toBeNull();
  });
});

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
