import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const did = new URL(request.url).searchParams.get("did") ?? "";
  if (!did.startsWith("did:")) {
    return Response.json({ displayName: null, avatarUrl: null }, { status: 400 });
  }
  const card = await getCertifiedProfileCard(did).catch(() => ({ displayName: null, avatarUrl: null }));
  return Response.json(card, { headers: { "cache-control": "private, max-age=300" } });
}
