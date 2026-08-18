import { describe, expect, it } from "vitest";

import { buildAccountSubItems } from "./account-menu-items";

const labels = {
  profile: "View profile",
  observations: "Observations",
  projects: "Projects",
  settings: "Settings",
};

/** The switcher builds one of these per account the viewer can switch to. */
function rowsFor(identifier: string) {
  return buildAccountSubItems({ identifier, labels });
}

describe("buildAccountSubItems", () => {
  it("offers the same profile and content rows under every account", () => {
    // A person plus the organizations they belong to. Each row points at that
    // account's own pages — the switcher offers one shape everywhere.
    for (const identifier of ["sharfy.gainforest.app", "gainforest.org", "did:plc:someorg"]) {
      expect(rowsFor(identifier).map((item) => item.key)).toEqual([
        "profile",
        "observations",
        "projects",
        "settings",
      ]);
    }
  });

  it("no longer carries the account management row — that lives in the sidebar now", () => {
    for (const identifier of ["sharfy.gainforest.app", "gainforest.org"]) {
      expect(rowsFor(identifier).map((item) => item.key)).not.toContain("manage");
    }
  });

  it("never offers a separate audio row — audio lives in the manage surface", () => {
    expect(rowsFor("gainforest.org").map((item) => item.key)).not.toContain("audio");
  });

  it("points every row at the account it belongs to", () => {
    const rows = rowsFor("gainforest.org");
    const hrefFor = (key: string) => rows.find((item) => item.key === key)?.href;

    expect(hrefFor("profile")).toBe("/account/gainforest.org");
    expect(hrefFor("observations")).toBe("/account/gainforest.org/observations");
    expect(hrefFor("projects")).toBe("/account/gainforest.org/projects");
    expect(hrefFor("settings")).toBe("/account/gainforest.org/settings");
  });

  it("does not leak one account's rows into another", () => {
    const mine = rowsFor("sharfy.gainforest.app");
    const theirs = rowsFor("gainforest.org");

    for (const key of ["profile", "observations", "projects", "settings"]) {
      const a = mine.find((item) => item.key === key)?.href;
      const b = theirs.find((item) => item.key === key)?.href;
      expect(a, key).not.toBe(b);
    }
  });
});
