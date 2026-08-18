import type { OccurrenceRecord, UploadTreeDatasetRecord } from "@/app/_lib/indexer";
import { formatEvidenceDateRangeFromValues } from "../timelineReferences";

export type NatureDatasetGroup = {
  uri: string;
  name: string;
  description: string | null;
  recordCount: number;
  records: OccurrenceRecord[];
  speciesCount: number;
  dateRange: string | null;
  recordedByValues: string[];
  detailsSearchText: string;
};

export function occurrenceTitle(item: OccurrenceRecord, fallback: string): string {
  return item.scientificName ?? item.vernacularName ?? item.remarks ?? fallback;
}

export function getSafeRecorderDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (/^(\/\/|www\.)/i.test(trimmed)) return null;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return null;
  if (!trimmed.includes(" ") && /^@?[a-z0-9._-]+\.[a-z]{2,}$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function formatRecorderSummary(
  values: string[],
  options: {
    fallback: string;
    multiple: (count: number) => string;
    firstAndMore: (name: string, count: number) => string;
  },
): string | null {
  if (values.length === 0) return null;
  const displayValues = values
    .map(getSafeRecorderDisplayName)
    .filter((value): value is string => Boolean(value));
  if (displayValues.length === 0) {
    return values.length === 1 ? options.fallback : options.multiple(values.length);
  }
  if (values.length === 1) return displayValues[0] ?? options.fallback;
  return options.firstAndMore(displayValues[0] ?? options.fallback, values.length - 1);
}

export function uniqueRecordedByValues(items: OccurrenceRecord[]): string[] {
  const values = new Map<string, string>();
  for (const item of items) {
    const recordedBy = item.recordedBy?.trim();
    if (!recordedBy) continue;
    const key = recordedBy.toLowerCase();
    if (!values.has(key)) values.set(key, recordedBy);
  }
  return Array.from(values.values()).sort((left, right) => left.localeCompare(right));
}

export function matchesRecordedBy(item: OccurrenceRecord, recordedBy: string): boolean {
  if (!recordedBy) return true;
  return item.recordedBy?.trim().toLowerCase() === recordedBy.toLowerCase();
}

export function occurrenceSearchText(
  item: OccurrenceRecord,
  datasetName: string | null | undefined,
  fallbackTitle: string,
): string {
  return [
    occurrenceTitle(item, fallbackTitle),
    item.kingdom,
    item.family,
    item.genus,
    item.locality,
    item.country,
    item.recordedBy ? getSafeRecorderDisplayName(item.recordedBy) : null,
    item.eventDate,
    datasetName ?? item.datasetName,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

export function buildNatureDatasetGroups(
  datasets: UploadTreeDatasetRecord[],
  occurrences: OccurrenceRecord[],
  fallbackGroupName: string,
  fallbackObservationName: string,
): NatureDatasetGroup[] {
  const datasetLookup = new Map(datasets.map((dataset) => [dataset.uri, dataset]));
  const recordsByDataset = new Map<string, OccurrenceRecord[]>();

  for (const occurrence of occurrences) {
    if (!occurrence.datasetRef) continue;
    const existing = recordsByDataset.get(occurrence.datasetRef) ?? [];
    existing.push(occurrence);
    recordsByDataset.set(occurrence.datasetRef, existing);
  }

  const datasetUris = new Set<string>([
    ...datasets.map((dataset) => dataset.uri),
    ...recordsByDataset.keys(),
  ]);

  return Array.from(datasetUris)
    .map((uri) => {
      const records = recordsByDataset.get(uri) ?? [];
      const dataset = datasetLookup.get(uri);
      const species = new Set(
        records
          .map((item) => occurrenceTitle(item, fallbackObservationName).trim().toLowerCase())
          .filter(Boolean),
      );
      const recordedByValues = uniqueRecordedByValues(records);
      const name =
        dataset?.name ??
        records.find((item) => item.datasetName)?.datasetName ??
        fallbackGroupName;
      const description = dataset?.description ?? null;
      const dateRange = formatEvidenceDateRangeFromValues(
        records.map((item) => item.eventDate ?? item.createdAt),
      );
      const searchableRecordedByValues = recordedByValues
        .map(getSafeRecorderDisplayName)
        .filter((value): value is string => Boolean(value));
      const detailsSearchText = [
        name,
        description,
        dateRange,
        dataset?.createdAt,
        searchableRecordedByValues.join(" "),
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" ")
        .toLowerCase();

      return {
        uri,
        name,
        description,
        recordCount: Math.max(records.length, dataset?.recordCount ?? 0),
        records,
        speciesCount: species.size,
        dateRange,
        recordedByValues,
        detailsSearchText,
      };
    })
    .sort(
      (left, right) =>
        right.recordCount - left.recordCount || left.name.localeCompare(right.name),
    );
}
