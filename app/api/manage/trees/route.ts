import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchOccurrencesByDid } from "@/app/_lib/indexer";

export const runtime = "nodejs";

export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const page = await fetchOccurrencesByDid(session.did, 500);
    return Response.json(page.records);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch trees";
    return Response.json({ error: message }, { status: 500 });
  }
}
