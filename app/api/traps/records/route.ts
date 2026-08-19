import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  fetchAllTrapRecords,
  TRAP_KILL_COLLECTION,
  TRAP_OBSERVATION_COLLECTION,
  type TrapKill,
  type TrapObservation,
} from "@/app/traps/_lib/trap-records";
import { resolvePdsHost } from "@/app/_lib/pds";

/**
 * Known DIDs that have Trap.NZ field records.
 * Since these collections aren't indexed, we maintain a list of known sources.
 * Add DIDs here as users start using the system.
 */
const KNOWN_TRAP_SOURCES: string[] = [
  // Add known DIDs with trap records here
  // "did:plc:example1",
  // "did:plc:example2",
];

/**
 * GET /api/traps/records
 * Fetches all trap records from known sources and the current user (if signed in).
 */
export async function GET() {
  try {
    const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false as const }));
    
    // Collect all DIDs to query
    const didsToQuery = new Set<string>(KNOWN_TRAP_SOURCES);
    
    // Add the current user's DID if signed in
    if (session.isLoggedIn) {
      didsToQuery.add(session.did);
    }

    // Fetch records from all sources in parallel
    const results = await Promise.all(
      Array.from(didsToQuery).map(async (did) => {
        try {
          return await fetchAllTrapRecords(did);
        } catch {
          // Silently skip DIDs that fail (e.g., PDS unreachable)
          return { kills: [], observations: [] };
        }
      })
    );

    // Merge all results
    const allKills: TrapKill[] = [];
    const allObservations: TrapObservation[] = [];

    for (const result of results) {
      allKills.push(...result.kills);
      allObservations.push(...result.observations);
    }

    // Sort by occurredAt descending
    allKills.sort((a, b) => b.record.occurredAt.localeCompare(a.record.occurredAt));
    allObservations.sort((a, b) => b.record.occurredAt.localeCompare(a.record.occurredAt));

    return NextResponse.json({
      kills: allKills,
      observations: allObservations,
    });
  } catch (error) {
    console.error("Failed to fetch trap records:", error);
    return NextResponse.json(
      { error: "Failed to fetch records" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/traps/records
 * Creates a new trap record for the signed-in user.
 */
export async function POST(request: Request) {
  try {
    const session = await fetchAuthSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { collection, record } = body;

    if (!collection || !record) {
      return NextResponse.json({ error: "Missing collection or record" }, { status: 400 });
    }

    if (collection !== TRAP_KILL_COLLECTION && collection !== TRAP_OBSERVATION_COLLECTION) {
      return NextResponse.json({ error: "Invalid collection" }, { status: 400 });
    }

    // Create the record via the user's PDS
    const host = await resolvePdsHost(session.did);
    if (!host) {
      return NextResponse.json({ error: "Could not resolve PDS" }, { status: 500 });
    }

    // Generate a TID for the record key
    const rkey = generateTid();

    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Note: This requires proper authentication - the client should handle this
        // For now, return guidance that CRUD needs to go through the manage proxy
      },
      body: JSON.stringify({
        repo: session.did,
        collection,
        rkey,
        record,
      }),
    });

    if (!response.ok) {
      // Creating records requires authentication that we don't have here
      // Guide users to use the proper mutation flow
      return NextResponse.json(
        { 
          error: "Record creation requires authentication. Use the GainForest manage flow.",
          hint: "POST to /api/manage/proxy with the record data"
        },
        { status: 501 }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to create trap record:", error);
    return NextResponse.json(
      { error: "Failed to create record" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/traps/records
 * Updates an existing trap record.
 */
export async function PUT(request: Request) {
  try {
    const session = await fetchAuthSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Similar to POST - requires proper auth flow
    return NextResponse.json(
      { 
        error: "Record updates require authentication. Use the GainForest manage flow.",
        hint: "PUT to /api/manage/proxy with the record data"
      },
      { status: 501 }
    );
  } catch (error) {
    console.error("Failed to update trap record:", error);
    return NextResponse.json(
      { error: "Failed to update record" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/traps/records
 * Deletes a trap record.
 */
export async function DELETE(request: Request) {
  try {
    const session = await fetchAuthSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Similar to POST - requires proper auth flow
    return NextResponse.json(
      { 
        error: "Record deletion requires authentication. Use the GainForest manage flow.",
        hint: "DELETE to /api/manage/proxy with the record URI"
      },
      { status: 501 }
    );
  } catch (error) {
    console.error("Failed to delete trap record:", error);
    return NextResponse.json(
      { error: "Failed to delete record" },
      { status: 500 }
    );
  }
}

/**
 * Generate a TID (Timestamp ID) for record keys.
 * TIDs are base32-sortable timestamps used in AT Protocol.
 */
function generateTid(): string {
  const timestamp = Date.now() * 1000; // microseconds
  const clockId = Math.floor(Math.random() * 1024);
  const tid = (BigInt(timestamp) << 10n) | BigInt(clockId);
  return tid.toString(32).padStart(13, "0");
}
