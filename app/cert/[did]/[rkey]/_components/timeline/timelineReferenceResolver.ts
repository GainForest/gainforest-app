import {
  fetchOccurrencesByDatasetRefs,
  fetchRecordByUri,
  fetchTimelineDatasetByUri,
  fetchTimelineLocationByUri,
  type ManagedAudio,
  type ManagedLocation,
  type OccurrenceRecord,
  type TimelineAttachmentItem,
  type TimelineDatasetRecord,
} from "@/app/_lib/indexer";
import { parseAtUri } from "./atUri";
import {
  buildTimelineReferences,
  collectTimelineReferenceLookupInput,
  type TimelineReference,
  type TimelineReferenceCopy,
} from "./timelineReferences";

function unique(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter((value) => value.length > 0)));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function bestEffort<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

function isOccurrenceRecord(record: Awaited<ReturnType<typeof fetchRecordByUri>>): record is OccurrenceRecord {
  return record?.kind === "occurrence";
}

function managedAudioFromRecord(record: OccurrenceRecord, uri: string): ManagedAudio {
  return {
    metadata: {
      did: record.did,
      uri,
      rkey: record.rkey,
      cid: record.cid ?? "",
      createdAt: record.createdAt ?? null,
    },
    record: {
      name: record.scientificName ?? record.vernacularName,
      description: record.remarks,
      audioUrl: record.audioUrl,
      mimeType: null,
      recordedAt: record.eventDate,
      sampleRate: null,
      duration: null,
    },
  };
}

async function resolveAudioUris(uris: string[], signal?: AbortSignal): Promise<ManagedAudio[]> {
  const records = await Promise.all(
    uris.map(async (uri) => {
      const record = await bestEffort(fetchRecordByUri(uri, signal));
      return isOccurrenceRecord(record) ? managedAudioFromRecord(record, uri) : null;
    }),
  );
  return records.filter((record): record is ManagedAudio => record !== null);
}

async function resolveOccurrenceUris(uris: string[], signal?: AbortSignal): Promise<OccurrenceRecord[]> {
  const records = await Promise.all(
    uris.map(async (uri) => {
      const record = await bestEffort(fetchRecordByUri(uri, signal));
      return isOccurrenceRecord(record) ? record : null;
    }),
  );
  return records.filter((record): record is OccurrenceRecord => record !== null);
}

async function resolveDatasetUris(uris: string[], signal?: AbortSignal): Promise<TimelineDatasetRecord[]> {
  const records = await Promise.all(
    uris.map((uri) => bestEffort(fetchTimelineDatasetByUri(uri, signal))),
  );
  return records.filter((record): record is TimelineDatasetRecord => record !== null);
}

async function resolveLocationUris(uris: string[], signal?: AbortSignal): Promise<ManagedLocation[]> {
  const records = await Promise.all(
    uris.map((uri) => bestEffort(fetchTimelineLocationByUri(uri, signal))),
  );
  return records.filter((record): record is ManagedLocation => record !== null);
}

async function resolveDatasetOccurrences(datasetUris: string[], signal?: AbortSignal): Promise<OccurrenceRecord[]> {
  const groupedByDid = new Map<string, string[]>();

  for (const uri of datasetUris) {
    const parsed = parseAtUri(uri);
    if (!parsed) continue;
    groupedByDid.set(parsed.did, [...(groupedByDid.get(parsed.did) ?? []), uri]);
  }

  const grouped = await Promise.all(
    Array.from(groupedByDid.entries()).map(([did, refs]) =>
      bestEffort(fetchOccurrencesByDatasetRefs(did, unique(refs), signal)),
    ),
  );

  const byUri = new Map<string, OccurrenceRecord>();
  for (const records of grouped) {
    for (const record of records ?? []) byUri.set(record.atUri, record);
  }
  return Array.from(byUri.values());
}

export async function resolveTimelineReferences(args: {
  entries: TimelineAttachmentItem[];
  copy: TimelineReferenceCopy;
  signal?: AbortSignal;
}): Promise<TimelineReference[]> {
  const lookupInput = collectTimelineReferenceLookupInput(args.entries);

  const [audio, directOccurrences, datasets, locations, datasetOccurrences] = await Promise.all([
    resolveAudioUris(lookupInput.audioUris, args.signal),
    resolveOccurrenceUris(lookupInput.occurrenceUris, args.signal),
    resolveDatasetUris(lookupInput.datasetUris, args.signal),
    resolveLocationUris(lookupInput.locationUris, args.signal),
    resolveDatasetOccurrences(lookupInput.datasetUris, args.signal),
  ]);

  const occurrencesByUri = new Map<string, OccurrenceRecord>();
  for (const record of [...datasetOccurrences, ...directOccurrences]) {
    occurrencesByUri.set(record.atUri, record);
  }

  return buildTimelineReferences({
    entries: args.entries,
    audio,
    occurrences: Array.from(occurrencesByUri.values()),
    treeGroups: datasets,
    places: locations,
    copy: args.copy,
  });
}
