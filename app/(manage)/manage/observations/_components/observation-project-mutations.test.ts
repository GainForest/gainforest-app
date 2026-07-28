import { beforeEach, describe, expect, it, vi } from "vitest";

const getRecord = vi.fn();
const putRecord = vi.fn();
const nestDatasetUnderProject = vi.fn();
const unnestDatasetFromProjects = vi.fn();

vi.mock("../../_lib/mutations", () => ({
  getRecord: (...args: unknown[]) => getRecord(...args),
  putRecord: (...args: unknown[]) => putRecord(...args),
}));
vi.mock("./observation-dataset-mutations", () => ({
  nestDatasetUnderProject: (...args: unknown[]) => nestDatasetUnderProject(...args),
  unnestDatasetFromProjects: (...args: unknown[]) => unnestDatasetFromProjects(...args),
}));

const { attachDatasetToProject, attachObservationsToProject } = await import("./observation-project-mutations");

const PROJECT = "at://did:plc:x/org.hypercerts.collection/p1";
const OTHER_PROJECT = "at://did:plc:x/org.hypercerts.collection/p2";
const PROJECT_SITE = "at://did:plc:x/app.certified.location/site-1";
const OWN_SITE = "at://did:plc:x/app.certified.location/site-own";

function storedRecord(overrides: Record<string, unknown> = {}) {
  return {
    record: {
      $type: "app.gainforest.dwc.occurrence",
      scientificName: "Ficus testus",
      imageEvidence: { file: { ref: "bafy…" } },
      datasetRef: "at://did:plc:x/app.gainforest.dwc.dataset/d1",
      ...overrides,
    },
    cid: "cid-1",
  };
}

beforeEach(() => {
  getRecord.mockReset();
  putRecord.mockReset();
  nestDatasetUnderProject.mockReset();
  unnestDatasetFromProjects.mockReset();
  unnestDatasetFromProjects.mockResolvedValue({ unnestedFrom: [], unnestErrors: [] });
  getRecord.mockResolvedValue(storedRecord());
  putRecord.mockResolvedValue({ uri: "at://…", cid: "cid-2" });
  nestDatasetUnderProject.mockResolvedValue(undefined);
});

describe("attachObservationsToProject", () => {
  it("files a published sighting under the project, keeping everything else", async () => {
    const result = await attachObservationsToProject({
      projectUri: PROJECT,
      occurrences: [{ rkey: "occ1", projectRef: null, siteRef: null }],
    });

    expect(result.attached).toEqual(["occ1"]);
    const [collection, rkey, record, options] = putRecord.mock.calls[0]!;
    expect(collection).toBe("app.gainforest.dwc.occurrence");
    expect(rkey).toBe("occ1");
    expect(record).toMatchObject({
      projectRef: PROJECT,
      scientificName: "Ficus testus",
      imageEvidence: { file: { ref: "bafy…" } },
      datasetRef: "at://did:plc:x/app.gainforest.dwc.dataset/d1",
    });
    // Concurrent-edit guard, so a stale tab can't clobber a newer record.
    expect(options).toMatchObject({ swapRecord: "cid-1" });
  });

  it("leaves sightings already in the project untouched", async () => {
    const result = await attachObservationsToProject({
      projectUri: PROJECT,
      occurrences: [{ rkey: "occ1", projectRef: PROJECT, siteRef: null }],
    });

    expect(result.skipped).toEqual(["occ1"]);
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("moves a sighting from another project", async () => {
    getRecord.mockResolvedValue(storedRecord({ projectRef: OTHER_PROJECT }));
    const result = await attachObservationsToProject({
      projectUri: PROJECT,
      occurrences: [{ rkey: "occ1", projectRef: OTHER_PROJECT, siteRef: null }],
    });

    expect(result.attached).toEqual(["occ1"]);
    expect(putRecord.mock.calls[0]![2]).toMatchObject({ projectRef: PROJECT });
  });

  it("fills in the project's site only when the sighting has none", async () => {
    getRecord.mockResolvedValueOnce(storedRecord()).mockResolvedValueOnce(storedRecord({ siteRef: OWN_SITE }));

    await attachObservationsToProject({
      projectUri: PROJECT,
      siteUri: PROJECT_SITE,
      occurrences: [
        { rkey: "no-site", projectRef: null, siteRef: null },
        { rkey: "own-site", projectRef: null, siteRef: OWN_SITE },
      ],
    });

    expect(putRecord.mock.calls[0]![2]).toMatchObject({ siteRef: PROJECT_SITE });
    // A sighting recorded at a real place keeps that place.
    expect(putRecord.mock.calls[1]![2]).toMatchObject({ siteRef: OWN_SITE });
  });

  it("reports per-sighting failures without stopping the rest", async () => {
    getRecord.mockRejectedValueOnce(new Error("gone")).mockResolvedValueOnce(storedRecord());

    const result = await attachObservationsToProject({
      projectUri: PROJECT,
      occurrences: [
        { rkey: "broken", projectRef: null, siteRef: null },
        { rkey: "fine", projectRef: null, siteRef: null },
      ],
    });

    expect(result.errors).toEqual([{ rkey: "broken", error: "gone" }]);
    expect(result.attached).toEqual(["fine"]);
  });
});

describe("attachDatasetToProject", () => {
  it("lists the dataset on the project and files every sighting in it", async () => {
    const result = await attachDatasetToProject({
      projectUri: PROJECT,
      datasetUri: "at://did:plc:x/app.gainforest.dwc.dataset/d1",
      datasetCid: "dataset-cid",
      occurrences: [
        { rkey: "occ1", projectRef: null, siteRef: null },
        { rkey: "occ2", projectRef: null, siteRef: null },
      ],
    });

    expect(nestDatasetUnderProject).toHaveBeenCalledWith(
      { projectUri: PROJECT, datasetUri: "at://did:plc:x/app.gainforest.dwc.dataset/d1", datasetCid: "dataset-cid" },
      undefined,
    );
    expect(result.nested).toBe(true);
    expect(result.attached).toEqual(["occ1", "occ2"]);
  });

  it("still files the sightings when the dataset could not be listed", async () => {
    // The per-sighting stamp is what every count and filter reads, so it must
    // not depend on the record-level listing succeeding.
    nestDatasetUnderProject.mockRejectedValue(new Error("swap failed"));

    const result = await attachDatasetToProject({
      projectUri: PROJECT,
      datasetUri: "at://did:plc:x/app.gainforest.dwc.dataset/d1",
      datasetCid: null,
      occurrences: [{ rkey: "occ1", projectRef: null, siteRef: null }],
    });

    expect(result.nested).toBe(false);
    expect(result.nestError).toBe("swap failed");
    expect(result.attached).toEqual(["occ1"]);
  });
});

describe("a dataset lives in one project", () => {
  it("moves the dataset out of the project that held it before", async () => {
    unnestDatasetFromProjects.mockResolvedValue({ unnestedFrom: ["old-project"], unnestErrors: [] });

    const result = await attachDatasetToProject({
      projectUri: PROJECT,
      datasetUri: "at://did:plc:x/app.gainforest.dwc.dataset/d1",
      datasetCid: null,
      parentRkeys: ["old-project", "p1"],
      occurrences: [{ rkey: "occ1", projectRef: OTHER_PROJECT, siteRef: null }],
    });

    // "p1" is the project being filed into — only the stale parent is dropped.
    expect(unnestDatasetFromProjects).toHaveBeenCalledWith(
      { datasetUri: "at://did:plc:x/app.gainforest.dwc.dataset/d1", parentRkeys: ["old-project"] },
      undefined,
    );
    expect(result.unnestedFrom).toEqual(["old-project"]);
  });

  it("does not touch other projects when the dataset has no previous home", async () => {
    await attachDatasetToProject({
      projectUri: PROJECT,
      datasetUri: "at://did:plc:x/app.gainforest.dwc.dataset/d1",
      datasetCid: null,
      parentRkeys: [],
      occurrences: [{ rkey: "occ1", projectRef: null, siteRef: null }],
    });

    expect(unnestDatasetFromProjects).not.toHaveBeenCalled();
  });
});
