import { describe, expect, it } from "vitest";
import { applyMappings, autoDetectMappings } from "./column-mapper";
import { getKoboColumnMappings } from "./kobo-mapper";
import { parseAndValidateRows } from "./schemas";
import { getTargetFieldLabel } from "./types";

const REQUIRED_TREE_VALUES = {
  scientificName: "Cedrela odorata",
  eventDate: "2020-01-15",
  decimalLatitude: "-3.4653",
  decimalLongitude: "-62.2159",
};

describe("root collar diameter upload support", () => {
  it.each([
    "root collar diameter",
    "root_collar_diameter",
    "root collar diameter cm",
    "Root Collar Diameter (cm)",
    "rcd",
  ])("auto-maps %s to the supported diameter measurement", (header) => {
    const mappings = autoDetectMappings([
      "scientificName",
      "eventDate",
      "decimalLatitude",
      "decimalLongitude",
      header,
    ]);

    expect(mappings).toContainEqual({ sourceColumn: header, targetField: "diameter" });
  });

  it("auto-maps Kobo root collar diameter headings to the supported diameter measurement", () => {
    expect(getKoboColumnMappings(["_uuid", "rcd"])).toContainEqual({
      sourceColumn: "rcd",
      targetField: "diameter",
    });
    expect(getKoboColumnMappings(["_uuid", "root collar diameter cm"])).toContainEqual({
      sourceColumn: "root collar diameter cm",
      targetField: "diameter",
    });
  });

  it("labels the mapped measurement as root collar diameter", () => {
    expect(getTargetFieldLabel("diameter")).toBe("Root collar diameter (cm)");
  });

  it("accepts rows with DBH only, root collar diameter only, both, or neither", () => {
    const rows = [
      { ...REQUIRED_TREE_VALUES, dbh: "18.2" },
      { ...REQUIRED_TREE_VALUES, rcd: "4.5" },
      { ...REQUIRED_TREE_VALUES, dbh: "19.1", rcd: "5.2" },
      { ...REQUIRED_TREE_VALUES },
    ];
    const mappings = autoDetectMappings([
      "scientificName",
      "eventDate",
      "decimalLatitude",
      "decimalLongitude",
      "dbh",
      "rcd",
      "root collar diameter cm",
    ]);
    const mappedRows = applyMappings(rows, mappings);
    const result = parseAndValidateRows(mappedRows);

    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(4);
    expect(result.valid[0].floraMeasurement).toEqual({ dbh: "18.2" });
    expect(result.valid[1].floraMeasurement).toEqual({ diameter: "4.5" });
    expect(result.valid[2].floraMeasurement).toEqual({ dbh: "19.1", diameter: "5.2" });
    expect(result.valid[3].floraMeasurement).toBeNull();
  });
});
