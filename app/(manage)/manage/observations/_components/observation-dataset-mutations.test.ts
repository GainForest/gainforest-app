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

const { attachObservationsToDataset, removeObservationsFromDataset } = await import("./observation-dataset-mutations");

const FOLDER_A = "at://did:plc:x/app.gainforest.dwc.dataset/a";
const FOLDER_B = "at://did:plc:x/app.gainforest.dwc.dataset/b";
const DATASET = "app.gainforest.dwc.dataset";
const OCCURRENCE = "app.gainforest.dwc.occurrence";

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
