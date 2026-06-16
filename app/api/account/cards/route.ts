import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 50;

type AccountCardProfile = {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatar: string | null;
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

function requestedDids(request: Request): string[] {
  const { searchParams } = new URL(request.url);
  const raw = [
    ...searchParams.getAll("did"),
    ...searchParams.getAll("dids").flatMap((value) => value.split(",")),
  ];
  const dids = raw
    .map(normalizeDid)
    .filter((value) => value.startsWith("did:"));
  return [...new Set(dids)].slice(0, MAX_BATCH_SIZE);
}

export async function GET(request: Request) {
  const dids = requestedDids(request);
  if (dids.length === 0) {
    return Response.json({ profiles: [] as AccountCardProfile[] }, { status: 400 });
  }

  const profiles = await Promise.all(
    dids.map(async (did): Promise<AccountCardProfile> => {
      const card = await getCertifiedProfileCard(did).catch(() => ({
        displayName: null,
        avatarUrl: null,
        handle: null,
      }));
      return {
        did,
        handle: nonEmpty(card.handle),
        displayName: nonEmpty(card.displayName),
        avatar: nonEmpty(card.avatarUrl),
      };
    }),
  );

  return Response.json({ profiles }, { headers: { "cache-control": "private, max-age=300" } });
}
