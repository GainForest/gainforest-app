import { getCertifiedProfileCard, resolveIdentifierToDid } from "@/app/account/_lib/account-route";
import { fetchBlueskyProfileCard, resolveBlueskyHandleToDid } from "@/app/_lib/bluesky-profile";

export const runtime = "nodejs";

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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
  // Fall back to the atproto/Bluesky appview so external Bluesky handles
  // (e.g. alice.bsky.social) that don't publish a well-known/DNS record still
  // resolve to a DID and can be added as members.
  const blueskyDid = await resolveBlueskyHandleToDid(identifier).catch(() => null);
  return blueskyDid?.startsWith("did:") ? blueskyDid : null;
}

export async function GET(request: Request) {
  const identifier = normalizeIdentifier(new URL(request.url).searchParams.get("identifier") ?? "");
  if (!identifier) {
    return Response.json({ error: "Enter a member username." }, { status: 400 });
  }

  if (isLikelyEmail(identifier)) {
    return Response.json(
      { error: "Enter a username or Bluesky handle here. Use the email field to send an email invitation." },
      { status: 422 },
    );
  }

  const did = await resolveMemberDid(identifier);

  if (!did?.startsWith("did:")) {
    return Response.json({ error: "We could not find that member. Check the username and try again." }, { status: 404 });
  }

  const card = await getCertifiedProfileCard(did).catch(() => ({
    displayName: null,
    description: null,
    avatarUrl: null,
    handle: null,
  }));

  let displayName = nonEmpty(card.displayName);
  let avatarUrl = nonEmpty(card.avatarUrl);
  let handle = nonEmpty(card.handle);

  // For accounts without a Certified profile (e.g. external Bluesky users), fall
  // back to the public Bluesky profile so the person adding them can confirm who
  // they picked.
  if (!displayName || !avatarUrl || !handle) {
    const bluesky = await fetchBlueskyProfileCard(did).catch(() => null);
    if (bluesky) {
      displayName = displayName ?? nonEmpty(bluesky.displayName);
      avatarUrl = avatarUrl ?? nonEmpty(bluesky.avatarUrl);
      handle = handle ?? nonEmpty(bluesky.handle);
    }
  }

  return Response.json(
    { did, displayName, avatarUrl, handle },
    { headers: { "cache-control": "private, max-age=300" } },
  );
}
