import { describe, expect, it } from "vitest";

import {
  collectFolderTotals,
  groupRecordingsByUploadDay,
  type RawFolder,
  type RawRecording,
} from "./audio-upload-days";

const OWNER = "did:plc:owner";
const FOLDER_A = `at://${OWNER}/app.gainforest.ac.deployment/folder-a`;
const FOLDER_B = `at://${OWNER}/app.gainforest.ac.deployment/folder-b`;

function folders(...entries: RawFolder[]): Map<string, RawFolder> {
  return new Map(entries.map((folder) => [folder.uri!, folder]));
}

function recording(overrides: Partial<RawRecording> & { createdAt: string }): RawRecording {
  return { did: OWNER, deploymentRef: FOLDER_A, ...overrides };
}

describe("groupRecordingsByUploadDay", () => {
  const folderA: RawFolder = { did: OWNER, uri: FOLDER_A, name: "INN2-004" };

  it("collapses a day of uploading into one entry", () => {
    const days = groupRecordingsByUploadDay(
      [
        recording({ createdAt: "2026-08-14T09:00:00.000Z" }),
        recording({ createdAt: "2026-08-14T15:28:34.000Z" }),
        recording({ createdAt: "2026-08-14T11:30:00.000Z" }),
      ],
      folders(folderA),
    );

    expect(days).toHaveLength(1);
    expect(days[0].recordingCount).toBe(3);
    expect(days[0].recorderName).toBe("INN2-004");
    // Ordered by the newest recording of the bout, so the row lands when the
    // upload finished rather than when it started.
    expect(days[0].createdAt).toBe("2026-08-14T15:28:34.000Z");
    expect(days[0].day).toBe("2026-08-14");
  });

  it("gives the same folder a fresh entry for each day it is uploaded to", () => {
    const days = groupRecordingsByUploadDay(
      [
        recording({ createdAt: "2026-08-17T05:51:16.000Z" }),
        recording({ createdAt: "2026-08-16T13:29:27.000Z" }),
        recording({ createdAt: "2026-08-16T09:00:00.000Z" }),
        recording({ createdAt: "2026-08-14T15:28:34.000Z" }),
      ],
      folders(folderA),
    );

    expect(days.map((day) => [day.day, day.recordingCount])).toEqual([
      ["2026-08-17", 1],
      ["2026-08-16", 2],
      ["2026-08-14", 1],
    ]);
    // Each entry counts only its own day, never the folder's running total.
    expect(days.every((day) => day.folderUri === FOLDER_A)).toBe(true);
    expect(new Set(days.map((day) => day.id)).size).toBe(3);
  });

  it("keeps two folders uploaded to on the same day apart", () => {
    const days = groupRecordingsByUploadDay(
      [
        recording({ createdAt: "2026-07-27T09:08:08.000Z", deploymentRef: FOLDER_A }),
        recording({ createdAt: "2026-07-27T09:02:14.000Z", deploymentRef: FOLDER_B }),
      ],
      folders(folderA, { did: OWNER, uri: FOLDER_B, name: "Inhaa-Be Audiomoth 1" }),
    );

    expect(days).toHaveLength(2);
    expect(days.map((day) => day.recorderName)).toEqual(["INN2-004", "Inhaa-Be Audiomoth 1"]);
  });

  it("produces nothing for a folder that holds no recordings", () => {
    expect(groupRecordingsByUploadDay([], folders(folderA))).toEqual([]);
  });

  it("still reports recordings uploaded outside any folder", () => {
    const days = groupRecordingsByUploadDay(
      [
        recording({ createdAt: "2026-07-21T07:49:51.000Z", deploymentRef: null }),
        recording({ createdAt: "2026-07-21T07:40:00.000Z", deploymentRef: undefined }),
      ],
      folders(folderA),
    );

    expect(days).toHaveLength(1);
    expect(days[0].recordingCount).toBe(2);
    expect(days[0].folderUri).toBeNull();
    expect(days[0].recorderName).toBeNull();
  });

  it("falls back to the device model when a folder was never named", () => {
    const days = groupRecordingsByUploadDay(
      [recording({ createdAt: "2026-05-17T16:59:18.000Z" })],
      folders({ did: OWNER, uri: FOLDER_A, name: "   ", deviceModel: "AudioMoth" }),
    );

    expect(days[0].recorderName).toBe("AudioMoth");
  });

  it("attributes an upload to the folder's owner, not the recording's repo", () => {
    const days = groupRecordingsByUploadDay(
      [recording({ createdAt: "2026-08-14T09:00:00.000Z", did: "did:plc:someone-else" })],
      folders(folderA),
    );

    expect(days[0].did).toBe(OWNER);
  });

  it("ignores recordings with no usable timestamp", () => {
    const days = groupRecordingsByUploadDay(
      [
        recording({ createdAt: "" }),
        recording({ createdAt: "not-a-date" }),
        recording({ createdAt: "2026-08-14T09:00:00.000Z" }),
      ],
      folders(folderA),
    );

    expect(days).toHaveLength(1);
    expect(days[0].recordingCount).toBe(1);
  });
});

describe("collectFolderTotals", () => {
  const folderA: RawFolder = { did: OWNER, uri: FOLDER_A, name: "INN2-004", siteRef: "at://site" };

  it("counts a folder from its recordings, not from anything written about it", () => {
    const totals = collectFolderTotals(
      [
        recording({ createdAt: "2026-08-14T09:00:00.000Z" }),
        recording({ createdAt: "2026-08-16T13:29:27.000Z" }),
        recording({ createdAt: "2026-08-17T05:51:16.000Z" }),
      ],
      folders(folderA),
    );

    const total = totals.get(FOLDER_A)!;
    expect(total.recordingCount).toBe(3);
    // The newest upload, so a folder added to later still sorts as recent.
    expect(total.uploadedAt).toBe("2026-08-17T05:51:16.000Z");
    expect(total.name).toBe("INN2-004");
    expect(total.siteRef).toBe("at://site");
  });

  it("collects the distinct days the recordings were recorded on", () => {
    const totals = collectFolderTotals(
      [
        recording({ createdAt: "2026-08-14T09:00:00.000Z", metadata: { recordedAt: "2026-04-04T01:00:00Z" } }),
        recording({ createdAt: "2026-08-14T09:01:00.000Z", metadata: { recordedAt: "2026-04-04T22:00:00Z" } }),
        recording({ createdAt: "2026-08-14T09:02:00.000Z", metadata: { recordedAt: "2026-04-03T05:00:00Z" } }),
        recording({ createdAt: "2026-08-14T09:03:00.000Z", metadata: null }),
      ],
      folders(folderA),
    );

    expect(totals.get(FOLDER_A)!.recordedDates).toEqual(["2026-04-03", "2026-04-04"]);
  });

  it("keeps folders apart and ignores folder-less recordings", () => {
    const totals = collectFolderTotals(
      [
        recording({ createdAt: "2026-08-14T09:00:00.000Z" }),
        recording({ createdAt: "2026-08-14T09:01:00.000Z", deploymentRef: FOLDER_B }),
        recording({ createdAt: "2026-08-14T09:02:00.000Z", deploymentRef: null }),
      ],
      folders(folderA, { did: OWNER, uri: FOLDER_B }),
    );

    expect(totals.size).toBe(2);
    expect(totals.get(FOLDER_A)!.recordingCount).toBe(1);
    expect(totals.get(FOLDER_B)!.recordingCount).toBe(1);
  });

  it("still totals a folder whose deployment record is missing", () => {
    const totals = collectFolderTotals([recording({ createdAt: "2026-08-14T09:00:00.000Z" })], new Map());
    const total = totals.get(FOLDER_A)!;
    expect(total.recordingCount).toBe(1);
    expect(total.did).toBe(OWNER); // read off the folder ref
    expect(total.name).toBeNull();
  });
});
