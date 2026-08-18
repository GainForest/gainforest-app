import { getCertifiedProfileCard, resolveIdentifierToDid } from "@/app/account/_lib/account-route";
import { searchAccountsByName } from "@/app/_lib/indexer";
import { fetchBlueskyProfileCard, searchBlueskyActors } from "@/app/_lib/bluesky-profile";
import { resolveBlobUrl, resolveDidHandle } from "@/app/_lib/pds";

export const runtime = "nodejs";

/**
 * Typeahead search for the contributor / people pickers.
 *
 * Combines three sources, deduped by DID:
 * 1. Exact handle/DID resolution (e.g. `alice.bsky.social`, `did:plc:…`).
 * 2. Certified-network accounts matched by display name (indexer).
 * 3. Public Bluesky actors matched by name or handle (appview typeahead), so
 *    anyone with a Bluesky profile can be found even without a certified one.
 */

type ActorResult = {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatar: string | null;
};

const MAX_RESULTS = 8;

/** Only attempt exact identifier resolution for DID-ish / handle-ish input;
 *  free-text names (spaces, no dot) can never resolve and just waste time. */
function looksLikeIdentifier(query: string): boolean {
  const cleaned = query.replace(/^@+/, "");
  if (cleaned.startsWith("did:")) return true;
  return !cleaned.includes(" ") && cleaned.includes(".");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return Response.json({ results: [] as ActorResult[] });
  }

  const [exact, certified, bluesky] = await Promise.all([
    looksLikeIdentifier(query) ? resolveExactActor(query) : Promise.resolve(null),
    searchAccountsByName(query, MAX_RESULTS).catch(() => []),
    searchBlueskyActors(query, MAX_RESULTS).catch(() => []),
  ]);

  const blueskyByDid = new Map(bluesky.map((actor) => [actor.did, actor]));

  const results: ActorResult[] = [];
  const seen = new Set<string>();
  const push = (actor: ActorResult) => {
    if (seen.has(actor.did) || results.length >= MAX_RESULTS) return;
    seen.add(actor.did);
    results.push(actor);
  };

  if (exact) push(exact);

  // Certified-network matches first. The handle comes from the account's DID
  // document (same cached fetch as the avatar's PDS resolution); Bluesky data
  // fills any gaps when the same account also showed up in the appview search.
  const certifiedCards = await Promise.all(
    certified.map(async (account) => {
      const bsky = blueskyByDid.get(account.did) ?? null;
      const [avatar, handle] = await Promise.all([
        resolveBlobUrl(account.did, account.avatarRef).catch(() => null),
        resolveDidHandle(account.did).catch(() => null),
      ]);
      return {
        did: account.did,
        handle: handle ?? bsky?.handle ?? null,
        displayName: account.displayName,
        avatar: avatar ?? bsky?.avatarUrl ?? null,
      } satisfies ActorResult;
    }),
  );
  for (const card of certifiedCards) push(card);

  // Then anyone else with a public Bluesky profile.
  for (const actor of bluesky) {
    push({
      did: actor.did,
      handle: actor.handle,
      displayName: actor.displayName,
      avatar: actor.avatarUrl,
    });
  }

  return Response.json({ results });
}

async function resolveExactActor(query: string): Promise<ActorResult | null> {
  const did = await resolveIdentifierToDid(query).catch(() => null);
  if (!did) return null;

  const [card, bsky] = await Promise.all([
    getCertifiedProfileCard(did).catch(() => null),
    fetchBlueskyProfileCard(did).catch(() => null),
  ]);
  return {
    did,
    handle: card?.handle ?? bsky?.handle ?? null,
    displayName: card?.displayName ?? bsky?.displayName ?? null,
    avatar: card?.avatarUrl ?? bsky?.avatarUrl ?? null,
  };
}
