import { NextResponse } from "next/server";
import { fetchDevices } from "../../_lib/devices";

// JSON endpoint the client-side device monitor re-polls (every 60s, matching
// the Pi heartbeat cadence). Reads HEALTHCHECKS_API_KEY server-side so the
// secret never reaches the browser; the response carries only the sanitized
// liveness snapshot.
export const revalidate = 30;

export async function GET() {
  const snapshot = await fetchDevices();
  return NextResponse.json(snapshot, {
    headers: { "cache-control": "s-maxage=30, stale-while-revalidate=60" },
  });
}
