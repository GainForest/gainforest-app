import { describe, expect, it } from "vitest";
import { countryCodeFromLocationLabel } from "./countries";
import { polygonRingCenter } from "./country-location";
import { circlePolygonFeature } from "./org-location-geometry";

describe("countryCodeFromLocationLabel", () => {
  it("derives the country from a place label's trailing segment", () => {
    expect(countryCodeFromLocationLabel("Zurich, Switzerland")).toBe("CH");
    expect(countryCodeFromLocationLabel("Kinabatangan, Sandakan Division, Sabah, 90200, Malaysia")).toBe("MY");
    expect(countryCodeFromLocationLabel("Sabah, Malaysia")).toBe("MY");
  });

  it("matches a bare country name", () => {
    expect(countryCodeFromLocationLabel("Switzerland")).toBe("CH");
    expect(countryCodeFromLocationLabel("brazil")).toBe("BR");
  });

  it("knows common geocoder spellings that differ from the list", () => {
    expect(countryCodeFromLocationLabel("Prague, Czechia")).toBe("CZ");
    expect(countryCodeFromLocationLabel("Austin, United States of America")).toBe("US");
  });

  it("returns null rather than guessing", () => {
    expect(countryCodeFromLocationLabel("Atlantis")).toBeNull();
    expect(countryCodeFromLocationLabel("12.34567, 76.54321")).toBeNull();
    expect(countryCodeFromLocationLabel("")).toBeNull();
    expect(countryCodeFromLocationLabel(null)).toBeNull();
  });
});

describe("polygonRingCenter", () => {
  it("recovers the center of a published approximate circle", () => {
    const center = polygonRingCenter(circlePolygonFeature(5.4, 118.2));
    expect(center).not.toBeNull();
    expect(center!.latitude).toBeCloseTo(5.4, 2);
    expect(center!.longitude).toBeCloseTo(118.2, 2);
  });

  it("rejects shapes that are not a polygon feature", () => {
    expect(polygonRingCenter(null)).toBeNull();
    expect(polygonRingCenter({})).toBeNull();
    expect(polygonRingCenter({ geometry: { coordinates: "nope" } })).toBeNull();
    expect(polygonRingCenter({ geometry: { coordinates: [[["a", "b"]]] } })).toBeNull();
  });
});
