import { NextRequest } from "next/server";
import { getCertifiedProfileCard, resolveIdentifierToDid } from "@/app/account/_lib/account-route";
import { fetchBlueskyProfileCard } from "@/app/_lib/bluesky-profile";

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

  const did = await resolveIdentifierToDid(q).catch(() => null);
  if (!did) return Response.json({ actor: null });

  const [card, bsky] = await Promise.all([
    getCertifiedProfileCard(did).catch(() => null),
    fetchBlueskyProfileCard(did).catch(() => null),
  ]);
  const actor: ActorResult = {
    did,
    handle: card?.handle ?? bsky?.handle ?? null,
    displayName: card?.displayName ?? bsky?.displayName ?? null,
    avatar: card?.avatarUrl ?? bsky?.avatarUrl ?? null,
  };

  return Response.json({ actor });
}
