export const runtime = "nodejs";

/**
 * Typeahead search for ATProto actors (people & orgs), used by the Bumicert
 * contributor picker. Proxies the public Bluesky AppView so the browser avoids
 * CORS and we can normalise the shape. No auth required — it returns only
 * public directory data.
 */

type ActorResult = {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatar: string | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return Response.json({ results: [] as ActorResult[] });
  }

  try {
    const url = `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(query)}&limit=8`;
    const res = await fetch(url, { headers: { accept: "application/json" }, next: { revalidate: 60 } });
    if (!res.ok) return Response.json({ results: [] as ActorResult[] });
    const json = (await res.json()) as { actors?: Array<{ did: string; handle?: string; displayName?: string; avatar?: string }> };
    const results: ActorResult[] = Array.isArray(json.actors)
      ? json.actors.map((actor) => ({
          did: actor.did,
          handle: actor.handle ?? null,
          displayName: actor.displayName ?? null,
          avatar: actor.avatar ?? null,
        }))
      : [];
    return Response.json({ results });
  } catch {
    return Response.json({ results: [] as ActorResult[] });
  }
}
