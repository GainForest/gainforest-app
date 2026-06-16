import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import { fetchIndexedCertifiedProfileCards, type IndexedCertifiedProfileCard } from "@/app/_lib/indexer";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 50;

type AccountCardProfile = {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatar: string | null;
};

type DirectAccountCard = {
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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

function isSafeDid(value: string): boolean {
  return /^did:[a-z0-9]+:[A-Za-z0-9._%:-]+$/.test(value);
}

function requestedDids(request: Request): string[] {
  const { searchParams } = new URL(request.url);
  const raw = [
    ...searchParams.getAll("did"),
    ...searchParams.getAll("dids").flatMap((value) => value.split(",")),
  ];
  const dids = raw
    .map(normalizeDid)
    .filter(isSafeDid);
  return [...new Set(dids)].slice(0, MAX_BATCH_SIZE);
}

export async function GET(request: Request) {
  const dids = requestedDids(request);
  if (dids.length === 0) {
    return Response.json({ profiles: [] as AccountCardProfile[] }, { status: 400 });
  }

  const indexedByDid = await fetchIndexedCertifiedProfileCards(dids).catch(
    () => new Map<string, IndexedCertifiedProfileCard>(),
  );
  const needsDirectRead = dids.filter((did) => {
    const indexed = indexedByDid.get(did);
    return !indexed?.displayName || !indexed?.avatarUrl;
  });
  const directEntries = await Promise.all(
    needsDirectRead.map(async (did): Promise<[string, DirectAccountCard]> => [
      did,
      await getCertifiedProfileCard(did).catch(() => ({ displayName: null, avatarUrl: null, handle: null })),
    ]),
  );
  const directByDid = new Map(directEntries);

  const profiles = dids.map((did): AccountCardProfile => {
    const indexed = indexedByDid.get(did);
    const direct = directByDid.get(did);
    return {
      did,
      handle: nonEmpty(direct?.handle),
      displayName: nonEmpty(indexed?.displayName) ?? nonEmpty(direct?.displayName),
      avatar: nonEmpty(indexed?.avatarUrl) ?? nonEmpty(direct?.avatarUrl),
    };
  });

  return Response.json({ profiles }, { headers: { "cache-control": "private, max-age=300" } });
}
