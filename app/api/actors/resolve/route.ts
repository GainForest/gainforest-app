import { NextRequest } from "next/server";

type ActorResult = {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatar: string | null;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return Response.json({ actor: null });

  try {
    const url = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(q)}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return Response.json({ actor: null });
    const actor = (await res.json()) as { did?: string; handle?: string; displayName?: string; avatar?: string };
    if (!actor.did) return Response.json({ actor: null });

    const result: ActorResult = {
      did: actor.did,
      handle: actor.handle ?? null,
      displayName: actor.displayName ?? null,
      avatar: actor.avatar ?? null,
    };

    return Response.json({ actor: result });
  } catch {
    return Response.json({ actor: null });
  }
}
