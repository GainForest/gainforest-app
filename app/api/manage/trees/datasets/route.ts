import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolvePdsHost } from "@/app/_lib/pds";
import type { UploadTreeDatasetItem } from "@/app/(manage)/manage/_lib/upload/tree-upload-datasets";

export const runtime = "nodejs";

const DATASET_COLLECTION = "app.gainforest.dwc.dataset";
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
  if (!host) throw new Error("Could not load tree groups.");
  return `https://${host}`;
}

function parseTreeDatasetItem(record: { uri: string; value: unknown }): UploadTreeDatasetItem | null {
  if (!isRecord(record.value) || typeof record.value.name !== "string") {
    return null;
  }

  return {
    uri: record.uri,
    rkey: record.uri.split("/").pop() ?? "",
    name: record.value.name,
    description: typeof record.value.description === "string" ? record.value.description : null,
    recordCount: typeof record.value.recordCount === "number" && Number.isFinite(record.value.recordCount)
      ? record.value.recordCount
      : null,
    createdAt: typeof record.value.createdAt === "string" ? record.value.createdAt : null,
  };
}

async function listTreeGroups(did: string): Promise<UploadTreeDatasetItem[]> {
  const pdsBaseUrl = await getPdsBaseUrl(did);
  const items: UploadTreeDatasetItem[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      repo: did,
      collection: DATASET_COLLECTION,
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
      throw new Error("Could not load tree groups.");
    }

    for (const item of payload.records) {
      if (!isRecord(item) || typeof item.uri !== "string") continue;
      const parsed = parseTreeDatasetItem({ uri: item.uri, value: item.value });
      if (parsed) items.push(parsed);
    }

    cursor = typeof payload.cursor === "string" ? payload.cursor : undefined;
  } while (cursor);

  items.sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;

    if (rightTime !== leftTime) return rightTime - leftTime;
    return left.name.localeCompare(right.name);
  });

  return items;
}

export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }

  try {
    const datasets = await listTreeGroups(session.did);
    return Response.json(datasets);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load tree groups.";
    return Response.json({ error: message }, { status: 500 });
  }
}
