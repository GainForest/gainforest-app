import { describe, expect, it } from "vitest";
import {
  buildSoundscapeRecord,
  capSourceRecordings,
  extractSoundscapeLink,
  formatSoundscapeDateRange,
  MAX_SOUNDSCAPE_RECORDINGS,
  parseSoundscapeHref,
  parseSoundscapeRecord,
  soundscapeDates,
  soundscapeHref,
  soundscapePoints,
  sourceForMinute,
  SOUNDSCAPE_COLLECTION,
  type SoundscapeSource,
} from "./record";

function source(overrides: Partial<SoundscapeSource> & { minuteOfDay: number }): SoundscapeSource {
  return {
    audioUri: `at://did:plc:alice/app.gainforest.ac.audio/${overrides.minuteOfDay}`,
    name: `rec-${overrides.minuteOfDay}.wav`,
    date: "2026-03-14",
    pmn: [1, 2, 3, 4, 5],
    ...overrides,
  };
}

describe("capSourceRecordings", () => {
  it("sorts a small list chronologically and keeps every recording", () => {
    const capped = capSourceRecordings([source({ minuteOfDay: 600 }), source({ minuteOfDay: 60 })]);
    expect(capped.map((entry) => entry.minuteOfDay)).toEqual([60, 600]);
  });

  it("orders same-minute recordings by date", () => {
    const capped = capSourceRecordings([
      source({ minuteOfDay: 300, date: "2026-03-16", audioUri: "at://b" }),
      source({ minuteOfDay: 300, date: "2026-03-14", audioUri: "at://a" }),
    ]);
    expect(capped.map((entry) => entry.date)).toEqual(["2026-03-14", "2026-03-16"]);
  });

  it("keeps the loudest recording of each minute when over the cap", () => {
    const loud = source({ minuteOfDay: 5, audioUri: "at://loud", pmn: [900, 0, 0, 0, 0] });
    const quiet = source({ minuteOfDay: 5, audioUri: "at://quiet", pmn: [1, 0, 0, 0, 0] });
    const capped = capSourceRecordings([quiet, loud, source({ minuteOfDay: 9 })], 2);
    expect(capped.map((entry) => entry.audioUri)).toContain("at://loud");
    expect(capped.map((entry) => entry.audioUri)).not.toContain("at://quiet");
  });

  it("drops the quietest minutes once even one-per-minute exceeds the cap", () => {
    const sources = [
      source({ minuteOfDay: 1, audioUri: "at://a", pmn: [10, 0, 0, 0, 0] }),
      source({ minuteOfDay: 2, audioUri: "at://b", pmn: [20, 0, 0, 0, 0] }),
      source({ minuteOfDay: 3, audioUri: "at://c", pmn: [30, 0, 0, 0, 0] }),
    ];
    const capped = capSourceRecordings(sources, 2);
    expect(capped.map((entry) => entry.audioUri)).toEqual(["at://b", "at://c"]);
  });

  it("never returns more than the cap", () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      source({ minuteOfDay: index, audioUri: `at://x${index}` }),
    );
    expect(capSourceRecordings(many, 10)).toHaveLength(10);
  });
});

describe("soundscapeDates / formatSoundscapeDateRange", () => {
  it("lists distinct dates, earliest first", () => {
    const dates = soundscapeDates([
      source({ minuteOfDay: 1, date: "2026-03-16" }),
      source({ minuteOfDay: 2, date: "2026-03-14" }),
      source({ minuteOfDay: 3, date: "2026-03-16" }),
    ]);
    expect(dates).toEqual(["2026-03-14", "2026-03-16"]);
  });

  it("formats one day as itself and several as a range", () => {
    expect(formatSoundscapeDateRange([source({ minuteOfDay: 1 })])).toBe("2026-03-14");
    expect(
      formatSoundscapeDateRange([
        source({ minuteOfDay: 1, date: "2026-03-14" }),
        source({ minuteOfDay: 2, date: "2026-03-16" }),
      ]),
    ).toBe("2026-03-14 \u2013 2026-03-16");
  });

  it("has no range to show without sources", () => {
    expect(formatSoundscapeDateRange([])).toBe("");
  });
});

describe("buildSoundscapeRecord", () => {
  const draft = {
    title: "Dawn chorus",
    note: "  Three nights at the ridge  ",
    ceilingHz: 24_000,
    sources: [source({ minuteOfDay: 330, pmn: [1.4, 2.6, 3, 4, 5] })],
  };

  it("writes the collection, dates and rounded band values", () => {
    const record = buildSoundscapeRecord(draft, "2026-03-20T10:00:00.000Z");
    expect(record.$type).toBe(SOUNDSCAPE_COLLECTION);
    expect(record.dates).toEqual(["2026-03-14"]);
    expect(record.createdAt).toBe("2026-03-20T10:00:00.000Z");
    expect((record.recordings as Array<{ pmn: number[] }>)[0].pmn).toEqual([1, 3, 3, 4, 5]);
  });

  it("trims the note and drops an empty one", () => {
    expect(buildSoundscapeRecord(draft).note).toBe("Three nights at the ridge");
    expect(buildSoundscapeRecord({ ...draft, note: "   " }).note).toBeUndefined();
  });

  it("freezes the band edges into the record", () => {
    const bands = buildSoundscapeRecord(draft).bands as Array<{ id: string; maxHz: number | null }>;
    expect(bands).toHaveLength(5);
    expect(bands[0].id).toBe("rumble");
    expect(bands[4].maxHz).toBeNull();
  });

  it("caps a huge library", () => {
    const many = Array.from({ length: MAX_SOUNDSCAPE_RECORDINGS + 50 }, (_, index) =>
      source({ minuteOfDay: index % 1440, audioUri: `at://x${index}` }),
    );
    const record = buildSoundscapeRecord({ ...draft, sources: many });
    expect((record.recordings as unknown[]).length).toBeLessThanOrEqual(MAX_SOUNDSCAPE_RECORDINGS);
  });
});

describe("parseSoundscapeRecord", () => {
  it("round-trips a record it built", () => {
    const record = buildSoundscapeRecord({
      title: "Dawn chorus",
      ceilingHz: 24_000,
      sources: [source({ minuteOfDay: 330 })],
    });
    const parsed = parseSoundscapeRecord(record);
    expect(parsed?.title).toBe("Dawn chorus");
    expect(parsed?.sources[0].minuteOfDay).toBe(330);
    expect(parsed?.sources[0].audioUri).toBe("at://did:plc:alice/app.gainforest.ac.audio/330");
  });

  it("rejects anything without usable recordings", () => {
    expect(parseSoundscapeRecord(null)).toBeNull();
    expect(parseSoundscapeRecord({ title: "x", recordings: [] })).toBeNull();
    expect(parseSoundscapeRecord({ recordings: [{ audio: "at://a" }] })).toBeNull();
  });

  it("skips malformed entries but keeps the good ones", () => {
    const parsed = parseSoundscapeRecord({
      title: "Mixed",
      recordings: [
        { audio: "at://a", date: "2026-03-14", minuteOfDay: 10, pmn: [1, 1, 1, 1, 1] },
        { audio: "at://b", date: "2026-03-14", minuteOfDay: 5000, pmn: [1, 1, 1, 1, 1] },
        "nonsense",
      ],
    });
    expect(parsed?.sources).toHaveLength(1);
  });

  it("pads short band vectors with silence", () => {
    const parsed = parseSoundscapeRecord({
      title: "Short",
      recordings: [{ audio: "at://a", date: "2026-03-14", minuteOfDay: 10, pmn: [7] }],
    });
    expect(parsed?.sources[0].pmn).toEqual([7, 0, 0, 0, 0]);
  });
});

describe("soundscapePoints / sourceForMinute", () => {
  const sources = [
    source({ minuteOfDay: 10, audioUri: "at://quiet", pmn: [1, 1, 1, 1, 1] }),
    source({ minuteOfDay: 10, audioUri: "at://loud", pmn: [9, 0, 0, 0, 0] }),
    source({ minuteOfDay: 20, audioUri: "at://later", pmn: [2, 2, 2, 2, 2] }),
  ];

  it("keeps the loudest value per band for a shared minute", () => {
    const points = soundscapePoints(sources);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ minuteOfDay: 10, pmn: [9, 1, 1, 1, 1] });
  });

  it("plays the loudest recording of the clicked minute", () => {
    expect(sourceForMinute(sources, 10)?.audioUri).toBe("at://loud");
    expect(sourceForMinute(sources, 999)).toBeNull();
  });
});

describe("soundscapeHref / parseSoundscapeHref", () => {
  it("round-trips a permalink", () => {
    const href = soundscapeHref("did:plc:alice", "3kabc");
    expect(href).toBe("/soundscape/did%3Aplc%3Aalice/3kabc");
    expect(parseSoundscapeHref(href)).toEqual({ did: "did:plc:alice", rkey: "3kabc" });
  });

  it("reads absolute links on any host", () => {
    expect(parseSoundscapeHref("https://www.gainforest.app/soundscape/did:plc:alice/3kabc")).toEqual({
      did: "did:plc:alice",
      rkey: "3kabc",
    });
    expect(parseSoundscapeHref("https://staging.example/soundscape/did:plc:alice/3kabc/")).toEqual({
      did: "did:plc:alice",
      rkey: "3kabc",
    });
  });

  it("finds the shared soundscape in a post and takes the link out of the text", () => {
    const found = extractSoundscapeLink(
      "Three nights at the ridge.\nhttps://www.gainforest.app/soundscape/did:plc:alice/3kabc",
    );
    expect(found).toEqual({
      did: "did:plc:alice",
      rkey: "3kabc",
      link: "https://www.gainforest.app/soundscape/did:plc:alice/3kabc",
      text: "Three nights at the ridge.",
    });
  });

  it("reads a link in the middle of a post", () => {
    const found = extractSoundscapeLink("listen /soundscape/did:plc:bob/xyz please");
    expect(found?.rkey).toBe("xyz");
    expect(found?.text).toBe("listen  please");
  });

  it("leaves ordinary posts alone", () => {
    expect(extractSoundscapeLink("just a post about frogs")).toBeNull();
    expect(extractSoundscapeLink("")).toBeNull();
    expect(extractSoundscapeLink(null)).toBeNull();
  });

  it("ignores links that aren't a soundscape", () => {
    expect(parseSoundscapeHref("https://www.gainforest.app/feed")).toBeNull();
    expect(parseSoundscapeHref("/soundscape")).toBeNull();
    expect(parseSoundscapeHref("/soundscape/notadid/3kabc")).toBeNull();
    expect(parseSoundscapeHref("nonsense")).toBeNull();
  });
});
