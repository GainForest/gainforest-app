import { fetchAccountSummary } from "@/app/_lib/indexer";
import { resolveIdentifierToDid } from "@/app/account/_lib/account-route";

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

function isSafeDid(value: string): boolean {
  return /^did:[a-z0-9]+:[A-Za-z0-9._%:-]+$/.test(value);
}

/**
 * Comprehensive, public account summary for the feed hover card: identity,
 * bio, location, founding/creation date, kind, and lifetime sighting + Cert
 * counts. Reuses the same builder the account page uses, so the card and the
 * profile stay in sync.
 */
export async function GET(request: Request) {
  const identifier =
    new URL(request.url).searchParams.get("did") ??
    new URL(request.url).searchParams.get("identifier") ??
    "";
  const normalized = normalizeDid(identifier);
  const did = isSafeDid(normalized)
    ? normalized
    : await resolveIdentifierToDid(normalized).catch(() => null);

  if (!did || !isSafeDid(did)) {
    return Response.json({ error: "invalid_did" }, { status: 400 });
  }

  try {
    const summary = await fetchAccountSummary(did);
    return Response.json(summary, {
      headers: { "cache-control": "private, max-age=300" },
    });
  } catch {
    return Response.json({ error: "lookup_failed" }, { status: 502 });
  }
}
