import { getCertifiedProfileCard, resolveIdentifierToDid } from "@/app/account/_lib/account-route";

export const runtime = "nodejs";

function normalizeIdentifier(value: string): string {
  let current = value.trim();
  for (let i = 0; i < 3; i += 1) {
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

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function memberHandleCandidates(identifier: string): string[] {
  const cleaned = identifier.trim().replace(/^@+/, "");
  if (!cleaned || cleaned.startsWith("did:")) return [cleaned];

  const candidates = [cleaned];
  const defaultDomain = (process.env.NEXT_PUBLIC_DEFAULT_PDS_DOMAIN || process.env.DEFAULT_PDS_DOMAIN || "certified.one")
    .trim()
    .replace(/^@+|\.+$/g, "");
  if (!cleaned.includes(".") && defaultDomain) candidates.push(`${cleaned}.${defaultDomain}`);
  return Array.from(new Set(candidates));
}

async function resolveMemberDid(identifier: string): Promise<string | null> {
  if (identifier.startsWith("did:")) return identifier;
  for (const candidate of memberHandleCandidates(identifier)) {
    const did = await resolveIdentifierToDid(candidate).catch(() => null);
    if (did?.startsWith("did:")) return did;
  }
  return null;
}

export async function GET(request: Request) {
  const identifier = normalizeIdentifier(new URL(request.url).searchParams.get("identifier") ?? "");
  if (!identifier) {
    return Response.json({ error: "Enter a member email or username." }, { status: 400 });
  }

  if (isLikelyEmail(identifier)) {
    return Response.json(
      { error: "Email invitations are not connected yet. Use this person’s GainForest username for now." },
      { status: 422 },
    );
  }

  const did = await resolveMemberDid(identifier);

  if (!did?.startsWith("did:")) {
    return Response.json({ error: "We could not find that member. Check the email or username and try again." }, { status: 404 });
  }

  const card = await getCertifiedProfileCard(did).catch(() => ({
    displayName: null,
    description: null,
    avatarUrl: null,
    handle: null,
  }));

  return Response.json(
    {
      did,
      displayName: card.displayName,
      avatarUrl: card.avatarUrl,
      handle: card.handle,
    },
    { headers: { "cache-control": "private, max-age=300" } },
  );
}
