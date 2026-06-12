import { resolvePdsHost } from "@/app/_lib/pds";
import { isResponse, resolveManageApiTarget } from "../../_lib/target";
import type { OccurrenceRecord } from "@/app/_lib/indexer";

export const runtime = "nodejs";

const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";

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
  if (!host) throw new Error("Could not load this tree.");
  return `https://${host}`;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapOccurrenceFromValue(options: {
  did: string;
  rkey: string;
  uri: string;
  cid: string | null;
  value: Record<string, unknown>;
}): Partial<OccurrenceRecord> {
  const { did, rkey, uri, cid, value } = options;
  return {
    kind: "occurrence",
    id: `${did}-${rkey}`,
    did,
    rkey,
    cid,
    atUri: uri,
    scientificName: getString(value.scientificName),
    vernacularName: getString(value.vernacularName),
    kingdom: getString(value.kingdom),
    family: getString(value.family),
    genus: getString(value.genus),
    basisOfRecord: getString(value.basisOfRecord),
    recordedBy: getString(value.recordedBy),
    individualCount: typeof value.individualCount === "number" ? value.individualCount : null,
    country: getString(value.country),
    countryCode: getString(value.countryCode),
    stateProvince: getString(value.stateProvince),
    locality: getString(value.locality),
    lat: getNumber(value.decimalLatitude),
    lon: getNumber(value.decimalLongitude),
    eventDate: getString(value.eventDate),
    habitat: getString(value.habitat),
    siteRef: getString(value.siteRef),
    datasetRef: getString(value.datasetRef),
    datasetName: getString(value.datasetName),
    dynamicProperties: getString(value.dynamicProperties),
    establishmentMeans: getString(value.establishmentMeans),
    createdAt: getString(value.createdAt) ?? new Date().toISOString(),
    remarks: getString(value.occurrenceRemarks) ?? getString(value.fieldNotes),
  };
}

export async function GET(request: Request, context: { params: Promise<{ rkey: string }> }) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  const { rkey } = await context.params;
  if (!rkey) {
    return Response.json({ error: "Choose a tree to review." }, { status: 400 });
  }

  try {
    const pdsBaseUrl = await getPdsBaseUrl(target.did);
    const params = new URLSearchParams({
      repo: target.did,
      collection: OCCURRENCE_COLLECTION,
      rkey,
    });
    const response = await fetch(`${pdsBaseUrl}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as {
      uri?: unknown;
      cid?: unknown;
      value?: unknown;
      error?: string;
      message?: string;
    } | null;

    if (!response.ok || !payload || typeof payload.uri !== "string" || !isRecord(payload.value)) {
      return Response.json({ error: "Could not load this tree." }, { status: response.status === 404 ? 404 : 500 });
    }

    return Response.json(mapOccurrenceFromValue({
      did: target.did,
      rkey,
      uri: payload.uri,
      cid: typeof payload.cid === "string" ? payload.cid : null,
      value: payload.value,
    }));
  } catch {
    return Response.json({ error: "Could not load this tree." }, { status: 500 });
  }
}
