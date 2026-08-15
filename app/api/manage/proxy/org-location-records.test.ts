import { describe, expect, it } from "vitest";
import {
  approximateCirclePayload,
  approximateLocationRecord,
  countryLocationRecord,
  exactLocationRecord,
  isOrgLocationChoiceInput,
  lexBlobRef,
  type OrgLocationChoiceInput,
} from "./org-location-records";
import { polygonRingCenter } from "@/app/_lib/country-location";

const zurich: OrgLocationChoiceInput = {
  place: {
    name: "Zurich, Switzerland",
    latitude: 47.3769,
    longitude: 8.5417,
    countryCode: "CH",
    region: "Zurich",
    country: "Switzerland",
    kind: "place",
  },
  approximate: false,
};

describe("isOrgLocationChoiceInput", () => {
  it("accepts a well-formed choice", () => {
    expect(isOrgLocationChoiceInput(zurich)).toBe(true);
    expect(isOrgLocationChoiceInput({ ...zurich, approximate: true })).toBe(true);
  });

  it("rejects out-of-range and malformed input", () => {
    expect(isOrgLocationChoiceInput(null)).toBe(false);
    expect(isOrgLocationChoiceInput({ ...zurich, place: { ...zurich.place, latitude: 91 } })).toBe(false);
    expect(isOrgLocationChoiceInput({ ...zurich, place: { ...zurich.place, longitude: -200 } })).toBe(false);
    expect(isOrgLocationChoiceInput({ ...zurich, place: { ...zurich.place, name: "" } })).toBe(false);
    expect(isOrgLocationChoiceInput({ ...zurich, place: { ...zurich.place, kind: "planet" } })).toBe(false);
    expect(isOrgLocationChoiceInput({ ...zurich, approximate: "yes" })).toBe(false);
  });
});

describe("countryLocationRecord", () => {
  it("names the country by code and claims no coordinate", () => {
    const record = countryLocationRecord("ch")!;
    expect(record.locationType).toBe("country-code");
    expect(record.location).toEqual({ $type: "app.certified.location#string", string: "CH" });
    expect(record.name).toBe("Switzerland");
    expect(JSON.stringify(record)).not.toContain("47");
  });

  it("refuses an unknown code", () => {
    expect(countryLocationRecord("XX")).toBeNull();
  });
});

describe("exactLocationRecord", () => {
  it("publishes the point with the place name", () => {
    const record = exactLocationRecord(zurich);
    expect(record.locationType).toBe("coordinate-decimal");
    expect(record.location).toEqual({
      $type: "app.certified.location#string",
      string: "47.376900,8.541700",
    });
    expect(record.name).toBe("Zurich, Switzerland");
  });
});

describe("approximate records", () => {
  it("publishes a circle around the (already fuzzed) point under a coarse name", () => {
    const payload = approximateCirclePayload({ latitude: 47.4, longitude: 8.6 });
    const center = polygonRingCenter(JSON.parse(payload));
    expect(center!.latitude).toBeCloseTo(47.4, 2);
    expect(center!.longitude).toBeCloseTo(8.6, 2);

    const record = approximateLocationRecord(
      { ...zurich, approximate: true },
      { $type: "blob", ref: { $link: "bafy" }, mimeType: "application/geo+json", size: payload.length },
    );
    expect(record.locationType).toBe("geojson");
    // The coarse label, never the searched name.
    expect(record.name).toBe("Zurich, Switzerland");
    expect(JSON.stringify(record)).not.toContain("47.3769");
  });
});

describe("lexBlobRef", () => {
  it("accepts both wrapped and bare upload responses", () => {
    const bare = { ref: { $link: "bafy" }, mimeType: "image/png", size: 10 };
    expect(lexBlobRef(bare, 99)).toMatchObject({ $type: "blob", mimeType: "image/png", size: 10 });
    expect(lexBlobRef({ blob: bare }, 99)).toMatchObject({ $type: "blob", size: 10 });
    expect(lexBlobRef({ blob: { mimeType: "x" } }, 99)).toBeNull();
    expect(lexBlobRef(null, 99)).toBeNull();
  });
});
