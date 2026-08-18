import { fetchAudioWorkspaceByDid } from "@/app/_lib/indexer";
import { isResponse, resolveManageApiTarget } from "../_lib/target";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  try {
    const audio = await fetchAudioWorkspaceByDid(target.did);
    return Response.json(audio);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch audio";
    return Response.json({ error: message }, { status: 500 });
  }
}
