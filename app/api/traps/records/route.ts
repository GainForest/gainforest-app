import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolvePdsHost } from "@/app/_lib/pds";
import {
  TRAP_KILL_COLLECTION,
  TRAP_OBSERVATION_COLLECTION,
  type TrapKill,
  type TrapKillRecord,
  type TrapObservation,
  type TrapObservationRecord,
} from "@/app/traps/_lib/trap-records";

/**
 * AT-Protocol repos that hold Trap.NZ field records (`nz.trap.field.*`).
 *
 * There is no public XRPC endpoint that answers "which DIDs hold this
 * collection" — `com.atproto.repo.listRecords` is strictly per-repo, and repo
 * discovery only happens by listening to the firehose or querying a relay's
 * backing index (the app's indexer doesn't know `nz.trap.*`). So the roster
 * of trusted sources is maintained here.
 *
 * Add a DID or handle (both are resolved) whenever someone records via Trap.NZ.
 * The signed-in user's own repo is always included on top of this roster.
 */
const TRAP_SOURCES: string[] = [
  "satyam-mishra.bsky.social",
];

/** Resolve a handle to a DID via its PDS. */
async function resolveHandleToDid(handle: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { did?: unknown };
    return typeof data.did === "string" ? data.did : null;
  } catch {
    return null;
  }
}

/** Fetch all records of one collection from a DID's PDS, paged. */
async function fetchCollection<T>(
  did: string,
  collection: string,
): Promise<TripRecordList<T>> {
  const host = await resolvePdsHost(did).catch(() => null);
  if (!host) return { records: [] };

  const records: TripRecordList<T>["records"] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      repo: did,
      collection,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(
      `https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
      { cache: "no-store" },
    ).catch(() => null);
    if (!res?.ok) break;

    const payload = (await res.json().catch(() => null)) as ListRecordsResponse | null;
    for (const entry of payload?.records ?? []) {
      if (typeof entry !== "object" || entry === null) continue;
      const uri = typeof entry.uri === "string" ? entry.uri : "";
      const value = entry.value;
      if (!uri || typeof value !== "object" || value === null) continue;
      records.push({ uri, rkey: uri.split("/").pop() ?? "", did, record: value as T });
    }

    cursor = typeof payload?.cursor === "string" ? payload.cursor : undefined;
    if (!cursor) break;
  }

  return { records };
}

type TripRecordList<T> = { records: { uri: string; rkey: string; did: string; record: T }[] };
type ListRecordsResponse = { records?: Array<{ uri?: string; value?: unknown } | null>; cursor?: string };

/**
 * GET /api/traps/records
 * Fetches all trap kill + observation records from:
 *   1. The known TRAP_SOURCES roster (handles/DIDs resolved)
 *   2. The signed-in user's own repo (if authenticated)
 *
 * Returns them merged & newest-first. If nothing is loaded, `sources` tells
 * the client how many repos were queried so the empty state can explain itself.
 */
export async function GET() {
  try {
    const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false as const }));

    // Build the set of DIDs to query: roster (resolve handles→DIDs) + current user.
    const didSet = new Set<string>();
    for (const source of TRAP_SOURCES) {
      const did = source.startsWith("did:") ? source : await resolveHandleToDid(source);
      if (did) didSet.add(did);
    }
    if (session.isLoggedIn) didSet.add(session.did);

    if (didSet.size === 0) {
      return NextResponse.json({ kills: [], observations: [], sources: 0 });
    }

    const dids = Array.from(didSet);
    const [killsFromAll, obsFromAll] = await Promise.all([
      Promise.all(dids.map((d) => fetchCollection<TrapKillRecord>(d, TRAP_KILL_COLLECTION))),
      Promise.all(dids.map((d) => fetchCollection<TrapObservationRecord>(d, TRAP_OBSERVATION_COLLECTION))),
    ]);

    const kills: TrapKill[] = killsFromAll.flatMap((r) => r.records);
    const observations: TrapObservation[] = obsFromAll.flatMap((r) => r.records);

    kills.sort((a, b) => b.record.occurredAt.localeCompare(a.record.occurredAt));
    observations.sort((a, b) => b.record.occurredAt.localeCompare(a.record.occurredAt));

    return NextResponse.json({ kills, observations, sources: dids.length });
  } catch (error) {
    console.error("Failed to fetch trap records:", error);
    return NextResponse.json({ error: "Failed to fetch records" }, { status: 500 });
  }
}

/**
 * POST /api/traps/records
 * Creates a kill/observation record on the signed-in user's repo.
 * Write goes through the auth-service's mutation endpoint (the same path the
 * manage proxy uses) so it carries the caller's session as the record owner.
 */
export async function POST(request: Request) {
  try {
    const session = await fetchAuthSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Sign in to add a record" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      collection?: unknown;
      record?: unknown;
    } | null;
    const collection = body?.collection as string | undefined;
    const record = body?.record as Record<string, unknown> | undefined;

    if (!collection || !record) {
      return NextResponse.json({ error: "Missing collection or record" }, { status: 400 });
    }
    if (collection !== TRAP_KILL_COLLECTION && collection !== TRAP_OBSERVATION_COLLECTION) {
      return NextResponse.json({ error: "Invalid collection" }, { status: 400 });
    }

    // Delegate the write to the centralized group/record mutation path so the
    // app-level rules (ownership, permissions) apply uniformly. The manage
    // proxy forwards to the auth-service's record-create endpoint using the
    // caller's session cookie.
    const cgsUrl = process.env.NEXT_PUBLIC_CGS_URL || process.env.CGS_URL;
    if (!cgsUrl) {
      return NextResponse.json(
        { error: "Record service is not configured on this deployment." },
        { status: 501 },
      );
    }

    const response = await fetch(`${cgsUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ repo: session.did, collection, record }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (!response.ok) {
      return NextResponse.json(
        { error: typeof payload.error === "string" ? payload.error : "Could not create record" },
        { status: response.status },
      );
    }

    return NextResponse.json({ ok: true, ...payload }, { status: 200 });
  } catch (error) {
    console.error("Failed to create trap record:", error);
    return NextResponse.json({ error: "Failed to create record" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
