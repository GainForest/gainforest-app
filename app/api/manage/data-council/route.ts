import { headers } from "next/headers";
import { getAuthBaseUrl, getAuthForwardCookie } from "@/app/_lib/auth";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchCgsMembersForRequest, type CgsServerMember, type CgsServerRole } from "@/app/_lib/cgs-server";
import { getInternalBadgeAccess } from "@/app/internal/badges/_lib/access";
import {
  BADGE_AWARD_COLLECTION,
  BADGE_DEFINITION_COLLECTION,
} from "@/app/internal/badges/_lib/badge-records";
import { blobUrl, resolvePdsHost } from "@/app/_lib/pds";

export const runtime = "nodejs";

const DATA_COUNCIL_BADGE_RKEY = process.env.DATA_COUNCIL_BADGE_RKEY?.trim() || "3monk2b3xak2i";
const MANAGER_ROLES = new Set<CgsServerRole>(["owner", "admin"]);

type DataCouncilBadge = {
  rkey: string;
  uri: string;
  cid: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
};

type DataCouncilAward = {
  rkey: string;
  uri: string;
  cid: string;
  subjectDid: string | null;
  createdAt: string;
};

type DataCouncilState = {
  repo: string;
  members: CgsServerMember[];
  badge: DataCouncilBadge;
  awards: DataCouncilAward[];
  awardedDids: string[];
  canWriteBadges: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

function currentRole(members: CgsServerMember[], did: string | null | undefined): CgsServerRole | null {
  if (!did) return null;
  return members.find((member) => member.did === did)?.role ?? null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

function blobCid(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const ref = value.ref;
  if (typeof ref === "string") return ref;
  if (isRecord(ref) && typeof ref.$link === "string") return ref.$link;
  if (typeof value.$link === "string") return value.$link;
  return null;
}

function strongRef(value: unknown): { uri: string; cid: string } | null {
  if (!isRecord(value)) return null;
  const uri = stringValue(value.uri);
  const cid = stringValue(value.cid);
  return uri && cid ? { uri, cid } : null;
}

type ListedRecord = { uri?: unknown; cid?: unknown; value?: unknown };
type ListRecordsResponse = { records?: ListedRecord[]; cursor?: unknown; error?: unknown; message?: unknown };

async function fetchBadgeJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  const payload = (await response.json().catch(() => null)) as (T & { error?: unknown; message?: unknown }) | null;
  if (!response.ok || payload?.error) {
    const message = stringValue(payload?.message) ?? stringValue(payload?.error) ?? "Could not load Data Council badge records.";
    throw new Error(message);
  }
  if (!payload) throw new Error("Could not load Data Council badge records.");
  return payload;
}

async function getBadgeDefinition(repoDid: string, host: string): Promise<DataCouncilBadge> {
  const params = new URLSearchParams({ repo: repoDid, collection: BADGE_DEFINITION_COLLECTION, rkey: DATA_COUNCIL_BADGE_RKEY });
  const payload = await fetchBadgeJson<{ uri?: unknown; cid?: unknown; value?: unknown }>(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`);
  const uri = stringValue(payload.uri);
  const cid = stringValue(payload.cid);
  const value = payload.value;
  if (!uri || !cid || !isRecord(value)) throw new Error("The Data Council badge could not be found.");
  const title = stringValue(value.title) ?? "Data Council";
  const iconRef = blobCid(value.icon);
  return {
    rkey: DATA_COUNCIL_BADGE_RKEY,
    uri,
    cid,
    title,
    description: stringValue(value.description),
    iconUrl: iconRef ? blobUrl(host, repoDid, iconRef) : null,
  };
}

function normalizeAward(entry: ListedRecord, badgeUri: string): DataCouncilAward | null {
  const uri = stringValue(entry.uri);
  const cid = stringValue(entry.cid);
  const value = entry.value;
  if (!uri || !cid || !isRecord(value)) return null;
  const badge = strongRef(value.badge);
  if (badge?.uri !== badgeUri) return null;
  const subject = value.subject;
  const subjectDid = isRecord(subject) && typeof subject.did === "string" ? subject.did : null;
  const createdAt = stringValue(value.createdAt) ?? "";
  return { rkey: rkeyFromUri(uri), uri, cid, subjectDid, createdAt };
}

async function listBadgeAwards(repoDid: string, host: string, badgeUri: string): Promise<DataCouncilAward[]> {
  const awards: DataCouncilAward[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ repo: repoDid, collection: BADGE_AWARD_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const payload = await fetchBadgeJson<ListRecordsResponse>(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`);
    for (const entry of payload.records ?? []) {
      const award = normalizeAward(entry, badgeUri);
      if (award) awards.push(award);
    }
    cursor = stringValue(payload.cursor) ?? undefined;
    if (!cursor) break;
  }
  return awards;
}

async function requireDataCouncilAccess(repo: string) {
  if (!repo.trim()) return { error: jsonError("Choose an organization first.", 400) } as const;

  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return { error: jsonError("Sign in to continue.", 401) } as const;

  let members: CgsServerMember[];
  try {
    members = (await fetchCgsMembersForRequest(repo)).members;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load organization members.";
    return { error: jsonError(message, 403) } as const;
  }

  const role = currentRole(members, session.did);
  if (!role || !MANAGER_ROLES.has(role)) {
    return { error: jsonError("Only organization owners and admins can manage the Data Council.", 403) } as const;
  }

  return { session, members } as const;
}

async function loadDataCouncilState(repo: string, members: CgsServerMember[], canWriteBadges: boolean): Promise<DataCouncilState> {
  const access = await getInternalBadgeAccess();
  if (!access.configured || !access.repoDid) throw new Error("The Data Council badge is not configured yet.");

  const host = await resolvePdsHost(access.repoDid);
  if (!host) throw new Error("Could not find the Data Council badge store.");

  const badge = await getBadgeDefinition(access.repoDid, host);
  const memberDids = new Set(members.map((member) => member.did));
  const awards = (await listBadgeAwards(access.repoDid, host, badge.uri))
    .filter((award) => award.subjectDid && memberDids.has(award.subjectDid));
  const awardedDids = Array.from(new Set(awards.flatMap((award) => award.subjectDid ? [award.subjectDid] : [])));

  return {
    repo,
    members,
    badge,
    awards,
    awardedDids,
    canWriteBadges,
  };
}

async function forwardBadgeMutation(payload: Record<string, unknown>) {
  const access = await getInternalBadgeAccess();
  if (!access.isLoggedIn) throw new Error("Sign in to continue.");
  if (!access.configured || !access.writeRepo) throw new Error("Only GainForest badge workspace owners and admins can save Data Council changes.");

  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ ...payload, repo: access.writeRepo }),
    cache: "no-store",
  });

  const body = (await upstream.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
  if (!upstream.ok || body?.error) {
    const message = typeof body?.message === "string"
      ? body.message
      : typeof body?.error === "string"
        ? body.error
        : "Could not save Data Council changes.";
    throw new Error(message);
  }
  return body;
}

export async function GET(request: Request) {
  const repo = new URL(request.url).searchParams.get("repo")?.trim() ?? "";
  const accessResult = await requireDataCouncilAccess(repo);
  if ("error" in accessResult) return accessResult.error;

  try {
    const badgeAccess = await getInternalBadgeAccess();
    const state = await loadDataCouncilState(repo, accessResult.members, Boolean(badgeAccess.writeRepo));
    return Response.json(state, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Data Council members.";
    return jsonError(message, 502);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return jsonError("Data Council request is not valid.", 400);

  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  const memberDid = typeof body.memberDid === "string" ? body.memberDid.trim() : "";
  if (typeof body.selected !== "boolean") return jsonError("Choose whether this member belongs on the Data Council.", 400);
  const selected = body.selected;
  if (!memberDid.startsWith("did:")) return jsonError("Choose an organization member first.", 400);

  const accessResult = await requireDataCouncilAccess(repo);
  if ("error" in accessResult) return accessResult.error;
  if (!accessResult.members.some((member) => member.did === memberDid)) {
    return jsonError("Choose an existing organization member.", 400);
  }

  const badgeAccess = await getInternalBadgeAccess();
  if (!badgeAccess.writeRepo) {
    return jsonError("Only GainForest badge workspace owners and admins can save Data Council changes.", 403);
  }

  try {
    const before = await loadDataCouncilState(repo, accessResult.members, true);
    const existingAwards = before.awards.filter((award) => award.subjectDid === memberDid);

    if (selected && existingAwards.length === 0) {
      await forwardBadgeMutation({
        operation: "createRecord",
        collection: BADGE_AWARD_COLLECTION,
        record: {
          $type: BADGE_AWARD_COLLECTION,
          badge: { uri: before.badge.uri, cid: before.badge.cid },
          subject: { $type: "app.certified.defs#did", did: memberDid },
          createdAt: new Date().toISOString(),
        },
      });
    }

    if (!selected) {
      for (const award of existingAwards) {
        await forwardBadgeMutation({
          operation: "deleteRecord",
          collection: BADGE_AWARD_COLLECTION,
          rkey: award.rkey,
        });
      }
    }

    const after = await loadDataCouncilState(repo, accessResult.members, true);
    return Response.json(after, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save Data Council changes.";
    return jsonError(message, 502);
  }
}
