import { fetchINaturalistProject, fetchINaturalistProjectObservations } from "@/app/_lib/inaturalist-server";
import { resolvePdsHost } from "@/app/_lib/pds";
import { isResponse, resolveManageApiTarget } from "../../_lib/target";

export const runtime = "nodejs";

const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
const LIST_LIMIT = 100;

type ListedRecord = {
  uri?: unknown;
  value?: unknown;
};

type ListRecordsResponse = {
  records?: ListedRecord[];
  cursor?: unknown;
};

type ExistingINaturalistRecord = {
  uri: string;
  projectRef: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sourceIdFromDynamicProperties(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return null;
    const source = stringValue(parsed.source)?.toLowerCase();
    const id = parsed.inaturalistObservationId;
    return source === "inaturalist" && typeof id === "number" && Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

function sourceIdFromOccurrenceId(value: unknown): number | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const prefixed = raw.match(/^inaturalist:(\d+)$/i)?.[1];
  if (prefixed) return Number(prefixed);
  const url = raw.match(/inaturalist\.org\/observations\/(\d+)/i)?.[1];
  return url ? Number(url) : null;
}

function existingRecordFromListedRecord(record: ListedRecord): { id: number; existing: ExistingINaturalistRecord } | null {
  if (typeof record.uri !== "string" || !isRecord(record.value)) return null;
  const id = sourceIdFromDynamicProperties(record.value.dynamicProperties) ?? sourceIdFromOccurrenceId(record.value.occurrenceID);
  if (id === null || !Number.isFinite(id)) return null;
  return {
    id,
    existing: {
      uri: record.uri,
      projectRef: stringValue(record.value.projectRef),
    },
  };
}

async function listExistingINaturalistRecords(did: string): Promise<Map<number, ExistingINaturalistRecord>> {
  const host = await resolvePdsHost(did);
  if (!host) return new Map();

  const existing = new Map<number, ExistingINaturalistRecord>();
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      repo: did,
      collection: OCCURRENCE_COLLECTION,
      limit: String(LIST_LIMIT),
    });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) break;
    const payload = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    if (!payload || !Array.isArray(payload.records)) break;

    for (const record of payload.records) {
      const parsed = existingRecordFromListedRecord(record);
      if (parsed) existing.set(parsed.id, parsed.existing);
    }

    cursor = typeof payload.cursor === "string" ? payload.cursor : undefined;
  } while (cursor);

  return existing;
}

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  const url = new URL(request.url);
  const inputUrl = url.searchParams.get("url")?.trim() ?? "";
  const projectRef = url.searchParams.get("projectRef")?.trim() || null;
  if (!inputUrl) {
    return Response.json({ error: "Enter an iNaturalist project page link." }, { status: 400 });
  }

  try {
    const [project, existing] = await Promise.all([
      fetchINaturalistProject(inputUrl),
      listExistingINaturalistRecords(target.did).catch(() => new Map<number, ExistingINaturalistRecord>()),
    ]);
    const { observations, totalResults, truncated } = await fetchINaturalistProjectObservations({
      project,
      existingByObservationId: existing,
      projectRef,
    });

    return Response.json({
      project: { ...project, observationCount: totalResults },
      observations,
      truncated,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load iNaturalist observations." }, { status: 400 });
  }
}
