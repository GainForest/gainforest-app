import { isResponse, resolveManageApiTarget } from "../../_lib/target";
import { resolvePdsHost } from "@/app/_lib/pds";

export const runtime = "nodejs";

const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
const COLLECTION_COLLECTION = "org.hypercerts.collection";
const DATASET_COLLECTION_TYPE = "dataset";

type ListedRecord = { uri?: string; value?: Record<string, unknown> };
type ListedRecordsResponse = { records?: ListedRecord[]; cursor?: string };

export type ObservationDatasetGroup = {
  datasetUri: string;
  datasetRkey: string;
  name: string;
  description: string | null;
  count: number;
  createdAt: string | null;
  uris: string[];
  /** rkeys of collections (e.g. projects) that nest this dataset in items[], so
   *  deleting the dataset can also remove the dangling reference. */
  parentRkeys: string[];
  /** AT-URI of the project (type "project" collection) this dataset is nested
   *  under, if any — surfaced so the folder can show + change its project. */
  projectUri: string | null;
  /** Title of that project, for display. */
  projectName: string | null;
};

const PROJECT_COLLECTION_TYPE = "project";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

    const [occurrences, collections] = await Promise.all([
      listAllRecords(host, target.did, OCCURRENCE_COLLECTION),
      listAllRecords(host, target.did, COLLECTION_COLLECTION),
    ]);

    // Seed a group for every dataset-typed collection the steward owns, so a
    // freshly created (and not-yet-populated) dataset still surfaces as a folder.
    // Project / portfolio / other collection types are ignored here, and tree
    // groups (app.gainforest.dwc.dataset) are a different collection entirely —
    // so neither leaks into the observation dataset list.
    const groups = new Map<string, ObservationDatasetGroup>();
    for (const collection of collections) {
      const uri = stringValue(collection.uri);
      const type = stringValue(collection.value?.type);
      if (!uri || type !== DATASET_COLLECTION_TYPE) continue;
      groups.set(uri, {
        datasetUri: uri,
        datasetRkey: rkeyFromUri(uri),
        name: stringValue(collection.value?.title) ?? "Untitled dataset",
        description: stringValue(collection.value?.shortDescription),
        count: 0,
        createdAt: stringValue(collection.value?.createdAt),
        uris: [],
        parentRkeys: [],
        projectUri: null,
        projectName: null,
      });
    }

    // Record which collections nest each dataset (so a delete can unnest them),
    // and remember the first project (type "project") parent for display.
    for (const collection of collections) {
      const parentUri = stringValue(collection.uri);
      if (!parentUri) continue;
      const parentRkey = rkeyFromUri(parentUri);
      const parentIsProject = stringValue(collection.value?.type) === PROJECT_COLLECTION_TYPE;
      const parentTitle = stringValue(collection.value?.title) ?? "Untitled project";
      for (const childUri of itemUrisOf(collection.value)) {
        if (childUri === parentUri) continue;
        const group = groups.get(childUri);
        if (!group) continue;
        if (!group.parentRkeys.includes(parentRkey)) group.parentRkeys.push(parentRkey);
        if (parentIsProject && !group.projectUri) {
          group.projectUri = parentUri;
          group.projectName = parentTitle;
        }
      }
    }

    // Count only observations that point at one of those dataset collections.
    for (const occurrence of occurrences) {
      const uri = stringValue(occurrence.uri);
      const datasetUri = datasetRefOf(occurrence.value);
      if (!uri || !datasetUri) continue;
      const existing = groups.get(datasetUri);
      if (!existing) continue;
      existing.count += 1;
      existing.uris.push(uri);
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
