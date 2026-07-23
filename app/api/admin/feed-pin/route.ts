import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  FeedPinMutationError,
  listFeedPins,
  pinFeedPost,
  unpinFeedPost,
} from "@/app/internal/badges/_lib/feed-pin-mutations";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readUri(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const uri = typeof value.uri === "string" ? value.uri.trim() : "";
  return uri.startsWith("at://") ? uri : null;
}

async function loadAccess() {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return { error: Response.json({ error: "You do not have access to pin posts." }, { status: 403 }) } as const;
  }
  return { repoDid: access.repoDid } as const;
}

/** GET /api/admin/feed-pin — the currently pinned post URI(s), newest first. */
export async function GET() {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;
  const pins = await listFeedPins(loaded.repoDid);
  return Response.json(
    { pinnedUris: [...new Set(pins.map((pin) => pin.subjectUri))] },
    { headers: { "cache-control": "no-store" } },
  );
}

async function mutate(request: Request, action: "pin" | "unpin") {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  const body = await request.json().catch(() => null);
  const uri = readUri(body);
  if (action === "pin" && !uri) {
    return Response.json({ error: "A valid post link is required." }, { status: 400 });
  }

  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  try {
    if (action === "pin") {
      await pinFeedPost(loaded.repoDid, cookie, uri as string);
    } else {
      await unpinFeedPost(loaded.repoDid, cookie, uri);
    }
    return Response.json({ pinned: action === "pin" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof FeedPinMutationError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not update the pinned post.";
    return Response.json({ error: message }, { status });
  }
}

/** POST /api/admin/feed-pin { uri } — pin a feed post (replaces any prior pin). */
export async function POST(request: Request) {
  return mutate(request, "pin");
}

/** DELETE /api/admin/feed-pin { uri? } — unpin (that post, or everything). */
export async function DELETE(request: Request) {
  return mutate(request, "unpin");
}
