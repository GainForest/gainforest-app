import { describe, expect, it } from "vitest";
import { radiusForValue } from "./dial";

const INNER = 34;
const OUTER = 250;

describe("radiusForValue", () => {
  it("puts zero at the inner edge and the maximum at the outer one", () => {
    expect(radiusForValue(0, 5000, INNER, OUTER)).toBe(INNER);
    expect(radiusForValue(5000, 5000, INNER, OUTER)).toBe(OUTER);
  });

  it("gives the data the whole radius, not half of it", () => {
    // Half the axis must land halfway out. Under the old -max..+max domain it
    // landed three quarters of the way out, with the inner half unusable.
    expect(radiusForValue(2500, 5000, INNER, OUTER)).toBeCloseTo(INNER + (OUTER - INNER) / 2, 6);
  });

  it("keeps quiet bands apart instead of collapsing them together", () => {
    const rumble = radiusForValue(400, 5000, INNER, OUTER);
    const birds = radiusForValue(2600, 5000, INNER, OUTER);
    expect(birds - rumble).toBeGreaterThan(90);
  });

  it("clamps out-of-range values rather than drawing outside the dial", () => {
    expect(radiusForValue(-100, 5000, INNER, OUTER)).toBe(INNER);
    expect(radiusForValue(9999, 5000, INNER, OUTER)).toBe(OUTER);
  });

  it("collapses to the inner edge when there is no scale yet", () => {
    expect(radiusForValue(10, 0, INNER, OUTER)).toBe(INNER);
  });
});
