import { describe, expect, it } from "vitest";

import { collectUnattachedFolders, parseUploadedRecordingCount } from "./audio-projects";
import type { AudioFolderTotal } from "./audio-upload-days";

const OWNER = "did:plc:owner";
const FOLDER_A = `at://${OWNER}/app.gainforest.ac.deployment/folder-a`;
const FOLDER_B = `at://${OWNER}/app.gainforest.ac.deployment/folder-b`;

function total(overrides: Partial<AudioFolderTotal> & { folderUri: string }): AudioFolderTotal {
  return {
    did: OWNER,
    recordingCount: 1,
    uploadedAt: "2026-08-01T10:00:00.000Z",
    recordedDates: [],
    name: null,
    deviceModel: null,
    siteRef: null,
    eventRef: null,
    ...overrides,
  };
}

function totals(...entries: AudioFolderTotal[]): Map<string, AudioFolderTotal> {
  return new Map(entries.map((entry) => [entry.folderUri, entry]));
}

function collect(input: Partial<Parameters<typeof collectUnattachedFolders>[0]>) {
  return collectUnattachedFolders({
    folderTotals: new Map(),
    attachedDeploymentRefs: new Set(),
    hiddenDids: new Set(),
    hiddenRecordUris: new Set(),
    ...input,
  });
}

describe("collectUnattachedFolders", () => {
  it("turns each folder into one slot, newest upload first", () => {
    const byOwner = collect({
      folderTotals: totals(
        total({
          folderUri: FOLDER_A,
          name: "INN2-004",
          recordingCount: 2,
          uploadedAt: "2026-08-02T09:00:00.000Z",
          recordedDates: ["2026-07-30", "2026-07-31"],
        }),
        total({
          folderUri: FOLDER_B,
          deviceModel: "AudioMoth",
          recordingCount: 5,
          uploadedAt: "2026-08-03T08:00:00.000Z",
        }),
      ),
    });

    const uploads = byOwner.get(OWNER)!;
    expect(uploads.map((upload) => upload.deploymentRef)).toEqual([FOLDER_B, FOLDER_A]);
    expect(uploads[0].recorderName).toBe("AudioMoth");
    expect(uploads[1].recorderName).toBe("INN2-004");
    expect(uploads[1].recordingCount).toBe(2);
    expect(uploads[1].recordedDates).toEqual(["2026-07-30", "2026-07-31"]);
  });

  it("drops folders a project already shows", () => {
    const byOwner = collect({
      folderTotals: totals(total({ folderUri: FOLDER_A }), total({ folderUri: FOLDER_B })),
      attachedDeploymentRefs: new Set([FOLDER_A]),
    });

    expect(byOwner.get(OWNER)!.map((upload) => upload.deploymentRef)).toEqual([FOLDER_B]);
  });

  it("drops an empty folder", () => {
    expect(collect({ folderTotals: totals(total({ folderUri: FOLDER_A, recordingCount: 0 })) }).size).toBe(0);
  });

  it("honours moderation on the folder and on the account", () => {
    const folderTotals = totals(total({ folderUri: FOLDER_A }));
    expect(collect({ folderTotals, hiddenRecordUris: new Set([FOLDER_A]) }).size).toBe(0);
    expect(collect({ folderTotals, hiddenDids: new Set([OWNER]) }).size).toBe(0);
  });

  it("falls back to the folder ref's repo when the folder record is unknown", () => {
    const byOwner = collect({ folderTotals: totals(total({ folderUri: FOLDER_A, did: "" })) });
    expect([...byOwner.keys()]).toEqual([OWNER]);
    expect(byOwner.get(OWNER)![0].recorderName).toBeNull();
  });

  it("groups folders under each owner separately", () => {
    const other = "did:plc:other";
    const byOwner = collect({
      folderTotals: totals(
        total({ folderUri: FOLDER_A }),
        total({ folderUri: `at://${other}/app.gainforest.ac.deployment/x`, did: other }),
      ),
    });

    expect([...byOwner.keys()].sort()).toEqual([other, OWNER].sort());
  });
});

describe("parseUploadedRecordingCount", () => {
  it("reads the count the upload flow writes", () => {
    expect(parseUploadedRecordingCount("A recorder folder with 929 recordings.")).toBe(929);
    expect(parseUploadedRecordingCount("A recorder folder with 1,613 recordings.")).toBe(1613);
    expect(parseUploadedRecordingCount("no numbers here")).toBeNull();
  });
});
