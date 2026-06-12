import { getCertifiedProfileCard, resolveIdentifierToDid } from "@/app/account/_lib/account-route";

export const runtime = "nodejs";

function normalizeDid(value: string): string {
  let current = value.trim();
  for (let i = 0; i < 3; i++) {
    if (current.startsWith("did:")) return current;
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

export async function GET(request: Request) {
  const identifier = new URL(request.url).searchParams.get("did") ?? new URL(request.url).searchParams.get("identifier") ?? "";
  const normalized = normalizeDid(identifier);
  const did = normalized.startsWith("did:") ? normalized : await resolveIdentifierToDid(normalized).catch(() => null);
  if (!did?.startsWith("did:")) {
    return Response.json({ displayName: null, description: null, avatarUrl: null, handle: null }, { status: 400 });
  }
  const card = await getCertifiedProfileCard(did).catch(() => ({ displayName: null, description: null, avatarUrl: null, handle: null }));
  return Response.json(card, { headers: { "cache-control": "private, max-age=300" } });
}
