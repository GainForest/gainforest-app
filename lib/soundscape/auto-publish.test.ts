import { describe, expect, it } from "vitest";

import {
  buildAutoDrafts,
  decideAutoWrite,
  rkeyOfUri,
  sourcesSignature,
  type AutoPublishEntry,
} from "./auto-publish";
import type { PublishedSoundscape } from "./record";

const FOLDER_A = "at://did:plc:x/app.gainforest.ac.deployment/aaa111";
const FOLDER_B = "at://did:plc:x/app.gainforest.ac.deployment/bbb222";

function entry(patch: Partial<AutoPublishEntry> = {}): AutoPublishEntry {
  return {
    audioUri: "at://did:plc:x/app.gainforest.ac.audio/rec1",
    name: "20240404_060000.WAV",
    deploymentRef: FOLDER_A,
    date: "2024-04-04",
    minuteOfDay: 360,
    pmn: [1, 2, 3, 4, 5],
    sampleRate: 48_000,
    ...patch,
  };
}

const FOLDERS = [
  { uri: FOLDER_A, name: "Riverbank" },
  { uri: FOLDER_B, name: "Ridge" },
];

describe("rkeyOfUri", () => {
  it("reads the rkey off an AT-URI", () => {
    expect(rkeyOfUri(FOLDER_A)).toBe("aaa111");
  });

  it("refuses things that are not record URIs", () => {
    expect(rkeyOfUri("")).toBeNull();
    expect(rkeyOfUri("did:plc:x")).toBeNull();
  });
});

describe("sourcesSignature", () => {
  it("is order-independent", () => {
    const a = [{ audioUri: "at://x/1" }, { audioUri: "at://x/2" }];
    const b = [{ audioUri: "at://x/2" }, { audioUri: "at://x/1" }];
    expect(sourcesSignature(a)).toBe(sourcesSignature(b));
  });

  it("changes when a recording joins", () => {
    const a = [{ audioUri: "at://x/1" }];
    const b = [{ audioUri: "at://x/1" }, { audioUri: "at://x/2" }];
    expect(sourcesSignature(a)).not.toBe(sourcesSignature(b));
  });
});

describe("buildAutoDrafts", () => {
  it("shapes one draft per folder, keyed by the folder's rkey", () => {
    const drafts = buildAutoDrafts(
      [
        entry({ audioUri: "at://x/a1" }),
        entry({ audioUri: "at://x/a2", minuteOfDay: 30 }),
        entry({ audioUri: "at://x/b1", deploymentRef: FOLDER_B }),
      ],
      FOLDERS,
    );
    expect(drafts).toHaveLength(2);
    const [a, b] = drafts;
    expect(a.rkey).toBe("aaa111");
    expect(a.folderName).toBe("Riverbank");
    expect(a.sources).toHaveLength(2);
    expect(b.rkey).toBe("bbb222");
  });

  it("sorts a folder's sources by time of day", () => {
    const drafts = buildAutoDrafts(
      [
        entry({ audioUri: "at://x/late", minuteOfDay: 1200 }),
        entry({ audioUri: "at://x/early", minuteOfDay: 10 }),
      ],
      FOLDERS,
    );
    expect(drafts[0].sources.map((s) => s.audioUri)).toEqual(["at://x/early", "at://x/late"]);
  });

  it("leaves out recordings without a folder, or whose folder record is gone", () => {
    const drafts = buildAutoDrafts(
      [
        entry({ deploymentRef: null }),
        entry({ deploymentRef: "at://did:plc:x/app.gainforest.ac.deployment/deleted" }),
      ],
      FOLDERS,
    );
    expect(drafts).toEqual([]);
  });

  it("caps the spectrum ceiling at what the recordings can represent", () => {
    const drafts = buildAutoDrafts(
      [entry({ sampleRate: 192_000 }), entry({ audioUri: "at://x/2", sampleRate: 48_000 })],
      FOLDERS,
    );
    expect(drafts[0].ceilingHz).toBe(96_000);
  });

  it("falls back to a 24 kHz ceiling when no recording names a rate", () => {
    const drafts = buildAutoDrafts([entry({ sampleRate: null })], FOLDERS);
    expect(drafts[0].ceilingHz).toBe(24_000);
  });

  it("names the days the folder covers", () => {
    const drafts = buildAutoDrafts(
      [
        entry({ audioUri: "at://x/1", date: "2024-04-03" }),
        entry({ audioUri: "at://x/2", date: "2024-04-05" }),
      ],
      FOLDERS,
    );
    expect(drafts[0].dateLabel).toBe("2024-04-03 \u2013 2024-04-05");
  });
});

describe("decideAutoWrite", () => {
  const sources = [
    { audioUri: "at://x/1", name: "a.wav", date: "2024-04-04", minuteOfDay: 10, pmn: [1, 2, 3, 4, 5] },
  ];
  const existing: PublishedSoundscape = {
    title: "Soundscape · Riverbank · 2024-04-04",
    note: "Dawn chorus after the rain.",
    ceilingHz: 24_000,
    bands: [],
    sources,
    createdAt: "2024-04-05T00:00:00.000Z",
  };

  it("publishes a folder with no record yet", () => {
    expect(decideAutoWrite(null, { signature: "s", title: "t" })).toEqual({
      write: true,
      note: undefined,
    });
  });

  it("skips when nothing changed, keeping the author's note", () => {
    const decision = decideAutoWrite(existing, {
      signature: sourcesSignature(sources),
      title: existing.title,
    });
    expect(decision.write).toBe(false);
    expect(decision.note).toBe("Dawn chorus after the rain.");
  });

  it("rewrites when the source set grew — still keeping the note", () => {
    const decision = decideAutoWrite(existing, {
      signature: sourcesSignature([...sources, { audioUri: "at://x/2" }]),
      title: existing.title,
    });
    expect(decision).toEqual({ write: true, note: "Dawn chorus after the rain." });
  });

  it("rewrites when the folder was renamed (the generated title changed)", () => {
    const decision = decideAutoWrite(existing, {
      signature: sourcesSignature(sources),
      title: "Soundscape · Riverbank East · 2024-04-04",
    });
    expect(decision.write).toBe(true);
  });
});
