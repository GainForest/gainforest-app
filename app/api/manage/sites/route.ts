import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchLocationsByDid } from "@/app/_lib/indexer";

export const runtime = "nodejs";

export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const locations = await fetchLocationsByDid(session.did);
    return Response.json(locations);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch sites";
    return Response.json({ error: message }, { status: 500 });
  }
}
