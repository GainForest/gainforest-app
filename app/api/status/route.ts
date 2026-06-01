import { NextResponse } from "next/server";
import { fetchStatusDetailed } from "../../_lib/status";

// Same-origin JSON the status board re-polls every 60s. Fetching the instatus
// page HTML (for uptime % + incident history) can't be done from the browser
// (no CORS on the HTML document), so the enrichment happens here server-side
// and the client only ever talks to this route.
export const revalidate = 60;

export async function GET() {
  const snapshot = await fetchStatusDetailed({ revalidate: 60 });
  return NextResponse.json(snapshot, {
    headers: { "cache-control": "s-maxage=60, stale-while-revalidate=120" },
  });
}
