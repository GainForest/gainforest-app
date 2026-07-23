import { describe, expect, it } from "vitest";
import { plainChangelogSubject } from "./changelog-presenter";

describe("plainChangelogSubject", () => {
  it("removes conventional commit syntax", () => {
    expect(plainChangelogSubject("feat(explore): simplify filters", "account identifier")).toBe("simplify filters");
    expect(plainChangelogSubject("fix!: recover sign in", "account identifier")).toBe("recover sign in");
  });

  it("hides DID-like identifiers", () => {
    expect(plainChangelogSubject("Show did:plc:secret-value in records", "account identifier")).toBe(
      "Show account identifier in records",
    );
    expect(plainChangelogSubject("Map did:plc to a profile", "account identifier")).toBe(
      "Map account identifier to a profile",
    );
  });
});
