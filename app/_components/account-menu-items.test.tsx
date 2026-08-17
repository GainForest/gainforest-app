import { describe, expect, it } from "vitest";

import { AUDIO_WORKSPACE_HREF, buildAccountSubItems } from "./account-menu-items";

const labels = {
  profile: "View profile",
  observations: "Observations",
  manage: "Manage",
  audio: "Audio",
  projects: "Projects",
  settings: "Settings",
};

/** The switcher builds one of these per account the viewer can switch to. The
 *  restricted rows (manage, audio) follow the same admin flag in the app. */
function rowsFor(identifier: string, showAudio: boolean, showManage = showAudio) {
  return buildAccountSubItems({ identifier, labels, showAudio, showManage });
}

describe("buildAccountSubItems", () => {
  it("offers the audio workspace under every account the viewer can switch to", () => {
    // A person plus the organizations they belong to.
    const accounts = ["sharfy.gainforest.app", "gainforest.org", "did:plc:someorg"];

    for (const identifier of accounts) {
      const audio = rowsFor(identifier, true).find((item) => item.key === "audio");
      expect(audio, `no audio row for ${identifier}`).toBeDefined();
      expect(audio?.href).toBe(AUDIO_WORKSPACE_HREF);
    }
  });

  it("withholds the audio workspace from viewers who are not admins", () => {
    for (const identifier of ["sharfy.gainforest.app", "gainforest.org"]) {
      expect(rowsFor(identifier, false).map((item) => item.key)).not.toContain("audio");
    }
  });

  it("marks the audio row as restricted so it never looks public", () => {
    const audio = rowsFor("gainforest.org", true).find((item) => item.key === "audio");
    expect(audio?.adminOnly).toBe(true);
  });

  it("keeps the audio row next to observations", () => {
    expect(rowsFor("gainforest.org", true).map((item) => item.key)).toEqual([
      "profile",
      "observations",
      "manage",
      "audio",
      "projects",
      "settings",
    ]);
  });

  it("offers the manage surface under every account the viewer can switch to", () => {
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

    // The audio workspace is deliberately shared (it follows the account
    // context); every account-scoped row must differ.
    for (const key of ["profile", "observations", "manage", "projects", "settings"]) {
      const a = mine.find((item) => item.key === key)?.href;
      const b = theirs.find((item) => item.key === key)?.href;
      expect(a, key).not.toBe(b);
    }
  });
});
