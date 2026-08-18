import { isResponse, resolveManageApiTarget } from "../../_lib/target";
import { resolvePdsHost } from "@/app/_lib/pds";

export const runtime = "nodejs";

const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
const PROJECT_COLLECTION = "org.hypercerts.collection";

type ListedRecord = { uri?: string; value?: Record<string, unknown> };
type ListedRecordsResponse = { records?: ListedRecord[]; cursor?: string };

type ProjectObservationGroup = {
  projectUri: string;
  title: string;
  count: number;
  uris: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function projectRefOf(value: Record<string, unknown> | undefined): string | null {
  if (!value) return null;
  // The project link is written as a plain AT-URI string, but tolerate a
  // strong-ref-like { uri } shape too.
  const direct = stringValue(value.projectRef);
  if (direct) return direct;
  if (isRecord(value.projectRef)) return stringValue(value.projectRef.uri);
  return null;
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
    if (!host) return Response.json({ groups: [] });

    const [occurrences, projects] = await Promise.all([
      listAllRecords(host, target.did, OCCURRENCE_COLLECTION),
      listAllRecords(host, target.did, PROJECT_COLLECTION),
    ]);

    const titleByUri = new Map<string, string>();
    for (const project of projects) {
      const uri = stringValue(project.uri);
      if (!uri) continue;
      titleByUri.set(uri, stringValue(project.value?.title) ?? "Untitled project");
    }

    const groups = new Map<string, ProjectObservationGroup>();
    for (const occurrence of occurrences) {
      const uri = stringValue(occurrence.uri);
      const projectUri = projectRefOf(occurrence.value);
      if (!uri || !projectUri) continue;
      const existing = groups.get(projectUri);
      if (existing) {
        existing.count += 1;
        existing.uris.push(uri);
      } else {
        groups.set(projectUri, {
          projectUri,
          title: titleByUri.get(projectUri) ?? "Untitled project",
          count: 1,
          uris: [uri],
        });
      }
    }

    const sorted = Array.from(groups.values()).sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
    return Response.json({ groups: sorted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load project observations.";
    return Response.json({ error: message }, { status: 500 });
  }
}
