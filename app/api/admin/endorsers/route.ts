import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  EndorserMutationError,
  addEndorser,
  listEndorsers,
} from "@/app/internal/badges/_lib/endorser-mutations";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function loadAccess() {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return { error: Response.json({ error: "You do not have access to manage endorsers." }, { status: 403 }) } as const;
  }
  return { repoDid: access.repoDid } as const;
}

export async function GET() {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;
  const endorsers = await listEndorsers(loaded.repoDid);
  return Response.json({ endorsers }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  const body = await request.json().catch(() => null);
  const identifier = isRecord(body) && typeof body.identifier === "string" ? body.identifier : "";
  const label = isRecord(body) && typeof body.label === "string" ? body.label : null;

  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  try {
    const { record } = await addEndorser(loaded.repoDid, cookie, identifier, label);
    return Response.json({ endorser: record }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof EndorserMutationError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not add the endorser.";
    return Response.json({ error: message }, { status });
  }
}
