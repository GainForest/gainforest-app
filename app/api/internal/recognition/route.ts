import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  RecognitionMutationError,
  awardRecognition,
  revokeRecognition,
} from "@/app/internal/badges/_lib/recognition";
import { isManualRecognitionBadgeKey } from "@/app/_lib/recognition-badges";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readInput(value: unknown): { did: string; badge: string } | null {
  if (!isRecord(value)) return null;
  const did = typeof value.did === "string" ? value.did.trim() : "";
  const badge = typeof value.badge === "string" ? value.badge.trim() : "";
  // Only manually toggled badges pass through this route — BioBlitz winner
  // badges are awarded per round from the BioBlitz page instead.
  if (!did.startsWith("did:") || !isManualRecognitionBadgeKey(badge)) return null;
  return { did, badge };
}

async function loadAccess() {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return { error: Response.json({ error: "You do not have access to award badges." }, { status: 403 }) } as const;
  }
  return { repoDid: access.repoDid } as const;
}

async function mutate(request: Request, action: "award" | "revoke") {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  const input = readInput(await request.json().catch(() => null));
  if (!input) return Response.json({ error: "A valid account and badge are required." }, { status: 400 });

  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  try {
    if (action === "award") {
      await awardRecognition(loaded.repoDid, cookie, input.did, input.badge);
    } else {
      await revokeRecognition(loaded.repoDid, cookie, input.did, input.badge);
    }
    return Response.json({ awarded: action === "award" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof RecognitionMutationError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not update the badge.";
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  return mutate(request, "award");
}

export async function DELETE(request: Request) {
  return mutate(request, "revoke");
}
