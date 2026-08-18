import { describe, expect, it } from "vitest";
import {
  identificationRkeyFromTags,
  speciesIdentificationTags,
} from "./species-identifications";

describe("species identification discovery tags", () => {
  it("links a notification comment to the structured identification rkey", () => {
    const tags = speciesIdentificationTags("3mabc123");
    expect(identificationRkeyFromTags(tags)).toBe("3mabc123");
  });

  it("ignores malformed references", () => {
    expect(identificationRkeyFromTags(["identification:../../record"])).toBeNull();
    expect(identificationRkeyFromTags(["species-identification"])).toBeNull();
  });
});
