import { describe, expect, it } from "vitest";
import { countryCodeFromLocationLabel } from "./countries";
import {
  countryCodeFromCertifiedLocation,
  decodeLocationPayload,
  polygonRingCenter,
} from "./country-location";
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

describe("decodeLocationPayload", () => {
  it("decodes a typed country-code payload", () => {
    expect(decodeLocationPayload("CH", "country-code")).toEqual({ kind: "country", countryCode: "CH" });
    expect(decodeLocationPayload(" my ", "country-code")).toEqual({ kind: "country", countryCode: "MY" });
  });

  it("rejects a country-code payload that is not a country", () => {
    expect(decodeLocationPayload("XX", "country-code")).toBeNull();
    expect(decodeLocationPayload("Switzerland", "country-code")).toBeNull();
  });

  it("recognises a bare code by shape when the type is missing", () => {
    // The directory and globe read the payload without locationType.
    expect(decodeLocationPayload("CH")).toEqual({ kind: "country", countryCode: "CH" });
  });

  it("decodes lat,lon coordinate payloads as points", () => {
    expect(decodeLocationPayload("47.3769,8.5417")).toEqual({ kind: "point", latitude: 47.3769, longitude: 8.5417 });
    // Ma Earth writes the same shape (lat first), blobbed.
    expect(decodeLocationPayload("-13.5,-71.9")).toEqual({ kind: "point", latitude: -13.5, longitude: -71.9 });
  });

  it("decodes GeoJSON polygons — ours (Feature) and Ma Earth's (bare geometry) — as areas", () => {
    const feature = JSON.stringify(circlePolygonFeature(5.4, 118.2));
    const featureDecoded = decodeLocationPayload(feature, "geojson");
    expect(featureDecoded?.kind).toBe("area");

    const bareGeometry = JSON.stringify((circlePolygonFeature(5.4, 118.2) as { geometry: unknown }).geometry);
    const bareDecoded = decodeLocationPayload(bareGeometry, "geojson-polygon");
    expect(bareDecoded?.kind).toBe("area");
    if (bareDecoded?.kind === "area") {
      expect(bareDecoded.latitude).toBeCloseTo(5.4, 2);
      expect(bareDecoded.longitude).toBeCloseTo(118.2, 2);
    }
  });

  it("returns null for junk rather than guessing", () => {
    expect(decodeLocationPayload("")).toBeNull();
    expect(decodeLocationPayload("not a location")).toBeNull();
    expect(decodeLocationPayload("1,2,3garbage")).toBeNull();
  });
});

describe("countryCodeFromCertifiedLocation", () => {
  it("reads the new country-code records", () => {
    expect(
      countryCodeFromCertifiedLocation({
        locationType: "country-code",
        location: { string: "CH" },
        name: "Switzerland",
      }),
    ).toBe("CH");
  });

  it("still reads the legacy centroid records", () => {
    // GainForest's own pre-redesign record: the CH centroid from the table.
    expect(countryCodeFromCertifiedLocation({ location: { string: "47,8" } })).toBe("CH");
  });

  it("never trusts the free-text name", () => {
    expect(
      countryCodeFromCertifiedLocation({ location: { string: "47.3769,8.5417" }, name: "Switzerland" }),
    ).toBeNull();
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
