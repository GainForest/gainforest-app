import type {
  ManagedAudio,
  ManagedLocation,
  OccurrenceRecord,
  TimelineAttachmentItem,
  TimelineDatasetRecord,
  UploadTreeDatasetRecord,
} from "@/app/_lib/indexer";
import { greenGlobeTreePreviewHref } from "@/app/_lib/urls";
import { formatDate, formatNumber } from "../../../../../_lib/format";
import { parseAtUri } from "./atUri";
import { parseAttachmentContent } from "./attachmentContentParser";
import { getOccurrenceDatasetRef } from "./treeEvidenceClassification";

const CONTENT_TYPE_TREE_DATASET = "tree-dataset";
const CONTENT_TYPE_BIODIVERSITY = "biodiversity";
const CONTENT_TYPE_BIODIVERSITY_DATASET = "biodiversity-dataset";

export type TimelineReference = {
  id: string;
  kind: "audio" | "occurrence" | "tree" | "biodiversityDataset" | "location" | "unknown";
  title: string;
  description?: string;
  recordedAt?: string | null;
  dateRange?: string | null;
  treeGroupUri?: string | null;
  metrics?: { itemCount?: number; speciesCount?: number; treeCount?: number };
  mapHref?: string;
  actionHref?: string;
};

export type TimelineReferenceLookupInput = {
  audioUris: string[];
  occurrenceUris: string[];
  datasetUris: string[];
  locationUris: string[];
};

export type TimelineReferenceCopy = {
  linkedRecord: string;
  linkedAudioRecord: string;
  audioEvidence: string;
  linkedDataset: string;
  linkedTreeRecord: string;
  linkedSiteRecord: string;
  siteEvidence: string;
  linkedNatureData: string;
  treeCount: (count: number) => string;
  speciesCount: (count: number) => string;
  observationCount: (count: number) => string;
  individualCount: (count: number) => string;
};

type ParsedDateRange = { start: Date; end: Date };

function normalizePartialIsoDate(value: string): string {
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return value;
}

function parseDatePart(value: string | null | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new Date(normalizePartialIsoDate(trimmed));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseEvidenceDateRange(value: string | null | undefined): ParsedDateRange | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const [startRaw, endRaw] = trimmed.split("/");
  const start = parseDatePart(startRaw);
  const end = parseDatePart(endRaw ?? startRaw);
  if (!start || !end) return null;

  return start.getTime() <= end.getTime()
    ? { start, end }
    : { start: end, end: start };
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function formatDateRange(start: Date, end: Date): string {
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();
  return sameMonth ? formatMonthYear(start) : `${formatMonthYear(start)} – ${formatMonthYear(end)}`;
}

export function formatEvidenceDateRangeFromValues(values: Array<string | null | undefined>): string | null {
  const parsedRanges = values
    .map(parseEvidenceDateRange)
    .filter((range): range is ParsedDateRange => range !== null);
  if (parsedRanges.length === 0) return null;

  const first = parsedRanges.reduce((current, next) =>
    next.start.getTime() < current.start.getTime() ? next : current,
  ).start;
  const last = parsedRanges.reduce((current, next) =>
    next.end.getTime() > current.end.getTime() ? next : current,
  ).end;

  return formatDateRange(first, last);
}

function occurrenceTitle(item: OccurrenceRecord): string {
  return item.scientificName ?? item.vernacularName ?? item.remarks ?? "";
}

export function getTimelineReferenceUrisForEntry(entry: TimelineAttachmentItem): string[] {
  const uris: string[] = [];
  const seen = new Set<string>();

  function addUri(uri: string | null | undefined) {
    if (!uri?.startsWith("at://") || seen.has(uri)) return;
    seen.add(uri);
    uris.push(uri);
  }

  for (const item of parseAttachmentContent(entry.record.content)) {
    if (item.kind === "uri") addUri(item.uri);
  }

  for (const subject of entry.record.subjects?.slice(1) ?? []) {
    addUri(subject.uri);
  }

  return uris;
}

function unique(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter((value) => value.length > 0)));
}

export function collectTimelineReferenceLookupInput(
  entries: readonly TimelineAttachmentItem[],
): TimelineReferenceLookupInput {
  const audioUris: string[] = [];
  const occurrenceUris: string[] = [];
  const datasetUris: string[] = [];
  const locationUris: string[] = [];

  for (const entry of entries) {
    for (const uri of getTimelineReferenceUrisForEntry(entry)) {
      const parsed = parseAtUri(uri);
      if (!parsed) continue;

      if (parsed.collection === "app.gainforest.ac.audio") audioUris.push(uri);
      if (parsed.collection === "app.gainforest.dwc.occurrence") occurrenceUris.push(uri);
      if (parsed.collection === "app.gainforest.dwc.dataset") datasetUris.push(uri);
      if (parsed.collection === "app.certified.location") locationUris.push(uri);
    }
  }

  return {
    audioUris: unique(audioUris),
    occurrenceUris: unique(occurrenceUris),
    datasetUris: unique(datasetUris),
    locationUris: unique(locationUris),
  };
}

export function getDatasetEvidencePurposes(entries: TimelineAttachmentItem[]): Map<string, "tree" | "biodiversity"> {
  const purposes = new Map<string, "tree" | "biodiversity">();
  for (const entry of entries) {
    const normalized = entry.record.contentType?.trim().toLowerCase();
    const purpose = normalized === CONTENT_TYPE_TREE_DATASET
      ? "tree"
      : normalized === CONTENT_TYPE_BIODIVERSITY || normalized === CONTENT_TYPE_BIODIVERSITY_DATASET
        ? "biodiversity"
        : null;
    if (!purpose) continue;

    for (const item of parseAttachmentContent(entry.record.content)) {
      if (item.kind !== "uri" || parseAtUri(item.uri)?.collection !== "app.gainforest.dwc.dataset") continue;
      if (purpose === "tree" || !purposes.has(item.uri)) purposes.set(item.uri, purpose);
    }
  }
  return purposes;
}

export function getTreeGroupStats(
  treeGroupUri: string,
  occurrences: OccurrenceRecord[],
): { itemCount: number; speciesCount: number; dateRange: string | null } {
  const items = occurrences.filter((item) => getOccurrenceDatasetRef(item) === treeGroupUri);
  const species = new Set(
    items
      .map((item) => occurrenceTitle(item).trim().toLowerCase())
      .filter(Boolean),
  );
  return {
    itemCount: items.length,
    speciesCount: species.size,
    dateRange: formatEvidenceDateRangeFromValues(items.map((item) => item.eventDate ?? item.createdAt)),
  };
}

function greenGlobeTreePreview(did: string, treeGroupUri: string): string {
  return greenGlobeTreePreviewHref(did, { datasetRef: treeGroupUri });
}

function polygonsViewHref(locationUri: string): string {
  return `https://polygons-gainforest.vercel.app/view?${new URLSearchParams({ certifiedLocationRecordUri: locationUri }).toString()}`;
}

export function buildTimelineReferences(args: {
  entries: TimelineAttachmentItem[];
  audio: ManagedAudio[];
  occurrences: OccurrenceRecord[];
  treeGroups: Array<UploadTreeDatasetRecord | TimelineDatasetRecord>;
  places: ManagedLocation[];
  copy: TimelineReferenceCopy;
}): TimelineReference[] {
  const audioByUri = new Map(args.audio.map((item) => [item.metadata.uri, item]));
  const occurrenceByUri = new Map(args.occurrences.map((item) => [item.atUri, item]));
  const treeByUri = new Map(args.treeGroups.map((item) => {
    if ("record" in item) {
      return [item.metadata.uri, {
        uri: item.metadata.uri,
        name: item.record.name,
        description: item.record.description,
        recordCount: item.record.recordCount,
        createdAt: item.record.createdAt,
      }] as const;
    }
    return [item.uri, item] as const;
  }));
  const placeByUri = new Map(args.places.map((item) => [item.metadata.uri, item]));
  const datasetPurposes = getDatasetEvidencePurposes(args.entries);
  const uris = new Set<string>();

  for (const entry of args.entries) {
    for (const uri of getTimelineReferenceUrisForEntry(entry)) uris.add(uri);
  }

  return Array.from(uris).map((uri) => {
    const parsed = parseAtUri(uri);

    if (parsed?.collection === "app.gainforest.ac.audio") {
      const item = audioByUri.get(uri);
      return {
        id: uri,
        kind: "audio",
        title: item?.record.name ?? args.copy.linkedAudioRecord,
        description: formatDate(item?.record.recordedAt ?? item?.metadata.createdAt) || args.copy.audioEvidence,
        recordedAt: item?.record.recordedAt ?? item?.metadata.createdAt ?? null,
        actionHref: item?.record.audioUrl ?? undefined,
      } satisfies TimelineReference;
    }

    if (parsed?.collection === "app.gainforest.dwc.dataset") {
      const item = treeByUri.get(uri);
      const stats = getTreeGroupStats(uri, args.occurrences);
      const purpose = datasetPurposes.get(uri) ?? "tree";
      const title = item?.name ?? (purpose === "biodiversity" ? args.copy.linkedNatureData : args.copy.linkedDataset);
      const count = Math.max(stats.itemCount, item?.recordCount ?? 0);

      if (purpose === "biodiversity") {
        return {
          id: uri,
          kind: "biodiversityDataset",
          title,
          description: [
            args.copy.observationCount(count),
            stats.speciesCount > 0 ? args.copy.speciesCount(stats.speciesCount) : null,
          ].filter(Boolean).join(" · "),
          recordedAt: item?.createdAt ?? null,
          dateRange: stats.dateRange,
          treeGroupUri: uri,
          metrics: { itemCount: count, speciesCount: stats.speciesCount },
        } satisfies TimelineReference;
      }

      return {
        id: uri,
        kind: "tree",
        title,
        description: [
          args.copy.treeCount(count),
          stats.speciesCount > 0 ? args.copy.speciesCount(stats.speciesCount) : null,
        ].filter(Boolean).join(" · "),
        recordedAt: item?.createdAt ?? null,
        dateRange: stats.dateRange,
        treeGroupUri: uri,
        metrics: { itemCount: count, treeCount: count, speciesCount: stats.speciesCount },
        mapHref: greenGlobeTreePreview(parsed.did, uri),
        actionHref: greenGlobeTreePreview(parsed.did, uri),
      } satisfies TimelineReference;
    }

    if (parsed?.collection === "app.gainforest.dwc.occurrence") {
      const item = occurrenceByUri.get(uri);
      return {
        id: uri,
        kind: "occurrence",
        title: item ? occurrenceTitle(item) || args.copy.linkedTreeRecord : args.copy.linkedTreeRecord,
        description: [
          item?.individualCount ? args.copy.individualCount(item.individualCount) : null,
          formatDate(item?.eventDate ?? item?.createdAt),
        ].filter(Boolean).join(" · "),
        recordedAt: item?.eventDate ?? item?.createdAt ?? null,
        treeGroupUri: item?.datasetRef ?? null,
      } satisfies TimelineReference;
    }

    if (parsed?.collection === "app.certified.location") {
      const item = placeByUri.get(uri);
      return {
        id: uri,
        kind: "location",
        title: item?.record.name ?? args.copy.linkedSiteRecord,
        description: item?.record.locationType ?? args.copy.siteEvidence,
        actionHref: polygonsViewHref(uri),
      } satisfies TimelineReference;
    }

    return { id: uri, kind: "unknown", title: args.copy.linkedRecord } satisfies TimelineReference;
  });
}
