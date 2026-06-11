import { describe, expect, it } from "vitest";
import { TREE_FUTURE_DATE_ERROR } from "../../../../_lib/tree-date-validation";
import { parseAndValidateRows } from "./schemas";

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const BASE_ROW = {
  scientificName: "Cedrela odorata",
  decimalLatitude: "-3.4653",
  decimalLongitude: "-62.2159",
};

describe("tree upload event date validation", () => {
  it("rejects rows with a future event date during preview", () => {
    const futureDate = `${new Date().getFullYear() + 4}-01-01`;
    const result = parseAndValidateRows([{ ...BASE_ROW, eventDate: futureDate }]);

    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([{ index: 0, issues: [{ path: "eventDate", message: TREE_FUTURE_DATE_ERROR }] }]);
  });

  it("allows rows with today's date and past dates", () => {
    const today = formatYmd(new Date());
    const result = parseAndValidateRows([
      { ...BASE_ROW, eventDate: today },
      { ...BASE_ROW, eventDate: "2020-01-01" },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(2);
  });

  it("rejects year-only event dates after the current year", () => {
    const nextYear = String(new Date().getFullYear() + 1);
    const result = parseAndValidateRows([{ ...BASE_ROW, eventDate: nextYear }]);

    expect(result.valid).toEqual([]);
    expect(result.errors[0]?.issues).toContainEqual({ path: "eventDate", message: TREE_FUTURE_DATE_ERROR });
  });
});
