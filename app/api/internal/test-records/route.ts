import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { fetchHiddenRecordUris } from "@/app/_lib/indexer";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { TestAccountMutationError } from "@/app/internal/badges/_lib/test-accounts";
import {
  flagTestRecord,
  isFlaggableRecordUri,
  unflagTestRecord,
} from "@/app/internal/badges/_lib/test-records";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readUri(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const uri = typeof value.uri === "string" ? value.uri.trim() : "";
  return isFlaggableRecordUri(uri) ? uri : null;
}

async function loadAccess() {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return { error: Response.json({ error: "You do not have access to hide records." }, { status: 403 }) } as const;
  }
  return { access, repoDid: access.repoDid } as const;
}

export async function GET(request: Request) {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  const uri = new URL(request.url).searchParams.get("uri")?.trim() ?? "";
  if (!isFlaggableRecordUri(uri)) {
    return Response.json({ error: "A valid record link is required." }, { status: 400 });
  }
  const flagged = await fetchHiddenRecordUris().then((uris) => uris.has(uri)).catch(() => false);
  return Response.json({ flagged }, { headers: { "cache-control": "no-store" } });
}

async function mutate(request: Request, action: "flag" | "unflag") {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  const uri = readUri(await request.json().catch(() => null));
  if (!uri) return Response.json({ error: "A valid record link is required." }, { status: 400 });

  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  try {
    if (action === "flag") {
      await flagTestRecord(loaded.repoDid, cookie, uri);
    } else {
      await unflagTestRecord(loaded.repoDid, cookie, uri);
    }
    return Response.json({ flagged: action === "flag" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof TestAccountMutationError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not update the hidden-record flag.";
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  return mutate(request, "flag");
}

export async function DELETE(request: Request) {
  return mutate(request, "unflag");
}
