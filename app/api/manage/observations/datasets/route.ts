import { isResponse, resolveManageApiTarget } from "../../_lib/target";
import { resolvePdsHost } from "@/app/_lib/pds";

export const runtime = "nodejs";

const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
const DATASET_COLLECTION = "app.gainforest.dwc.dataset";

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
};

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

    const [occurrences, datasets] = await Promise.all([
      listAllRecords(host, target.did, OCCURRENCE_COLLECTION),
      listAllRecords(host, target.did, DATASET_COLLECTION),
    ]);

    // Seed a group for every dataset the steward owns, so freshly created (and
    // not-yet-populated) datasets still surface as folders.
    const groups = new Map<string, ObservationDatasetGroup>();
    for (const dataset of datasets) {
      const uri = stringValue(dataset.uri);
      if (!uri) continue;
      groups.set(uri, {
        datasetUri: uri,
        datasetRkey: rkeyFromUri(uri),
        name: stringValue(dataset.value?.name) ?? "Untitled dataset",
        description: stringValue(dataset.value?.description),
        count: 0,
        createdAt: stringValue(dataset.value?.createdAt),
        uris: [],
      });
    }

    for (const occurrence of occurrences) {
      const uri = stringValue(occurrence.uri);
      const datasetUri = datasetRefOf(occurrence.value);
      if (!uri || !datasetUri) continue;
      const existing = groups.get(datasetUri);
      if (existing) {
        existing.count += 1;
        existing.uris.push(uri);
      } else {
        // An occurrence references a dataset record we couldn't read (e.g. it
        // lives in another repo). Still expose it using the stored datasetName.
        groups.set(datasetUri, {
          datasetUri,
          datasetRkey: rkeyFromUri(datasetUri),
          name: stringValue(occurrence.value?.datasetName) ?? "Untitled dataset",
          description: null,
          count: 1,
          createdAt: null,
          uris: [uri],
        });
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
