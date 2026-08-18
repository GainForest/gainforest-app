import { describe, expect, it } from "vitest";

import {
  activeUploadFolderMode,
  filterUploadFolders,
  findUploadFolderByName,
  isUploadFolderChosen,
  planNamedUploadFolder,
} from "./upload-folder";

const folders = [
  { uri: "at://did:plc:x/app.gainforest.ac.deployment/1", name: "Forest edge — April 2024" },
  { uri: "at://did:plc:x/app.gainforest.ac.deployment/2", name: "River bank" },
  { uri: "at://did:plc:x/app.gainforest.ac.deployment/3", name: "FOREST interior" },
];

describe("activeUploadFolderMode", () => {
  it("keeps the chosen mode when the account has folders", () => {
    expect(activeUploadFolderMode("existing", 3)).toBe("existing");
    expect(activeUploadFolderMode("new", 3)).toBe("new");
  });

  it("falls back to naming a new folder when there are none to pick", () => {
    expect(activeUploadFolderMode("existing", 0)).toBe("new");
  });
});

describe("filterUploadFolders", () => {
  it("returns everything for a blank query", () => {
    expect(filterUploadFolders(folders, "   ")).toHaveLength(3);
  });

  it("matches on any part of the name, ignoring case", () => {
    expect(filterUploadFolders(folders, "forest").map((f) => f.name)).toEqual([
      "Forest edge — April 2024",
      "FOREST interior",
    ]);
    expect(filterUploadFolders(folders, "bank")).toHaveLength(1);
  });

  it("returns nothing when no folder matches", () => {
    expect(filterUploadFolders(folders, "canopy")).toEqual([]);
  });

  it("never hides the folder that is already selected", () => {
    expect(filterUploadFolders(folders, "canopy", folders[1]!.uri).map((f) => f.name)).toEqual([
      "River bank",
    ]);
    expect(filterUploadFolders(folders, "forest", folders[1]!.uri).map((f) => f.name)).toEqual([
      "Forest edge — April 2024",
      "River bank",
      "FOREST interior",
    ]);
  });
});

describe("findUploadFolderByName", () => {
  it("finds the folder a re-read card would otherwise duplicate", () => {
    expect(findUploadFolderByName(folders, "River bank")?.uri).toBe(folders[1]!.uri);
  });

  it("ignores case and stray whitespace in the card's name", () => {
    expect(findUploadFolderByName(folders, "  forest   INTERIOR ")?.uri).toBe(folders[2]!.uri);
  });

  it("matches the whole name only, never a fragment", () => {
    expect(findUploadFolderByName(folders, "River")).toBeNull();
    expect(findUploadFolderByName(folders, "Forest edge")).toBeNull();
  });

  it("returns nothing for a new name or a blank one", () => {
    expect(findUploadFolderByName(folders, "Canopy")).toBeNull();
    expect(findUploadFolderByName(folders, "   ")).toBeNull();
    expect(findUploadFolderByName([], "River bank")).toBeNull();
  });
});

describe("planNamedUploadFolder", () => {
  it("reuses the folder a resumed upload would otherwise duplicate", () => {
    expect(planNamedUploadFolder(folders, "river BANK")).toEqual({
      action: "reuse",
      uri: folders[1]!.uri,
    });
  });

  it("creates a folder for a genuinely new name, trimmed", () => {
    expect(planNamedUploadFolder(folders, "  Canopy  ")).toEqual({ action: "create", name: "Canopy" });
  });

  it("does nothing for a blank name", () => {
    expect(planNamedUploadFolder(folders, "   ")).toEqual({ action: "none" });
  });
});

describe("isUploadFolderChosen", () => {
  const base = { needsFolder: true, mode: "existing" as const, selectedFolderUri: "", newFolderName: "" };

  it("needs no choice when every group matched a deployment", () => {
    expect(isUploadFolderChosen({ ...base, needsFolder: false })).toBe(true);
  });

  it("requires a selected folder in existing mode", () => {
    expect(isUploadFolderChosen(base)).toBe(false);
    expect(isUploadFolderChosen({ ...base, selectedFolderUri: folders[0]!.uri })).toBe(true);
  });

  it("requires a non-blank name in new mode", () => {
    expect(isUploadFolderChosen({ ...base, mode: "new", newFolderName: "  " })).toBe(false);
    expect(isUploadFolderChosen({ ...base, mode: "new", newFolderName: "Ridge" })).toBe(true);
  });

  it("ignores a typed name while an existing folder is expected", () => {
    expect(isUploadFolderChosen({ ...base, newFolderName: "Ridge" })).toBe(false);
  });
});
