import { fetchMeasurementsByDid, type TreeMeasurementRecord } from "@/app/_lib/indexer";
import { resolvePdsHost } from "@/app/_lib/pds";
import { isResponse, resolveManageApiTarget } from "../../_lib/target";

export const runtime = "nodejs";

const MEASUREMENT_COLLECTION = "app.gainforest.dwc.measurement";
const PAGE_LIMIT = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getConfiguredPdsUrl(): string | null {
  const domain = process.env.E2E_TEST_PDS_DOMAIN?.trim();
  if (!domain) return null;
  return domain.startsWith("http://") || domain.startsWith("https://") ? domain.replace(/\/$/, "") : `https://${domain}`;
}

async function getPdsBaseUrl(did: string): Promise<string> {
  const configuredPdsUrl = getConfiguredPdsUrl();
  if (configuredPdsUrl) return configuredPdsUrl;
  const host = await resolvePdsHost(did);
  if (!host) throw new Error("Could not load measurements.");
  return `https://${host}`;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "unknown";
}

function omitEmptyFields(record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined || next[key] === null) delete next[key];
  }
  return next;
}

function normalizePdsMeasurementResult(value: unknown): unknown | null {
  return isRecord(value) ? omitEmptyFields(value) : null;
}

function mapPdsMeasurementRecord(options: {
  did: string;
  uri: string;
  cid: string | null;
  value: Record<string, unknown>;
}): TreeMeasurementRecord | null {
  const occurrenceRef = getString(options.value.occurrenceRef);
  if (!occurrenceRef) return null;
  const createdAt = getString(options.value.createdAt);

  return {
    metadata: {
      did: options.did,
      uri: options.uri,
      rkey: rkeyFromUri(options.uri),
      cid: options.cid,
      createdAt,
    },
    record: {
      occurrenceRef,
      result: normalizePdsMeasurementResult(options.value.result),
      measuredBy: getString(options.value.measuredBy),
      measuredByID: getString(options.value.measuredByID),
      measurementDate: getString(options.value.measurementDate),
      measurementMethod: getString(options.value.measurementMethod),
      measurementRemarks: getString(options.value.measurementRemarks),
      createdAt,
      legacyMeasurementType: null,
      legacyMeasurementValue: null,
      legacyMeasurementUnit: null,
      schemaVersion: "bundled",
    },
  };
}

async function fetchMeasurementsFromPds(did: string): Promise<TreeMeasurementRecord[]> {
  const pdsBaseUrl = await getPdsBaseUrl(did);
  const items: TreeMeasurementRecord[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      repo: did,
      collection: MEASUREMENT_COLLECTION,
      limit: String(PAGE_LIMIT),
    });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`${pdsBaseUrl}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as {
      records?: unknown;
      cursor?: unknown;
      error?: string;
      message?: string;
    } | null;

    if (!response.ok || !payload || !Array.isArray(payload.records)) {
      throw new Error("Could not load measurements.");
    }

    for (const item of payload.records) {
      if (!isRecord(item) || typeof item.uri !== "string" || !isRecord(item.value)) continue;
      const parsed = mapPdsMeasurementRecord({
        did,
        uri: item.uri,
        cid: typeof item.cid === "string" ? item.cid : null,
        value: item.value,
      });
      if (parsed) items.push(parsed);
    }

    cursor = typeof payload.cursor === "string" ? payload.cursor : undefined;
  } while (cursor);

  items.sort((left, right) => {
    const leftTime = left.record.createdAt ? new Date(left.record.createdAt).getTime() : 0;
    const rightTime = right.record.createdAt ? new Date(right.record.createdAt).getTime() : 0;
    return rightTime - leftTime;
  });

  return items;
}

function mergeMeasurements(
  pdsMeasurements: TreeMeasurementRecord[],
  indexerMeasurements: TreeMeasurementRecord[],
): TreeMeasurementRecord[] {
  const byUri = new Map<string, TreeMeasurementRecord>();
  for (const item of indexerMeasurements) byUri.set(item.metadata.uri, item);
  for (const item of pdsMeasurements) byUri.set(item.metadata.uri, item);
  return Array.from(byUri.values()).sort((left, right) => {
    const leftTime = left.record.createdAt ? new Date(left.record.createdAt).getTime() : 0;
    const rightTime = right.record.createdAt ? new Date(right.record.createdAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  const [pdsResult, indexerResult] = await Promise.allSettled([
    fetchMeasurementsFromPds(target.did),
    fetchMeasurementsByDid(target.did),
  ]);

  if (pdsResult.status === "fulfilled") {
    return Response.json(mergeMeasurements(
      pdsResult.value,
      indexerResult.status === "fulfilled" ? indexerResult.value : [],
    ));
  }

  if (indexerResult.status === "fulfilled") {
    return Response.json(indexerResult.value);
  }

  return Response.json({ error: "Could not load measurements." }, { status: 500 });
}
