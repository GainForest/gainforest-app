import { describe, expect, it } from "vitest";
import { TREE_FUTURE_DATE_ERROR, getTreeFutureDateError, isTreeDateInFuture } from "./tree-date-validation";

const TODAY = new Date(2026, 5, 11, 12, 0, 0);

describe("tree date future validation", () => {
  it("allows today and past full dates using date-only comparison", () => {
    expect(isTreeDateInFuture("2026-06-11", TODAY)).toBe(false);
    expect(isTreeDateInFuture("06/11/2026", TODAY)).toBe(false);
    expect(isTreeDateInFuture("2026-06-11T23:59:59-12:00", TODAY)).toBe(false);
    expect(isTreeDateInFuture("2024-01-01", TODAY)).toBe(false);
  });

  it("rejects future full dates and timestamps", () => {
    expect(isTreeDateInFuture("2026-06-12", TODAY)).toBe(true);
    expect(isTreeDateInFuture("06/12/2026", TODAY)).toBe(true);
    expect(isTreeDateInFuture("2026-06-12T00:00:00Z", TODAY)).toBe(true);
    expect(getTreeFutureDateError("2026-06-12", TODAY)).toBe(TREE_FUTURE_DATE_ERROR);
  });

  it("compares year-only values against the current year", () => {
    expect(isTreeDateInFuture("2026", TODAY)).toBe(false);
    expect(isTreeDateInFuture("2025", TODAY)).toBe(false);
    expect(isTreeDateInFuture("2027", TODAY)).toBe(true);
  });
});
