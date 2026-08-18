import { headers } from "next/headers";
import { getAuthBaseUrl, getAuthForwardCookie } from "@/app/_lib/auth";
import { getInternalBadgeAccess } from "@/app/internal/badges/_lib/access";
import { INTERNAL_BADGE_COLLECTIONS } from "@/app/internal/badges/_lib/badge-records";

export const runtime = "nodejs";

type MutationPayload =
  | { operation: "createRecord"; collection: string; rkey?: string; record: Record<string, unknown>; repo?: string }
  | { operation: "putRecord"; collection: string; rkey: string; record: Record<string, unknown>; swapRecord?: string; repo?: string }
  | { operation: "deleteRecord"; collection: string; rkey: string; repo?: string }
  | { operation: "uploadBlob"; blobData: string; blobMimeType: string; repo?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePayload(value: unknown): MutationPayload | null {
  if (!isRecord(value) || typeof value.operation !== "string") return null;
  if (value.operation === "uploadBlob") {
    return typeof value.blobData === "string" && typeof value.blobMimeType === "string"
      ? { operation: "uploadBlob", blobData: value.blobData, blobMimeType: value.blobMimeType }
      : null;
  }
  if (typeof value.collection !== "string" || !INTERNAL_BADGE_COLLECTIONS.has(value.collection)) return null;
  if (value.operation === "createRecord") {
    return isRecord(value.record)
      ? {
          operation: "createRecord",
          collection: value.collection,
          record: value.record,
          ...(typeof value.rkey === "string" && value.rkey.trim() ? { rkey: value.rkey.trim() } : {}),
        }
      : null;
  }
  if (value.operation === "putRecord") {
    return typeof value.rkey === "string" && isRecord(value.record)
      ? {
          operation: "putRecord",
          collection: value.collection,
          rkey: value.rkey,
          record: value.record,
          ...(typeof value.swapRecord === "string" && value.swapRecord.trim() ? { swapRecord: value.swapRecord.trim() } : {}),
        }
      : null;
  }
  if (value.operation === "deleteRecord") {
    return typeof value.rkey === "string" ? { operation: "deleteRecord", collection: value.collection, rkey: value.rkey } : null;
  }
  return null;
}

export async function POST(request: Request) {
  const access = await getInternalBadgeAccess();
  if (!access.isLoggedIn) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  if (!access.allowed) return Response.json({ error: "You do not have access to this dashboard." }, { status: 403 });

  const parsed = parsePayload(await request.json().catch(() => null));
  if (!parsed) return Response.json({ error: "Badge request is not valid." }, { status: 400 });

  const payload = access.writeRepo ? { ...parsed, repo: access.writeRepo } : parsed;
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  const upstream = await fetch(new URL(access.writeRepo ? "/api/cgs/mutation" : "/api/atproto/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
