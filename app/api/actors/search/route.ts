import { getCertifiedProfileCard, resolveIdentifierToDid } from "@/app/account/_lib/account-route";

export const runtime = "nodejs";

/**
 * Typeahead search for app accounts, used by the Bumicert contributor picker.
 * It only returns app certified profile data; Bluesky profile data is not used.
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

  const did = await resolveIdentifierToDid(query).catch(() => null);
  if (!did) return Response.json({ results: [] as ActorResult[] });

  const card = await getCertifiedProfileCard(did).catch(() => null);
  return Response.json({
    results: [{
      did,
      handle: card?.handle ?? null,
      displayName: card?.displayName ?? null,
      avatar: card?.avatarUrl ?? null,
    }],
  });
}
