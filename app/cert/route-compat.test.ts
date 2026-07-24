import { describe, expect, it } from "vitest";
import { canonicalCertAliasHref, parentProjectHref, validatedCertTab } from "./route-compat";

describe("Cert route compatibility", () => {
  it("preserves only supported alias tabs", () => {
    expect(canonicalCertAliasHref("/cert/alice/one", { tab: "reviews", ignored: "value" })).toBe(
      "/cert/alice/one?tab=reviews",
    );
    expect(canonicalCertAliasHref("/cert/alice/one", { tab: "unknown" })).toBe("/cert/alice/one");
    expect(canonicalCertAliasHref("/cert/alice/one", { tab: ["timeline", "reviews"] })).toBe(
      "/cert/alice/one?tab=timeline",
    );
    expect(validatedCertTab(undefined)).toBeNull();
  });

  it("maps legacy Cert intent to supported project destinations", () => {
    expect(parentProjectHref("/projects/alice/one", "overview")).toBe("/projects/alice/one");
    expect(parentProjectHref("/projects/alice/one", "site-boundaries")).toBe(
      "/projects/alice/one?tab=places",
    );
    expect(parentProjectHref("/projects/alice/one", "timeline")).toBe(
      "/projects/alice/one?tab=updates",
    );
    expect(parentProjectHref("/projects/alice/one", "reviews")).toBe(
      "/projects/alice/one?tab=reviews",
    );
    expect(parentProjectHref("/projects/alice/one", "donations")).toBe("/projects/alice/one#support");
  });
});
