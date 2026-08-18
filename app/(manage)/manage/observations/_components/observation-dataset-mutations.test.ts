import { beforeEach, describe, expect, it, vi } from "vitest";

const getRecord = vi.fn();
const putRecord = vi.fn();
const createRecord = vi.fn();
const deleteRecord = vi.fn();

vi.mock("../../_lib/mutations", () => ({
  getRecord: (...args: unknown[]) => getRecord(...args),
  putRecord: (...args: unknown[]) => putRecord(...args),
  createRecord: (...args: unknown[]) => createRecord(...args),
  deleteRecord: (...args: unknown[]) => deleteRecord(...args),
}));

const { attachObservationsToDataset, removeObservationsFromDataset, setDatasetProject } = await import("./observation-dataset-mutations");

const FOLDER_A = "at://did:plc:x/app.gainforest.dwc.dataset/a";
const FOLDER_B = "at://did:plc:x/app.gainforest.dwc.dataset/b";
const DATASET = "app.gainforest.dwc.dataset";
const OCCURRENCE = "app.gainforest.dwc.occurrence";
const COLLECTION = "org.hypercerts.collection";

/** Occurrence reads by default; dataset reads carry a recordCount. */
function stubRecords(occurrence: Record<string, unknown> = {}) {
  getRecord.mockImplementation((collection: string, rkey: string) => {
    if (collection === DATASET) {
      return Promise.resolve({ record: { $type: DATASET, name: rkey, recordCount: 10 }, cid: `${rkey}-cid` });
    }
    return Promise.resolve({
      record: { $type: OCCURRENCE, scientificName: "Ficus testus", imageEvidence: { file: { ref: "bafy…" } }, ...occurrence },
      cid: "occ-cid",
    });
  });
}

const countWrites = () =>
  putRecord.mock.calls
    .filter(([collection]) => collection === DATASET)
    .map(([, rkey, record]) => [rkey, (record as { recordCount: number }).recordCount]);

beforeEach(() => {
  getRecord.mockReset();
  putRecord.mockReset();
  putRecord.mockResolvedValue({ uri: "at://…", cid: "next-cid" });
  stubRecords();
});

describe("attachObservationsToDataset", () => {
  it("files a loose sighting and counts it", async () => {
    const result = await attachObservationsToDataset({
      datasetUri: FOLDER_A,
      datasetName: "Backyard birds",
      occurrences: [{ rkey: "occ1", datasetRef: null }],
    });

    expect(result.attached).toEqual(["occ1"]);
    expect(result.movedFrom).toEqual({});
    const [, , record] = putRecord.mock.calls[0]!;
    expect(record).toMatchObject({ datasetRef: FOLDER_A, datasetName: "Backyard birds", scientificName: "Ficus testus" });
    expect(countWrites()).toEqual([["a", 11]]);
  });

  it("moves a sighting out of the dataset it was in, and adjusts both counts", async () => {
    stubRecords({ datasetRef: FOLDER_B, datasetName: "Flowers" });

    const result = await attachObservationsToDataset({
      datasetUri: FOLDER_A,
      datasetName: "Backyard birds",
      occurrences: [{ rkey: "occ1", datasetRef: FOLDER_B }],
    });

    expect(result.attached).toEqual(["occ1"]);
    expect(result.movedFrom).toEqual({ [FOLDER_B]: ["occ1"] });
    // The dataset it left goes down; the one it joined goes up.
    expect(countWrites()).toEqual([["b", 9], ["a", 11]]);
  });

  it("reads the current dataset off the record, not the caller's stale copy", async () => {
    // Another tab already moved it into the target dataset.
    stubRecords({ datasetRef: FOLDER_A });

    const result = await attachObservationsToDataset({
      datasetUri: FOLDER_A,
      datasetName: "Backyard birds",
      occurrences: [{ rkey: "occ1", datasetRef: null }],
    });

    expect(result.skipped).toEqual([{ rkey: "occ1", reason: "already" }]);
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("leaves sightings already in the target dataset alone", async () => {
    const result = await attachObservationsToDataset({
      datasetUri: FOLDER_A,
      datasetName: "Backyard birds",
      occurrences: [{ rkey: "occ1", datasetRef: FOLDER_A }],
    });

    expect(result.skipped).toEqual([{ rkey: "occ1", reason: "already" }]);
    expect(getRecord).not.toHaveBeenCalled();
  });
});

describe("removeObservationsFromDataset", () => {
  it("clears the dataset fields, keeps everything else, and counts down", async () => {
    stubRecords({ datasetRef: FOLDER_B, datasetName: "Flowers", projectRef: "at://did:plc:x/org.hypercerts.collection/p" });

    const result = await removeObservationsFromDataset({
      occurrences: [{ rkey: "occ1", datasetRef: FOLDER_B }],
    });

    expect(result.removed).toEqual(["occ1"]);
    const record = putRecord.mock.calls.find(([collection]) => collection === OCCURRENCE)![2] as Record<string, unknown>;
    expect(record.datasetRef).toBeUndefined();
    expect(record.datasetName).toBeUndefined();
    // Taking a sighting out of a dataset says nothing about its project or photo.
    expect(record).toMatchObject({ projectRef: "at://did:plc:x/org.hypercerts.collection/p", imageEvidence: { file: { ref: "bafy…" } } });
    expect(countWrites()).toEqual([["b", 9]]);
  });

  it("does nothing for a sighting that is not in a dataset", async () => {
    const result = await removeObservationsFromDataset({ occurrences: [{ rkey: "occ1", datasetRef: null }] });

    expect(result.skipped).toEqual(["occ1"]);
    expect(putRecord).not.toHaveBeenCalled();
  });
});


describe("setDatasetProject", () => {
  const datasetUri = "at://did:plc:x/app.gainforest.dwc.dataset/d1";
  const targetUri = "at://did:plc:x/org.hypercerts.collection/target";

  it("aborts before unnesting when the target cannot be nested", async () => {
    getRecord.mockImplementation((collection: string, rkey: string) => {
      if (collection === COLLECTION && rkey === "target") return Promise.reject(new Error("target changed"));
      return Promise.resolve({ record: { $type: COLLECTION, items: [] }, cid: `${rkey}-cid` });
    });

    const result = await setDatasetProject({ datasetUri, projectUri: targetUri, currentParentRkeys: ["old"] });

    expect(result).toEqual({ nested: false, unnestedFrom: [], unnestErrors: [], nestError: "target changed" });
    expect(getRecord).toHaveBeenCalledTimes(1);
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("detaches from matching parents and reports an unnest failure", async () => {
    getRecord.mockImplementation((collection: string, rkey: string) => {
      if (collection === COLLECTION && rkey === "broken") return Promise.reject(new Error("stale parent"));
      return Promise.resolve({
        record: { $type: COLLECTION, items: [{ itemIdentifier: { uri: datasetUri } }] },
        cid: `${rkey}-cid`,
      });
    });

    const result = await setDatasetProject({ datasetUri, projectUri: "", currentParentRkeys: ["old", "broken"] });

    expect(result.nested).toBe(false);
    expect(result.unnestedFrom).toEqual(["old"]);
    expect(result.unnestErrors).toEqual([{ rkey: "broken", error: "stale parent" }]);
    expect(putRecord).toHaveBeenCalledWith(COLLECTION, "old", expect.objectContaining({ items: [] }), expect.any(Object));
  });

  it("does not unnest the target project while removing stale parents", async () => {
    getRecord.mockImplementation((collection: string, rkey: string) => Promise.resolve({
      record: { $type: COLLECTION, items: rkey === "target" ? [] : [{ itemIdentifier: { uri: datasetUri } }] },
      cid: `${rkey}-cid`,
    }));

    const result = await setDatasetProject({ datasetUri, projectUri: targetUri, currentParentRkeys: ["target", "old"] });

    expect(result.unnestedFrom).toEqual(["old"]);
    expect(getRecord.mock.calls.filter(([collection, rkey]) => collection === COLLECTION && rkey === "target")).toHaveLength(1);
    expect(putRecord.mock.calls.filter(([collection, rkey]) => collection === COLLECTION && rkey === "target")).toHaveLength(1);
  });
});
