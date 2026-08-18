import { describe, expect, it } from "vitest";

import { buildAccountSubItems } from "./account-menu-items";

const labels = {
  profile: "View profile",
  observations: "Observations",
  manage: "Manage",
  projects: "Projects",
  settings: "Settings",
};

/** The switcher builds one of these per account the viewer can switch to. The
 *  restricted manage row follows the admin flag in the app. */
function rowsFor(identifier: string, showManage: boolean) {
  return buildAccountSubItems({ identifier, labels, showManage });
}

describe("buildAccountSubItems", () => {
  it("offers the manage surface under every account the viewer can switch to", () => {
    // A person plus the organizations they belong to. Each row points at that
    // account's own manage page — the surface acts on the account the row
    // sits under.
    for (const identifier of ["sharfy.gainforest.app", "gainforest.org", "did:plc:someorg"]) {
      const manage = rowsFor(identifier, true).find((item) => item.key === "manage");
      expect(manage, `no manage row for ${identifier}`).toBeDefined();
      expect(manage?.href).toBe(`/account/${encodeURIComponent(identifier)}/observations/manage`);
    }
  });

  it("withholds the manage surface from viewers who are not admins", () => {
    for (const identifier of ["sharfy.gainforest.app", "gainforest.org"]) {
      expect(rowsFor(identifier, false).map((item) => item.key)).not.toContain("manage");
    }
  });

  it("marks the manage row as restricted so it never looks public", () => {
    expect(rowsFor("gainforest.org", true).find((item) => item.key === "manage")?.adminOnly).toBe(true);
  });

  it("never offers a separate audio row — the manage surface covers audio", () => {
    for (const showManage of [true, false]) {
      expect(rowsFor("gainforest.org", showManage).map((item) => item.key)).not.toContain("audio");
    }
  });

  it("keeps the manage row next to observations", () => {
    expect(rowsFor("gainforest.org", true).map((item) => item.key)).toEqual([
      "profile",
      "observations",
      "manage",
      "projects",
      "settings",
    ]);
  });

  it("points every other row at the account it belongs to", () => {
    const rows = rowsFor("gainforest.org", true);
    const hrefFor = (key: string) => rows.find((item) => item.key === key)?.href;

    expect(hrefFor("profile")).toBe("/account/gainforest.org");
    expect(hrefFor("observations")).toBe("/account/gainforest.org/observations");
    expect(hrefFor("projects")).toBe("/account/gainforest.org/projects");
    expect(hrefFor("settings")).toBe("/account/gainforest.org/settings");
  });

  it("does not leak one account's rows into another", () => {
    const mine = rowsFor("sharfy.gainforest.app", true);
    const theirs = rowsFor("gainforest.org", true);

    for (const key of ["profile", "observations", "manage", "projects", "settings"]) {
      const a = mine.find((item) => item.key === key)?.href;
      const b = theirs.find((item) => item.key === key)?.href;
      expect(a, key).not.toBe(b);
    }
  });
});
