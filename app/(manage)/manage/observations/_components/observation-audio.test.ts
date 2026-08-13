import { describe, expect, it } from "vitest";

import type { AudioMothRecordingInfo } from "@/app/_lib/audiomoth/wav-metadata";
import type { DeploymentEventItem } from "@/app/_lib/deployment-events";
import {
  AUDIO_EVENT_SELECTION_PREFIX,
  deviceChipLabel,
  deviceNeedsDeployment,
  formatRecordingBytes,
  formatSampleRates,
  isWavCandidate,
  NEW_AUDIO_FOLDER,
  planAudioUploadGroups,
  quickRecordingTime,
  splitObservationFiles,
  summarizeAudioBatch,
  unregisteredDeviceIds,
  uploadableRecordings,
  type QuickRecording,
} from "./observation-audio";

function makeFile(name: string, size = 1000, type = ""): File {
  const file = new File([new Uint8Array(1)], name, { type, lastModified: Date.UTC(2026, 5, 1) });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function makeInfo(patch: Partial<AudioMothRecordingInfo> = {}): AudioMothRecordingInfo {
  return {
    sampleRate: 48000,
    channels: 1,
    bitsPerSample: 16,
    dataOffset: 44,
    dataLength: 1000,
    durationSeconds: 60,
    comment: null,
    artist: null,
    deviceId: "24F3190361DA539A",
    deploymentId: null,
    recordedAt: new Date(Date.UTC(2026, 5, 12, 6, 0, 0)),
    gain: "medium",
    batteryState: null,
    temperature: null,
    ...patch,
  };
}

function makeRecording(name: string, info: AudioMothRecordingInfo | null, size = 1000): QuickRecording {
  return { id: name, file: makeFile(name, size), info };
}

const event: DeploymentEventItem = {
  $type: "app.gainforest.dwc.event",
  eventID: "0fe081f80fe081f8",
  eventDate: "2026-06-10T00:00:00.000Z",
  locality: "Ridge trail",
  createdAt: "2026-06-10T00:00:00.000Z",
  uri: "at://did:plc:x/app.gainforest.dwc.event/1",
  rkey: "1",
  cid: "cid1",
  did: "did:plc:x",
};

describe("isWavCandidate", () => {
  it("accepts .wav names case-insensitively", () => {
    expect(isWavCandidate("20260612_060000.WAV")).toBe(true);
    expect(isWavCandidate("recording.wav")).toBe(true);
  });

  it("rejects hidden files and AppleDouble sidecars", () => {
    expect(isWavCandidate("._20260612_060000.WAV")).toBe(false);
    expect(isWavCandidate(".hidden.wav")).toBe(false);
    expect(isWavCandidate("photo.jpg")).toBe(false);
  });
});

describe("splitObservationFiles", () => {
  it("routes images and WAVs into separate branches, dropping the rest", () => {
    const { images, wavs } = splitObservationFiles([
      makeFile("a.jpg", 10, "image/jpeg"),
      makeFile("b.WAV"),
      makeFile("notes.txt", 10, "text/plain"),
      makeFile("._b.WAV"),
    ]);
    expect(images.map((f) => f.name)).toEqual(["a.jpg"]);
    expect(wavs.map((f) => f.name)).toEqual(["b.WAV"]);
  });
});

describe("quickRecordingTime", () => {
  it("prefers the parsed header timestamp", () => {
    const rec = makeRecording("20200101_000000.WAV", makeInfo());
    expect(quickRecordingTime(rec).toISOString()).toBe("2026-06-12T06:00:00.000Z");
  });

  it("falls back to the AudioMoth filename pattern", () => {
    const rec = makeRecording("20260614_051500.WAV", makeInfo({ recordedAt: null }));
    expect(quickRecordingTime(rec).toISOString()).toBe("2026-06-14T05:15:00.000Z");
  });

  it("falls back to the file mtime when the name has no timestamp", () => {
    const rec = makeRecording("mystery.wav", null);
    expect(quickRecordingTime(rec).getTime()).toBe(Date.UTC(2026, 5, 1));
  });
});

describe("summarizeAudioBatch", () => {
  it("aggregates count, size, rates, date range, devices and chimes", () => {
    const summary = summarizeAudioBatch([
      makeRecording("a.wav", makeInfo({ deploymentId: "0fe081f80fe081f8" }), 2000),
      makeRecording(
        "b.wav",
        makeInfo({
          recordedAt: new Date(Date.UTC(2026, 5, 26, 18, 0, 0)),
          deviceId: "AAAAAAAAAAAAAAAA",
          sampleRate: 192000,
        }),
        3000,
      ),
      makeRecording("broken.wav", null, 500),
    ]);
    expect(summary.count).toBe(2);
    expect(summary.unreadable).toBe(1);
    expect(summary.totalBytes).toBe(5000);
    expect(summary.sampleRatesHz).toEqual([192000, 48000]);
    expect(summary.earliest?.toISOString()).toBe("2026-06-12T06:00:00.000Z");
    expect(summary.latest?.toISOString()).toBe("2026-06-26T18:00:00.000Z");
    expect(summary.deviceIds).toEqual(["24F3190361DA539A", "AAAAAAAAAAAAAAAA"]);
    expect(summary.chimeIds).toEqual(["0fe081f80fe081f8"]);
  });

  it("is empty for an all-unreadable batch", () => {
    const summary = summarizeAudioBatch([makeRecording("broken.wav", null)]);
    expect(summary.count).toBe(0);
    expect(summary.unreadable).toBe(1);
    expect(summary.earliest).toBeNull();
    expect(summary.sampleRatesHz).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats sizes", () => {
    expect(formatRecordingBytes(6.2 * 1024 ** 3)).toBe("6.2 GB");
    expect(formatRecordingBytes(2 * 1024 ** 2)).toBe("2.0 MB");
    expect(formatRecordingBytes(100)).toBe("1 KB");
  });

  it("formats sample rates in kHz", () => {
    expect(formatSampleRates([48000])).toBe("48 kHz");
    expect(formatSampleRates([192000, 48000])).toBe("192/48 kHz");
    expect(formatSampleRates([])).toBeNull();
  });

  it("labels a device chip from the ID tail", () => {
    expect(deviceChipLabel("24F3190361DA539A")).toBe("AM-61DA539A");
  });
});

describe("uploadableRecordings", () => {
  it("excludes unreadable and already-uploaded recordings", () => {
    const list = [
      makeRecording("a.wav", makeInfo()),
      { ...makeRecording("b.wav", makeInfo()), skipped: true },
      makeRecording("broken.wav", null),
    ];
    expect(uploadableRecordings(list).map((rec) => rec.id)).toEqual(["a.wav"]);
  });
});

describe("planAudioUploadGroups", () => {
  const folders = [
    { uri: "at://did:plc:x/app.gainforest.ac.deployment/1", name: "Ridge trail" },
    { uri: "at://did:plc:x/app.gainforest.ac.deployment/2", name: "River bank" },
  ];
  const base = {
    events: [event],
    selection: "",
    folders,
    cardName: "AUDIOMOTH_SD",
    fallbackName: "Recordings",
  };

  it("always files a chime-matched group under its deployment, even with a folder picked", () => {
    const matched = makeRecording("a.wav", makeInfo({ deploymentId: "0FE081F80FE081F8".toLowerCase() }));
    const plan = planAudioUploadGroups({ ...base, recordings: [matched], selection: folders[1]!.uri });
    expect(plan.groups).toEqual([{ plan: { kind: "event", event }, recordings: [matched] }]);
    expect(plan.matchedCount).toBe(1);
    expect(plan.unmatchedCount).toBe(0);
    expect(plan.unmatchedPlan).toBeNull();
  });

  it("splits a mixed card: matched chime → its event, the rest → the folder pool", () => {
    const matched = makeRecording("a.wav", makeInfo({ deploymentId: "0fe081f80fe081f8" }));
    const unknownChime = makeRecording("b.wav", makeInfo({ deploymentId: "beefbeefbeefbeef" }));
    const noChime = makeRecording("c.wav", makeInfo());
    const plan = planAudioUploadGroups({ ...base, recordings: [matched, unknownChime, noChime] });
    expect(plan.matchedCount).toBe(1);
    expect(plan.unmatchedCount).toBe(2);
    expect(plan.groups).toHaveLength(2);
    expect(plan.groups[0]!.plan).toEqual({ kind: "event", event });
    expect(plan.groups[1]!.recordings.map((rec) => rec.id)).toEqual(["b.wav", "c.wav"]);
    expect(plan.unmatchedPlan).toEqual({
      kind: "named",
      name: "AUDIOMOTH_SD",
      deployedAt: "2026-06-12T06:00:00.000Z",
    });
  });

  it("routes the unmatched pool to a manually assigned deployment event", () => {
    const noChime = makeRecording("a.wav", makeInfo());
    const plan = planAudioUploadGroups({
      ...base,
      recordings: [noChime],
      selection: `${AUDIO_EVENT_SELECTION_PREFIX}${event.uri}`,
    });
    expect(plan.unmatchedPlan).toEqual({ kind: "event", event });
  });

  it("routes the unmatched pool to an explicitly selected folder", () => {
    const plan = planAudioUploadGroups({
      ...base,
      recordings: [makeRecording("a.wav", makeInfo())],
      selection: folders[1]!.uri,
    });
    expect(plan.unmatchedPlan).toEqual({ kind: "existing", uri: folders[1]!.uri, name: "River bank" });
  });

  it("falls back to a folder named after the card, reusing one of the same name", () => {
    const fallback = planAudioUploadGroups({
      ...base,
      recordings: [makeRecording("a.wav", makeInfo())],
      cardName: "  ",
      selection: NEW_AUDIO_FOLDER,
    });
    expect(fallback.unmatchedPlan).toEqual({
      kind: "named",
      name: "Recordings",
      deployedAt: "2026-06-12T06:00:00.000Z",
    });
    const reused = planAudioUploadGroups({
      ...base,
      recordings: [makeRecording("a.wav", makeInfo())],
      cardName: "ridge trail",
    });
    expect(reused.unmatchedPlan).toEqual({ kind: "existing", uri: folders[0]!.uri, name: "ridge trail" });
  });

  it("ignores skipped and unreadable recordings entirely", () => {
    const plan = planAudioUploadGroups({
      ...base,
      recordings: [
        { ...makeRecording("a.wav", makeInfo({ deploymentId: "0fe081f80fe081f8" })), skipped: true },
        makeRecording("broken.wav", null),
      ],
    });
    expect(plan.groups).toHaveLength(0);
    expect(plan.matchedCount).toBe(0);
    expect(plan.unmatchedCount).toBe(0);
  });
});

describe("deviceNeedsDeployment", () => {
  const summary = summarizeAudioBatch([makeRecording("a.wav", makeInfo())]);

  it("is settled by a chime match", () => {
    expect(deviceNeedsDeployment(summary, [], true)).toBe(false);
  });

  it("is true with no folders at all", () => {
    expect(deviceNeedsDeployment(summary, [], false)).toBe(true);
  });

  it("matches folders by the device serial, case-insensitively", () => {
    expect(deviceNeedsDeployment(summary, [{ deviceSerialNumber: "24f3190361da539a" }], false)).toBe(false);
    expect(deviceNeedsDeployment(summary, [{ deviceSerialNumber: "AAAAAAAAAAAAAAAA" }], false)).toBe(true);
  });

  it("stays quiet while folders are unknown, headers are anonymous, or the batch is empty", () => {
    expect(deviceNeedsDeployment(summary, null, false)).toBe(false);
    const anonymous = summarizeAudioBatch([makeRecording("a.wav", makeInfo({ deviceId: null }))]);
    expect(deviceNeedsDeployment(anonymous, [{ deviceSerialNumber: "X" }], false)).toBe(false);
    const empty = summarizeAudioBatch([makeRecording("broken.wav", null)]);
    expect(deviceNeedsDeployment(empty, [], false)).toBe(false);
  });
});

describe("unregisteredDeviceIds", () => {
  it("flags device IDs missing from the equipment registry", () => {
    expect(unregisteredDeviceIds(["24F3190361DA539A", "AAAAAAAAAAAAAAAA"], ["24f3190361da539a"])).toEqual([
      "AAAAAAAAAAAAAAAA",
    ]);
  });

  it("flags nothing while the registry is still unknown", () => {
    expect(unregisteredDeviceIds(["24F3190361DA539A"], null)).toEqual([]);
  });
});
