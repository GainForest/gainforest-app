import { headers } from "next/headers";
import { getAuthBaseUrl, getAuthForwardCookie } from "@/app/_lib/auth";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchCgsMembersForRequest, type CgsServerMember, type CgsServerRole } from "@/app/_lib/cgs-server";
import {
  applyOptimisticDataCouncilSelection,
  BADGE_AWARD_COLLECTION,
  loadFastDataCouncilState,
  type DataCouncilState,
} from "@/app/_lib/data-council";

export const runtime = "nodejs";

const MANAGER_ROLES = new Set<CgsServerRole>(["owner", "admin"]);

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
  return loadFastDataCouncilState(repo, members, canWriteBadges);
}

async function forwardBadgeMutation(writeRepo: string, payload: Record<string, unknown>) {
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ ...payload, repo: writeRepo }),
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
    const state = await loadDataCouncilState(repo, accessResult.members, true);
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

  try {
    const before = await loadDataCouncilState(repo, accessResult.members, true);
    const existingAwards = before.awards.filter((award) => award.subjectDid === memberDid);

    if (selected && existingAwards.length === 0) {
      await forwardBadgeMutation(repo, {
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
        await forwardBadgeMutation(repo, {
          operation: "deleteRecord",
          collection: BADGE_AWARD_COLLECTION,
          rkey: award.rkey,
        });
      }
    }

    return Response.json(applyOptimisticDataCouncilSelection(before, memberDid, selected), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save Data Council changes.";
    return jsonError(message, 502);
  }
}
