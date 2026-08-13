import { describe, expect, it } from "vitest";

import type { AudioMothRecordingInfo } from "@/app/_lib/audiomoth/wav-metadata";
import type { DeploymentEventItem } from "@/app/_lib/deployment-events";
import {
  deviceChipLabel,
  formatRecordingBytes,
  formatSampleRates,
  isWavCandidate,
  matchChimeDeployment,
  NEW_AUDIO_FOLDER,
  quickRecordingTime,
  resolveAudioTarget,
  splitObservationFiles,
  summarizeAudioBatch,
  unregisteredDeviceIds,
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

describe("matchChimeDeployment", () => {
  it("matches when the whole card agrees on one known chime", () => {
    const summary = summarizeAudioBatch([
      makeRecording("a.wav", makeInfo({ deploymentId: "0FE081F80FE081F8".toLowerCase() })),
    ]);
    expect(matchChimeDeployment(summary, [event])).toBe(event);
  });

  it("returns null for unknown, mixed or missing chimes", () => {
    const unknown = summarizeAudioBatch([makeRecording("a.wav", makeInfo({ deploymentId: "beefbeefbeefbeef" }))]);
    expect(matchChimeDeployment(unknown, [event])).toBeNull();
    const missing = summarizeAudioBatch([makeRecording("a.wav", makeInfo())]);
    expect(matchChimeDeployment(missing, [event])).toBeNull();
    const mixed = summarizeAudioBatch([
      makeRecording("a.wav", makeInfo({ deploymentId: "0fe081f80fe081f8" })),
      makeRecording("b.wav", makeInfo({ deploymentId: "beefbeefbeefbeef" })),
    ]);
    expect(matchChimeDeployment(mixed, [event])).toBeNull();
    expect(matchChimeDeployment(unknown, null)).toBeNull();
  });
});

describe("resolveAudioTarget", () => {
  const folders = [
    { uri: "at://did:plc:x/app.gainforest.ac.deployment/1", name: "Ridge trail" },
    { uri: "at://did:plc:x/app.gainforest.ac.deployment/2", name: "River bank" },
  ];
  const summary = summarizeAudioBatch([makeRecording("a.wav", makeInfo())]);

  it("uses an explicitly selected folder", () => {
    const plan = resolveAudioTarget({
      summary,
      matchedEvent: event,
      selection: folders[1]!.uri,
      folders,
      cardName: "AUDIOMOTH_SD",
      fallbackName: "Recordings",
    });
    expect(plan).toEqual({ kind: "existing", uri: folders[1]!.uri, name: "River bank" });
  });

  it("prefers the chime-matched deployment when the picker was left alone", () => {
    const plan = resolveAudioTarget({
      summary,
      matchedEvent: event,
      selection: "",
      folders,
      cardName: "AUDIOMOTH_SD",
      fallbackName: "Recordings",
    });
    expect(plan).toEqual({ kind: "event", event });
  });

  it("names a new folder after the card, falling back to the default", () => {
    const fromCard = resolveAudioTarget({
      summary,
      matchedEvent: null,
      selection: NEW_AUDIO_FOLDER,
      folders,
      cardName: "AUDIOMOTH_SD",
      fallbackName: "Recordings",
    });
    expect(fromCard).toEqual({
      kind: "named",
      name: "AUDIOMOTH_SD",
      deployedAt: "2026-06-12T06:00:00.000Z",
    });
    const fallback = resolveAudioTarget({
      summary,
      matchedEvent: null,
      selection: "",
      folders,
      cardName: "  ",
      fallbackName: "Recordings",
    });
    expect(fallback.kind).toBe("named");
    expect((fallback as { name: string }).name).toBe("Recordings");
  });

  it("reuses an existing folder whose name matches the card", () => {
    const plan = resolveAudioTarget({
      summary,
      matchedEvent: null,
      selection: "",
      folders,
      cardName: "ridge trail",
      fallbackName: "Recordings",
    });
    expect(plan).toEqual({ kind: "existing", uri: folders[0]!.uri, name: "ridge trail" });
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
