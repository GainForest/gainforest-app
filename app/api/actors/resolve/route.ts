import { NextRequest } from "next/server";
import { getCertifiedProfileCard, resolveIdentifierToDid } from "@/app/account/_lib/account-route";

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

  const card = await getCertifiedProfileCard(did).catch(() => null);
  const actor: ActorResult = {
    did,
    handle: card?.handle ?? null,
    displayName: card?.displayName ?? null,
    avatar: card?.avatarUrl ?? null,
  };

  return Response.json({ actor });
}
