import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAudioOccurrenceRecord,
  createAudioOccurrence,
  deleteAudioOccurrence,
  listAllAudioOccurrences,
  parseAudioOccurrenceItem,
  parseAudioSegmentDynamicProperties,
  type AudioOccurrenceDraft,
} from "./occurrences";

const source = {
  uri: "at://did:plc:test/app.gainforest.ac.audio/audio-1",
  cid: "bafy-audio",
  recordedAt: "2024-04-07T01:00:00.000Z",
  durationSeconds: 60,
  eventRef: "at://did:plc:test/app.gainforest.dwc.event/event-1",
};

const draft: AudioOccurrenceDraft = {
  source,
  category: "frog",
  commonName: "Tree frog",
  note: "Three clear calls",
  bounds: {
    startTimeSeconds: 11.3,
    endTimeSeconds: 30.4,
    minFrequencyHz: 6200,
    maxFrequencyHz: 15000,
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("AudioMoth Darwin Core occurrences", () => {
  it("maps a spectrogram box to a linked occurrence", () => {
    const record = buildAudioOccurrenceRecord(draft);
    expect(record).toMatchObject({
      $type: "app.gainforest.dwc.occurrence",
      basisOfRecord: "HumanObservation",
      dcType: "Sound",
      scientificName: "Anura",
      vernacularName: "Tree frog",
      kingdom: "Animalia",
      class: "Amphibia",
      order: "Anura",
      taxonRank: "order",
      eventDate: "2024-04-07T01:00:11.300Z/2024-04-07T01:00:30.400Z",
      occurrenceStatus: "present",
      associatedMedia: source.uri,
      occurrenceRemarks: "Three clear calls",
      eventRef: source.eventRef,
    });
    expect(record.occurrenceID).toMatch(/^urn:uuid:/);
    expect(record.tags).toEqual(["bioacoustics", "frog"]);
    expect(parseAudioSegmentDynamicProperties(record.dynamicProperties)).toEqual({
      version: 1,
      sourceAudioUri: source.uri,
      labelCategory: "frog",
      ...draft.bounds,
    });
  });

  it.each([
    ["bird", { scientificName: "Aves", class: "Aves", taxonRank: "class" }],
    ["frog", { scientificName: "Anura", class: "Amphibia", order: "Anura", taxonRank: "order" }],
    ["insect", { scientificName: "Insecta", class: "Insecta", taxonRank: "class" }],
    ["note", { scientificName: "Biota" }],
  ] as const)("uses the honest broad fallback for %s", (category, expected) => {
    expect(buildAudioOccurrenceRecord({ ...draft, category, commonName: undefined })).toMatchObject(expected);
  });

  it("never synthesizes a vernacularName from the broad group", () => {
    const record = buildAudioOccurrenceRecord({ ...draft, category: "bird", commonName: undefined });
    expect(record.vernacularName).toBeUndefined();
    // The grouping still lives in taxonomy + tags + labelCategory.
    expect(record).toMatchObject({ scientificName: "Aves", class: "Aves", taxonRank: "class" });
    expect(record.tags).toEqual(["bioacoustics", "bird"]);
  });

  it("drops a stale broad-group vernacularName when re-saving without a common name", () => {
    const existing = buildAudioOccurrenceRecord({ ...draft, category: "bird", commonName: "Bird" });
    expect(existing.vernacularName).toBe("Bird");
    const resaved = buildAudioOccurrenceRecord({ ...draft, category: "bird", commonName: undefined }, existing);
    expect(resaved.vernacularName).toBeUndefined();
  });

  it("uses a supplied scientific name while retaining broad taxonomy", () => {
    expect(buildAudioOccurrenceRecord({ ...draft, scientificName: "Boana faber" })).toMatchObject({
      scientificName: "Boana faber",
      vernacularName: "Tree frog",
      kingdom: "Animalia",
      class: "Amphibia",
      order: "Anura",
      taxonRank: "species",
    });
  });

  it("blocks publishing without a valid recording timestamp", () => {
    expect(() => buildAudioOccurrenceRecord({ ...draft, source: { ...source, recordedAt: "unknown" } })).toThrow(
      "recording_time_missing",
    );
  });

  it("preserves unrelated fields and unknown dynamic properties on edit", () => {
    const existing = {
      $type: "app.gainforest.dwc.occurrence",
      occurrenceID: "existing-id",
      createdAt: "2025-01-01T00:00:00.000Z",
      habitat: "Cloud forest",
      tags: ["reviewed"],
      dynamicProperties: JSON.stringify({
        externalKey: "keep-me",
        gainforestBioacoustics: { legacyKey: "keep-this-too" },
      }),
    };
    const record = buildAudioOccurrenceRecord(draft, existing);
    expect(record).toMatchObject({ occurrenceID: "existing-id", habitat: "Cloud forest", tags: ["reviewed", "bioacoustics", "frog"] });
    expect(JSON.parse(String(record.dynamicProperties))).toMatchObject({
      externalKey: "keep-me",
      gainforestBioacoustics: { legacyKey: "keep-this-too", sourceAudioUri: source.uri },
    });
  });

  it("ignores a stale broad-group vernacular when reading a legacy record", () => {
    const record = buildAudioOccurrenceRecord({ ...draft, category: "bird", commonName: undefined });
    // Simulate a record saved by an older build that wrote vernacularName "Bird".
    const legacy = { ...record, vernacularName: "Bird", scientificName: "Phylloscopus ibericus", taxonRank: "species" };
    const item = parseAudioOccurrenceItem({ uri: "at://did:plc:test/app.gainforest.dwc.occurrence/legacy", cid: "bafy", value: legacy }, source.uri);
    expect(item?.commonName).toBe("");
    expect(item?.scientificName).toBe("Phylloscopus ibericus");
  });

  it("keeps a real common name that happens to differ from the broad label", () => {
    const record = buildAudioOccurrenceRecord({ ...draft, category: "bird", commonName: "European Robin" });
    const item = parseAudioOccurrenceItem({ uri: "at://did:plc:test/app.gainforest.dwc.occurrence/robin", cid: "bafy", value: record }, source.uri);
    expect(item?.commonName).toBe("European Robin");
  });

  it("parses only occurrences linked to the exact source audio", () => {
    const record = buildAudioOccurrenceRecord(draft);
    const item = parseAudioOccurrenceItem({ uri: "at://did:plc:test/app.gainforest.dwc.occurrence/one", cid: "bafy-occ", value: record }, source.uri);
    expect(item?.bounds).toEqual(draft.bounds);
    expect(item?.commonName).toBe("Tree frog");
    expect(parseAudioOccurrenceItem({ uri: "at://did:plc:test/app.gainforest.dwc.occurrence/one", cid: "bafy-occ", value: record }, `${source.uri}-other`)).toBeNull();
  });

  it("lists bioacoustic identifications across recordings and pages", async () => {
    const older = buildAudioOccurrenceRecord({
      ...draft,
      source: { ...source, uri: "at://did:web:test/app.gainforest.ac.audio/older" },
    });
    older.createdAt = "2026-01-01T00:00:00.000Z";
    const newer = buildAudioOccurrenceRecord({
      ...draft,
      source: { ...source, uri: "at://did:web:test/app.gainforest.ac.audio/newer" },
      scientificName: "Boana faber",
    });
    newer.createdAt = "2026-02-01T00:00:00.000Z";

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const cursor = url.searchParams.get("cursor");
      return Promise.resolve(new Response(JSON.stringify(cursor
        ? { records: [{ uri: "at://did:web:test/app.gainforest.dwc.occurrence/newer", cid: "newer", value: newer }] }
        : { records: [{ uri: "at://did:web:test/app.gainforest.dwc.occurrence/older", cid: "older", value: older }], cursor: "next" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await listAllAudioOccurrences("did:web:test");
    expect(items.map((item) => item.rkey)).toEqual(["newer", "older"]);
    expect(items.map((item) => item.sourceAudioUri)).toEqual([
      "at://did:web:test/app.gainforest.ac.audio/newer",
      "at://did:web:test/app.gainforest.ac.audio/older",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates one ATProto occurrence record for a confirmed box", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      uri: "at://did:plc:test/app.gainforest.dwc.occurrence/created",
      cid: "bafy-created",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const saved = await createAudioOccurrence(draft);
    expect(saved.uri).toContain("/app.gainforest.dwc.occurrence/");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.operation).toBe("createRecord");
    expect(request.collection).toBe("app.gainforest.dwc.occurrence");
    expect(request.record.associatedMedia).toBe(source.uri);
  });

  it("deletes only the selected occurrence rkey", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const record = buildAudioOccurrenceRecord(draft);
    const item = parseAudioOccurrenceItem({ uri: "at://did:plc:test/app.gainforest.dwc.occurrence/delete-me", cid: "bafy-occ", value: record }, source.uri)!;

    await deleteAudioOccurrence(item);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toEqual({ operation: "deleteRecord", collection: "app.gainforest.dwc.occurrence", rkey: "delete-me" });
  });
});
