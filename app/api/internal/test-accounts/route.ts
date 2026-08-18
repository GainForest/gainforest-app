import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { fetchHiddenAccountDids } from "@/app/_lib/indexer";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  TestAccountMutationError,
  flagTestAccount,
  unflagTestAccount,
} from "@/app/internal/badges/_lib/test-accounts";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readDid(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const did = typeof value.did === "string" ? value.did.trim() : "";
  return did.startsWith("did:") ? did : null;
}

async function loadAccess() {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return { error: Response.json({ error: "You do not have access to flag accounts." }, { status: 403 }) } as const;
  }
  return { access, repoDid: access.repoDid } as const;
}

export async function GET(request: Request) {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  const did = new URL(request.url).searchParams.get("did")?.trim() ?? "";
  if (!did.startsWith("did:")) {
    return Response.json({ error: "A valid account id is required." }, { status: 400 });
  }
  const flagged = await fetchHiddenAccountDids().then((dids) => dids.has(did)).catch(() => false);
  return Response.json({ flagged }, { headers: { "cache-control": "no-store" } });
}

async function mutate(request: Request, action: "flag" | "unflag") {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  const did = readDid(await request.json().catch(() => null));
  if (!did) return Response.json({ error: "A valid account id is required." }, { status: 400 });

  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  try {
    if (action === "flag") {
      await flagTestAccount(loaded.repoDid, cookie, did);
    } else {
      await unflagTestAccount(loaded.repoDid, cookie, did);
    }
    return Response.json({ flagged: action === "flag" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof TestAccountMutationError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not update the test-account flag.";
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  return mutate(request, "flag");
}

export async function DELETE(request: Request) {
  return mutate(request, "unflag");
}
