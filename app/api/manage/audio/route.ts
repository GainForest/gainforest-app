import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchAudioWorkspaceByDid } from "@/app/_lib/indexer";

export const runtime = "nodejs";

export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const audio = await fetchAudioWorkspaceByDid(session.did);
    return Response.json(audio);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch audio";
    return Response.json({ error: message }, { status: 500 });
  }
}
