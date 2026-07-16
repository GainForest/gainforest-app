import { resolvePdsHost } from "../pds";
import type { AudioLabelCategory } from "./labels";

export const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
export const BIOACOUSTICS_DYNAMIC_KEY = "gainforestBioacoustics";

export type AudioSegmentBounds = {
  startTimeSeconds: number;
  endTimeSeconds: number;
  minFrequencyHz: number;
  maxFrequencyHz: number;
};

export type AudioOccurrenceSource = {
  uri: string;
  cid: string;
  recordedAt: string;
  durationSeconds: number;
  eventRef?: string;
  siteRef?: string;
  decimalLatitude?: string;
  decimalLongitude?: string;
};

export type AudioOccurrenceDraft = {
  source: AudioOccurrenceSource;
  category: AudioLabelCategory;
  bounds: AudioSegmentBounds;
  commonName?: string;
  scientificName?: string;
  note?: string;
};

export type GainForestBioacoustics = AudioSegmentBounds & {
  version: 1;
  sourceAudioUri: string;
  labelCategory: AudioLabelCategory;
};

export type AudioOccurrenceItem = {
  uri: string;
  cid: string;
  rkey: string;
  record: Record<string, unknown>;
  category: AudioLabelCategory;
  commonName: string;
  scientificName: string;
  note: string;
  bounds: AudioSegmentBounds;
  /** AT-URI of the source `ac.audio` recording this box was drawn on. */
  sourceAudioUri: string;
  createdAt: string;
};

/**
 * The name to show for a saved identification: the researcher-entered species
 * scientific name, else the common name they typed. Returns "" for an unnamed
 * broad-group box so callers can fall back to the friendly category label
 * rather than the raw broad taxon (e.g. "Aves"). Single source of truth shared
 * by the labelling tool and the identifications page.
 */
export function audioOccurrenceDisplayName(item: AudioOccurrenceItem): string {
  if (item.record.taxonRank === "species" && item.scientificName) return item.scientificName;
  return item.commonName;
}

type MutationResult = { uri: string; cid: string };

const CATEGORIES = new Set<AudioLabelCategory>(["bird", "frog", "insect", "other", "note"]);

/**
 * Vernacular labels that earlier versions synthesized from the broad group.
 * They are not real common names, so we ignore them on read: the labelling UI
 * treats the box as unnamed and drops the stale value on the next save.
 */
export const LEGACY_BROAD_VERNACULARS: Record<AudioLabelCategory, string> = {
  bird: "Bird",
  frog: "Frog",
  insect: "Insect",
  other: "Unidentified organism",
  note: "Unidentified biological sound",
};

const BROAD_TAXONOMY: Record<AudioLabelCategory, Record<string, unknown>> = {
  bird: {
    scientificName: "Aves",
    kingdom: "Animalia",
    phylum: "Chordata",
    class: "Aves",
    taxonRank: "class",
  },
  frog: {
    scientificName: "Anura",
    kingdom: "Animalia",
    phylum: "Chordata",
    class: "Amphibia",
    order: "Anura",
    taxonRank: "order",
  },
  insect: {
    scientificName: "Insecta",
    kingdom: "Animalia",
    phylum: "Arthropoda",
    class: "Insecta",
    taxonRank: "class",
  },
  other: {
    scientificName: "Biota",
  },
  note: {
    scientificName: "Biota",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function absoluteSegmentInterval(source: AudioOccurrenceSource, bounds: AudioSegmentBounds): string {
  const recordingStart = new Date(source.recordedAt);
  if (Number.isNaN(recordingStart.getTime())) {
    throw new Error("recording_time_missing");
  }
  const duration = source.durationSeconds;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("recording_duration_invalid");
  const start = Math.max(0, Math.min(duration, bounds.startTimeSeconds));
  const end = Math.max(0, Math.min(duration, bounds.endTimeSeconds));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("audio_segment_invalid");
  }
  return `${new Date(recordingStart.getTime() + start * 1000).toISOString()}/${new Date(recordingStart.getTime() + end * 1000).toISOString()}`;
}

export function parseAudioSegmentDynamicProperties(value: unknown): GainForestBioacoustics | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed[BIOACOUSTICS_DYNAMIC_KEY])) return null;
    const segment = parsed[BIOACOUSTICS_DYNAMIC_KEY];
    const category = segment.labelCategory;
    if (
      segment.version !== 1 ||
      typeof segment.sourceAudioUri !== "string" ||
      !CATEGORIES.has(category as AudioLabelCategory) ||
      !finite(segment.startTimeSeconds) ||
      !finite(segment.endTimeSeconds) ||
      !finite(segment.minFrequencyHz) ||
      !finite(segment.maxFrequencyHz)
    ) return null;
    return {
      version: 1,
      sourceAudioUri: segment.sourceAudioUri,
      labelCategory: category as AudioLabelCategory,
      startTimeSeconds: segment.startTimeSeconds,
      endTimeSeconds: segment.endTimeSeconds,
      minFrequencyHz: segment.minFrequencyHz,
      maxFrequencyHz: segment.maxFrequencyHz,
    };
  } catch {
    return null;
  }
}

function dynamicProperties(
  existing: unknown,
  source: AudioOccurrenceSource,
  category: AudioLabelCategory,
  bounds: AudioSegmentBounds,
): string {
  let parsed: Record<string, unknown> = {};
  if (typeof existing === "string" && existing.trim()) {
    try {
      const candidate = JSON.parse(existing) as unknown;
      if (isRecord(candidate)) parsed = candidate;
    } catch {
      /* Replace malformed legacy metadata with a valid object. */
    }
  }
  const previousSegment = isRecord(parsed[BIOACOUSTICS_DYNAMIC_KEY]) ? parsed[BIOACOUSTICS_DYNAMIC_KEY] : {};
  return JSON.stringify({
    ...parsed,
    [BIOACOUSTICS_DYNAMIC_KEY]: {
      ...previousSegment,
      version: 1,
      sourceAudioUri: source.uri,
      startTimeSeconds: rounded(bounds.startTimeSeconds),
      endTimeSeconds: rounded(bounds.endTimeSeconds),
      minFrequencyHz: Math.round(bounds.minFrequencyHz),
      maxFrequencyHz: Math.round(bounds.maxFrequencyHz),
      labelCategory: category,
    },
  });
}

function mergedTags(existing: unknown, category: AudioLabelCategory): string[] {
  const values = Array.isArray(existing) ? existing.filter((value): value is string => typeof value === "string") : [];
  return [...new Set([...values, "bioacoustics", category])].slice(0, 20);
}

export function buildAudioOccurrenceRecord(
  draft: AudioOccurrenceDraft,
  existing?: Record<string, unknown>,
): Record<string, unknown> {
  const fallback = BROAD_TAXONOMY[draft.category];
  const suppliedScientificName = clean(draft.scientificName);
  const suppliedCommonName = clean(draft.commonName);
  const scientificName = suppliedScientificName ?? String(fallback.scientificName);
  // Never synthesize a common name from the broad group. The grouping already
  // lives in the taxonomy fields (e.g. class: Aves), `tags`, and the
  // dynamicProperties `labelCategory`; leaving `vernacularName` blank keeps it
  // an honest "the user did not name this" rather than a fake local name.
  const vernacularName = suppliedCommonName;
  const now = new Date().toISOString();
  const base = { ...(existing ?? {}) };
  const previousSegment = parseAudioSegmentDynamicProperties(existing?.dynamicProperties);
  if (previousSegment && previousSegment.labelCategory !== draft.category) {
    for (const key of ["kingdom", "phylum", "class", "order", "family", "genus", "specificEpithet", "taxonRank"]) {
      delete base[key];
    }
  }

  const record: Record<string, unknown> = {
    ...base,
    ...fallback,
    $type: OCCURRENCE_COLLECTION,
    occurrenceID: typeof existing?.occurrenceID === "string" ? existing.occurrenceID : `urn:uuid:${crypto.randomUUID()}`,
    basisOfRecord: "HumanObservation",
    dcType: "Sound",
    scientificName,
    vernacularName,
    ...(suppliedScientificName ? { taxonRank: "species" } : {}),
    eventDate: absoluteSegmentInterval(draft.source, draft.bounds),
    occurrenceStatus: "present",
    associatedMedia: draft.source.uri,
    occurrenceRemarks: clean(draft.note),
    tags: mergedTags(existing?.tags, draft.category),
    dynamicProperties: dynamicProperties(existing?.dynamicProperties, draft.source, draft.category, draft.bounds),
    eventRef: draft.source.eventRef ?? existing?.eventRef,
    siteRef: draft.source.siteRef ?? existing?.siteRef,
    decimalLatitude: draft.source.decimalLatitude ?? existing?.decimalLatitude,
    decimalLongitude: draft.source.decimalLongitude ?? existing?.decimalLongitude,
    license: typeof existing?.license === "string" ? existing.license : "CC-BY-4.0",
    createdAt: typeof existing?.createdAt === "string" ? existing.createdAt : now,
  };

  for (const key of Object.keys(record)) {
    if (record[key] === undefined || record[key] === null || record[key] === "") delete record[key];
  }
  return record;
}

function readCommonName(value: unknown, category: AudioLabelCategory): string {
  if (typeof value !== "string") return "";
  return value.trim() === LEGACY_BROAD_VERNACULARS[category] ? "" : value;
}

export function parseAudioOccurrenceItem(
  entry: { uri?: unknown; cid?: unknown; value?: unknown },
  sourceAudioUri?: string,
): AudioOccurrenceItem | null {
  if (typeof entry.uri !== "string" || typeof entry.cid !== "string" || !isRecord(entry.value)) return null;
  const segment = parseAudioSegmentDynamicProperties(entry.value.dynamicProperties);
  if (!segment) return null;
  if (sourceAudioUri && segment.sourceAudioUri !== sourceAudioUri) return null;
  const associated = typeof entry.value.associatedMedia === "string"
    ? entry.value.associatedMedia.split("|").map((value) => value.trim())
    : [];
  if (!associated.includes(segment.sourceAudioUri)) return null;
  return {
    uri: entry.uri,
    cid: entry.cid,
    rkey: rkeyFromUri(entry.uri),
    record: entry.value,
    category: segment.labelCategory,
    commonName: readCommonName(entry.value.vernacularName, segment.labelCategory),
    scientificName: typeof entry.value.scientificName === "string" ? entry.value.scientificName : "",
    sourceAudioUri: segment.sourceAudioUri,
    note: typeof entry.value.occurrenceRemarks === "string" ? entry.value.occurrenceRemarks : "",
    bounds: {
      startTimeSeconds: segment.startTimeSeconds,
      endTimeSeconds: segment.endTimeSeconds,
      minFrequencyHz: segment.minFrequencyHz,
      maxFrequencyHz: segment.maxFrequencyHz,
    },
    createdAt: typeof entry.value.createdAt === "string" ? entry.value.createdAt : new Date(0).toISOString(),
  };
}

async function postMutation<T>(body: Record<string, unknown>, fallbackMessage: string): Promise<T> {
  const response = await fetch("/api/manage/proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!response.ok || !json || json.error) {
    throw new Error(json?.message ?? json?.error ?? fallbackMessage);
  }
  return json;
}

export async function createAudioOccurrence(draft: AudioOccurrenceDraft): Promise<AudioOccurrenceItem> {
  const record = buildAudioOccurrenceRecord(draft);
  const result = await postMutation<MutationResult>(
    { operation: "createRecord", collection: OCCURRENCE_COLLECTION, record },
    "The occurrence could not be saved.",
  );
  return parseAudioOccurrenceItem({ uri: result.uri, cid: result.cid, value: record }, draft.source.uri)!;
}

export async function updateAudioOccurrence(
  item: AudioOccurrenceItem,
  draft: AudioOccurrenceDraft,
): Promise<AudioOccurrenceItem> {
  const record = buildAudioOccurrenceRecord(draft, item.record);
  const result = await postMutation<MutationResult>(
    { operation: "putRecord", collection: OCCURRENCE_COLLECTION, rkey: item.rkey, record, swapRecord: item.cid },
    "The occurrence could not be updated.",
  );
  return parseAudioOccurrenceItem({ uri: result.uri, cid: result.cid, value: record }, draft.source.uri)!;
}

export async function deleteAudioOccurrence(item: AudioOccurrenceItem): Promise<void> {
  await postMutation<{ success?: boolean }>(
    { operation: "deleteRecord", collection: OCCURRENCE_COLLECTION, rkey: item.rkey },
    "The occurrence could not be deleted.",
  );
}

/** Page through every `dwc.occurrence` record in a repo. */
async function listOccurrenceRecords(
  did: string,
  signal?: AbortSignal,
): Promise<Array<{ uri?: unknown; cid?: unknown; value?: unknown }>> {
  const host = await resolvePdsHost(did, signal);
  if (!host) throw new Error("Could not resolve the data host for this account.");
  const records: Array<{ uri?: unknown; cid?: unknown; value?: unknown }> = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ repo: did, collection: OCCURRENCE_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      signal,
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 400 && records.length === 0) return [];
      throw new Error(`Could not load occurrences (${response.status}).`);
    }
    const data = (await response.json()) as {
      records?: Array<{ uri?: unknown; cid?: unknown; value?: unknown }>;
      cursor?: unknown;
    };
    records.push(...(data.records ?? []));
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
  } while (cursor);
  return records;
}

/** Bioacoustic occurrences drawn on one recording, ordered by start time. */
export async function listAudioOccurrences(
  did: string,
  sourceAudioUri: string,
  signal?: AbortSignal,
): Promise<AudioOccurrenceItem[]> {
  const records = await listOccurrenceRecords(did, signal);
  const items: AudioOccurrenceItem[] = [];
  for (const entry of records) {
    const parsed = parseAudioOccurrenceItem(entry, sourceAudioUri);
    if (parsed) items.push(parsed);
  }
  return items.sort((a, b) => a.bounds.startTimeSeconds - b.bounds.startTimeSeconds);
}

/** Every bioacoustic occurrence in a repo, newest first — across all recordings. */
export async function listAllAudioOccurrences(
  did: string,
  signal?: AbortSignal,
): Promise<AudioOccurrenceItem[]> {
  const records = await listOccurrenceRecords(did, signal);
  const items: AudioOccurrenceItem[] = [];
  for (const entry of records) {
    const parsed = parseAudioOccurrenceItem(entry);
    if (parsed) items.push(parsed);
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
