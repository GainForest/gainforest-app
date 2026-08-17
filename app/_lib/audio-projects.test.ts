import { describe, expect, it } from "vitest";

import {
  collectUnattachedFolders,
  parseUploadedRecordingCount,
  type SweptFolder,
  type SweptRecording,
} from "./audio-projects";

const OWNER = "did:plc:owner";
const OTHER = "did:plc:other";
const FOLDER_A = `at://${OWNER}/app.gainforest.ac.deployment/folder-a`;
const FOLDER_B = `at://${OWNER}/app.gainforest.ac.deployment/folder-b`;

function folders(...entries: SweptFolder[]): Map<string, SweptFolder> {
  return new Map(entries.map((folder) => [folder.uri!, folder]));
}

function recording(overrides: Partial<SweptRecording>): SweptRecording {
  return { did: OWNER, deploymentRef: FOLDER_A, createdAt: "2026-08-01T10:00:00.000Z", ...overrides };
}

function collect(input: Partial<Parameters<typeof collectUnattachedFolders>[0]>) {
  return collectUnattachedFolders({
    recordings: [],
    folders: new Map(),
    attachedDeploymentRefs: new Set(),
    hiddenDids: new Set(),
    hiddenRecordUris: new Set(),
    ...input,
  });
}

describe("collectUnattachedFolders", () => {
  const folderA: SweptFolder = { did: OWNER, uri: FOLDER_A, name: "INN2-004" };

  it("groups an owner's recordings into one slot per folder", () => {
    const byOwner = collect({
      recordings: [
        recording({ createdAt: "2026-08-01T10:00:00.000Z", metadata: { recordedAt: "2026-07-30T05:00:00Z" } }),
        recording({ createdAt: "2026-08-02T09:00:00.000Z", metadata: { recordedAt: "2026-07-31T05:00:00Z" } }),
        recording({ deploymentRef: FOLDER_B, createdAt: "2026-08-03T08:00:00.000Z" }),
      ],
      folders: folders(folderA, { did: OWNER, uri: FOLDER_B, deviceModel: "AudioMoth" }),
    });

    const uploads = byOwner.get(OWNER)!;
    expect(uploads).toHaveLength(2);
    // Newest folder first.
    expect(uploads[0].deploymentRef).toBe(FOLDER_B);
    expect(uploads[0].recorderName).toBe("AudioMoth");
    expect(uploads[1].recorderName).toBe("INN2-004");
    expect(uploads[1].recordingCount).toBe(2);
    expect(uploads[1].createdAt).toBe("2026-08-02T09:00:00.000Z");
    expect(uploads[1].recordedDates).toEqual(["2026-07-30", "2026-07-31"]);
  });

  it("drops folders a project already shows", () => {
    const byOwner = collect({
      recordings: [recording({}), recording({ deploymentRef: FOLDER_B })],
      folders: folders(folderA, { did: OWNER, uri: FOLDER_B }),
      attachedDeploymentRefs: new Set([FOLDER_A]),
    });

    expect(byOwner.get(OWNER)!.map((upload) => upload.deploymentRef)).toEqual([FOLDER_B]);
  });

  it("skips recordings that sit in no folder", () => {
    expect(collect({ recordings: [recording({ deploymentRef: null })] }).size).toBe(0);
  });

  it("attributes a folder to its owner, not the recording's repo", () => {
    const byOwner = collect({
      recordings: [recording({ did: OTHER })],
      folders: folders(folderA),
    });

    expect([...byOwner.keys()]).toEqual([OWNER]);
  });

  it("honours moderation on the folder and on the account", () => {
    expect(
      collect({ recordings: [recording({})], folders: folders(folderA), hiddenRecordUris: new Set([FOLDER_A]) }).size,
    ).toBe(0);
    expect(
      collect({ recordings: [recording({})], folders: folders(folderA), hiddenDids: new Set([OWNER]) }).size,
    ).toBe(0);
  });

  it("keeps a folder whose deployment record is unknown, keyed by the ref's repo", () => {
    const byOwner = collect({ recordings: [recording({})] });
    const uploads = byOwner.get(OWNER)!;
    expect(uploads).toHaveLength(1);
    expect(uploads[0].recorderName).toBeNull();
  });
});

describe("parseUploadedRecordingCount", () => {
  it("reads the count the upload flow writes", () => {
    expect(parseUploadedRecordingCount("A recorder folder with 929 recordings.")).toBe(929);
    expect(parseUploadedRecordingCount("A recorder folder with 1,613 recordings.")).toBe(1613);
    expect(parseUploadedRecordingCount("no numbers here")).toBeNull();
  });
});
