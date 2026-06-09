import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchOccurrencesByDid } from "@/app/_lib/indexer";

export const runtime = "nodejs";

export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }
  try {
    const page = await fetchOccurrencesByDid(session.did, 500);
    return Response.json(page.records);
  } catch {
    return Response.json({ error: "Could not load trees." }, { status: 500 });
  }
}
