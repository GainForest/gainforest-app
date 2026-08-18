import { isResponse, resolveManageApiTarget } from "../../_lib/target";
import { parseAtUri, resolvePdsHost } from "@/app/_lib/pds";

export const runtime = "nodejs";

const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
const DATASET_COLLECTION = "app.gainforest.dwc.dataset";
const COLLECTION_COLLECTION = "org.hypercerts.collection";

type ListedRecord = { uri?: string; value?: Record<string, unknown> };
type ListedRecordsResponse = { records?: ListedRecord[]; cursor?: string };

type DatasetRecord = {
  uri: string;
  rkey: string;
  name: string;
  description: string | null;
  recordCount: number | null;
  createdAt: string | null;
};

export type ObservationDatasetGroup = {
  datasetUri: string;
  datasetRkey: string;
  name: string;
  description: string | null;
  count: number;
  createdAt: string | null;
  uris: string[];
  /** rkeys of collections (e.g. projects) that reference this dataset in
   *  items[], so deleting the dataset can also remove the dangling reference. */
  parentRkeys: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function datasetRefOf(value: Record<string, unknown> | undefined): string | null {
  if (!value) return null;
  // The dataset link is written as a plain AT-URI string, but tolerate a
  // strong-ref-like { uri } shape too.
  const direct = stringValue(value.datasetRef);
  if (direct) return direct;
  if (isRecord(value.datasetRef)) return stringValue(value.datasetRef.uri);
  return null;
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

function dynamicProperty(value: unknown, key: string): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return null;
    return stringValue(parsed[key]);
  } catch {
    return null;
  }
}

function normalizedDynamicProperty(value: unknown, key: string): string | null {
  return dynamicProperty(value, key)?.replaceAll(/[_\s-]+/g, "").toLowerCase() ?? null;
}

function isMeasuredTreeOccurrence(value: Record<string, unknown> | undefined): boolean {
  if (!value) return false;
  return (
    normalizedDynamicProperty(value.dynamicProperties, "dataType") === "measuredtree" ||
    normalizedDynamicProperty(value.dynamicProperties, "source") === "bumicerts"
  );
}

function parseDatasetRecord(record: ListedRecord): DatasetRecord | null {
  const uri = stringValue(record.uri);
  if (!uri || parseAtUri(uri)?.collection !== DATASET_COLLECTION) return null;
  const name = stringValue(record.value?.name);
  if (!name) return null;
  return {
    uri,
    rkey: rkeyFromUri(uri),
    name,
    description: stringValue(record.value?.description),
    recordCount: numberValue(record.value?.recordCount),
    createdAt: stringValue(record.value?.createdAt),
  };
}

// AT-URIs referenced by a collection's items[] (tolerates both the
// { itemIdentifier: { uri } } and bare { uri } shapes).
function itemUrisOf(value: Record<string, unknown> | undefined): string[] {
  if (!value || !Array.isArray(value.items)) return [];
  const uris: string[] = [];
  for (const item of value.items) {
    if (!isRecord(item)) continue;
    const identifier = isRecord(item.itemIdentifier) ? item.itemIdentifier : item;
    const uri = stringValue(identifier.uri);
    if (uri) uris.push(uri);
  }
  return uris;
}

async function listAllRecords(host: string, repo: string, collection: string): Promise<ListedRecord[]> {
  const records: ListedRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const params = new URLSearchParams({ repo, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) break;
    const data = (await response.json().catch(() => null)) as ListedRecordsResponse | null;
    if (!data || !Array.isArray(data.records)) break;
    records.push(...data.records);
    cursor = typeof data.cursor === "string" && data.cursor.length > 0 ? data.cursor : undefined;
    if (!cursor || data.records.length === 0) break;
  }
  return records;
}

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  try {
    const host = await resolvePdsHost(target.did);
    if (!host) return Response.json({ datasets: [] });

    const [occurrences, datasetRecords, collections] = await Promise.all([
      listAllRecords(host, target.did, OCCURRENCE_COLLECTION),
      listAllRecords(host, target.did, DATASET_COLLECTION),
      listAllRecords(host, target.did, COLLECTION_COLLECTION),
    ]);

    const datasetsByUri = new Map<string, DatasetRecord>();
    for (const record of datasetRecords) {
      const dataset = parseDatasetRecord(record);
      if (dataset) datasetsByUri.set(dataset.uri, dataset);
    }

    // Observation datasets are app.gainforest.dwc.dataset records referenced by
    // non-tree occurrence records. We intentionally do not create dataset
    // folders from org.hypercerts.collection records here.
    const groups = new Map<string, ObservationDatasetGroup>();
    for (const occurrence of occurrences) {
      const uri = stringValue(occurrence.uri);
      const datasetUri = datasetRefOf(occurrence.value);
      if (!uri || !datasetUri || parseAtUri(datasetUri)?.collection !== DATASET_COLLECTION) continue;
      if (isMeasuredTreeOccurrence(occurrence.value)) continue;

      const dataset = datasetsByUri.get(datasetUri);
      const existing = groups.get(datasetUri);
      const group = existing ?? {
        datasetUri,
        datasetRkey: dataset?.rkey ?? rkeyFromUri(datasetUri),
        name: dataset?.name ?? stringValue(occurrence.value?.datasetName) ?? "Untitled dataset",
        description: dataset?.description ?? null,
        count: 0,
        createdAt: dataset?.createdAt ?? null,
        uris: [],
        parentRkeys: [],
      };
      group.count += 1;
      group.uris.push(uri);
      groups.set(datasetUri, group);
    }

    // Record which project/collection records reference each dataset, so a
    // delete can unnest them without scanning client-side.
    for (const collection of collections) {
      const parentUri = stringValue(collection.uri);
      if (!parentUri) continue;
      const parentRkey = rkeyFromUri(parentUri);
      for (const childUri of itemUrisOf(collection.value)) {
        if (childUri === parentUri) continue;
        const group = groups.get(childUri);
        if (group && !group.parentRkeys.includes(parentRkey)) group.parentRkeys.push(parentRkey);
      }
    }

    const sorted = Array.from(groups.values()).sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
    return Response.json({ datasets: sorted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load observation datasets.";
    return Response.json({ error: message }, { status: 500 });
  }
}
