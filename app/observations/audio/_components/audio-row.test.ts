import { describe, expect, it } from "vitest";

import type { AudioProjectUpload } from "@/app/_lib/audio-projects";
import type { NetworkSoundscape } from "@/app/_lib/soundscape-explore";
import {
  countForSoundscape,
  displaySoundscapeTitle,
  sharesFolder,
  rowSlots,
  slotDateKeys,
  soundscapeOnlyTotals,
  uploadForSoundscape,
} from "./audio-row";

const FOLDER_A = "at://did:plc:x/app.gainforest.ac.deployment/a";
const FOLDER_B = "at://did:plc:x/app.gainforest.ac.deployment/b";

function makeUpload(patch: Partial<AudioProjectUpload> = {}): AudioProjectUpload {
  return {
    id: "at://did:plc:x/org.hypercerts.context.attachment/1",
    did: "did:plc:x",
    deploymentRef: FOLDER_A,
    title: "Inhaa-Be Audiomoth 1",
    recordingCount: 78,
    recorderName: "Inhaa-Be Audiomoth 1",
    siteName: null,
    createdAt: "2026-07-30T17:18:53.753Z",
    recordingUris: [],
    recordedDates: ["2024-04-07"],
    ...patch,
  };
}

function makeSoundscape(patch: Partial<NetworkSoundscape> = {}): NetworkSoundscape {
  return {
    uri: "at://did:plc:x/app.gainforest.ac.soundscape/1",
    did: "did:plc:x",
    rkey: "1",
    deploymentRef: FOLDER_B,
    soundscape: {
      title: "Soundscape · Inhaa-Be Audiomoth 2 · 2024-04-04",
      note: null,
      ceilingHz: 24000,
      bands: [],
      sources: [
        { audioUri: "at://did:plc:x/app.gainforest.ac.audio/1", name: "a.wav", date: "2024-04-04", minuteOfDay: 0, pmn: [1] },
        { audioUri: "at://did:plc:x/app.gainforest.ac.audio/2", name: "b.wav", date: "2024-04-05", minuteOfDay: 5, pmn: [1] },
      ],
      createdAt: "2026-07-29T00:49:06.801Z",
    },
    ...patch,
  };
}

describe("displaySoundscapeTitle", () => {
  it("drops only the trailing date, keeping the folder the title names", () => {
    expect(displaySoundscapeTitle("Soundscape · Inhaa-Be Audiomoth 2 · 2024-04-04", "Soundscape")).toBe(
      "Soundscape · Inhaa-Be Audiomoth 2",
    );
  });

  it("drops a trailing date range", () => {
    expect(
      displaySoundscapeTitle("Soundscape · Inhaa-Be Audiomoth 2 · 2024-04-03 – 2024-04-05", "Soundscape"),
    ).toBe("Soundscape · Inhaa-Be Audiomoth 2");
  });

  it("leaves an authored title alone", () => {
    expect(displaySoundscapeTitle("Dawn chorus at the ridge", "Soundscape")).toBe("Dawn chorus at the ridge");
  });

  it("keeps a date that is part of the sentence rather than a trailing field", () => {
    expect(displaySoundscapeTitle("What 2024-04-04 sounded like", "Soundscape")).toBe(
      "What 2024-04-04 sounded like",
    );
  });

  it("falls back when the title is empty or only a date", () => {
    expect(displaySoundscapeTitle("", "Soundscape")).toBe("Soundscape");
    expect(displaySoundscapeTitle(null, "Soundscape")).toBe("Soundscape");
  });
});

describe("uploadForSoundscape", () => {
  it("matches the folder both records point at", () => {
    const upload = makeUpload({ deploymentRef: FOLDER_B });
    expect(uploadForSoundscape(makeSoundscape(), [upload])).toBe(upload);
  });

  it("never borrows another folder, even when the project has exactly one", () => {
    // The regression this guards: a lone folder used to be assumed to be the
    // soundscape's, which showed one recorder's file count on another's slot.
    expect(uploadForSoundscape(makeSoundscape(), [makeUpload({ deploymentRef: FOLDER_A })])).toBeNull();
  });

  it("returns null when the soundscape's folder is unknown", () => {
    expect(uploadForSoundscape(makeSoundscape({ deploymentRef: null }), [makeUpload()])).toBeNull();
  });
});

describe("sharesFolder", () => {
  it("is true only for the same folder", () => {
    expect(sharesFolder(makeSoundscape(), makeUpload({ deploymentRef: FOLDER_B }))).toBe(true);
    expect(sharesFolder(makeSoundscape(), makeUpload({ deploymentRef: FOLDER_A }))).toBe(false);
  });

  it("is false when either side has no folder", () => {
    expect(sharesFolder(makeSoundscape({ deploymentRef: null }), makeUpload({ deploymentRef: null }))).toBe(false);
  });
});

describe("rowSlots", () => {
  it("shows a folder as its soundscape rather than twice", () => {
    const upload = makeUpload({ deploymentRef: FOLDER_B });
    const slots = rowSlots([makeSoundscape()], [upload]);
    expect(slots.soundscapes).toHaveLength(1);
    expect(slots.soundscapes[0]!.upload).toBe(upload);
    expect(slots.recordings).toEqual([]);
  });

  it("keeps folders that have no soundscape as their own entries", () => {
    const withSoundscape = makeUpload({ id: "b", deploymentRef: FOLDER_B });
    const waiting = makeUpload({ id: "a", deploymentRef: FOLDER_A });
    const slots = rowSlots([makeSoundscape()], [withSoundscape, waiting]);
    expect(slots.soundscapes).toHaveLength(1);
    expect(slots.recordings).toEqual([waiting]);
  });

  it("keeps a folderless upload rather than assuming it is covered", () => {
    const unknown = makeUpload({ deploymentRef: null });
    expect(rowSlots([makeSoundscape()], [unknown]).recordings).toEqual([unknown]);
  });
});

describe("countForSoundscape", () => {
  it("prefers the matched folder's file count", () => {
    expect(countForSoundscape(makeSoundscape(), makeUpload({ recordingCount: 264 }))).toBe(264);
  });

  it("falls back to the soundscape's own sources when no folder matched", () => {
    expect(countForSoundscape(makeSoundscape(), null)).toBe(2);
  });

  it("ignores an empty folder count", () => {
    expect(countForSoundscape(makeSoundscape(), makeUpload({ recordingCount: 0 }))).toBe(2);
  });
});

describe("soundscapeOnlyTotals", () => {
  const withFolder = (ref: string | null, sources: number, uri: string) =>
    makeSoundscape({
      uri,
      deploymentRef: ref,
      soundscape: {
        ...makeSoundscape().soundscape,
        sources: Array.from({ length: sources }, (_, i) => ({
          audioUri: `at://did:plc:x/app.gainforest.ac.audio/${uri}-${i}`,
          name: `${i}.wav`,
          date: "2024-04-04",
          minuteOfDay: i,
          pmn: [1],
        })),
      },
    });

  it("counts one folder once, however many soundscapes came from it", () => {
    // A day and the whole week from the same recorder is still one recorder.
    const totals = soundscapeOnlyTotals([
      withFolder(FOLDER_A, 264, "a"),
      withFolder(FOLDER_A, 378, "b"),
    ]);
    expect(totals.recorderCount).toBe(1);
    expect(totals.recordingCount).toBe(378);
  });

  it("adds distinct folders together", () => {
    const totals = soundscapeOnlyTotals([
      withFolder(FOLDER_A, 264, "a"),
      withFolder(FOLDER_B, 78, "b"),
    ]);
    expect(totals.recorderCount).toBe(2);
    expect(totals.recordingCount).toBe(342);
  });

  it("never claims more recorders than it can prove", () => {
    const totals = soundscapeOnlyTotals([
      withFolder(null, 264, "a"),
      withFolder(null, 378, "b"),
    ]);
    expect(totals.recorderCount).toBe(1);
    expect(totals.recordingCount).toBe(378);
  });
});

describe("slotDateKeys", () => {
  it("uses the recorded dates when present", () => {
    expect(slotDateKeys(makeUpload({ recordedDates: ["2024-04-08", "2024-04-10"] }))).toEqual([
      "2024-04-08",
      "2024-04-10",
    ]);
  });

  it("falls back to the upload day when no recording carried a timestamp", () => {
    expect(slotDateKeys(makeUpload({ recordedDates: [], createdAt: "2026-07-30T17:18:53.753Z" }))).toEqual([
      "2026-07-30",
    ]);
  });

  it("is empty when nothing is known", () => {
    expect(slotDateKeys(makeUpload({ recordedDates: [], createdAt: null }))).toEqual([]);
  });
});
