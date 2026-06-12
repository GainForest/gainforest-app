import { fetchMultimediaByDid } from "@/app/_lib/indexer";
import { isResponse, resolveManageApiTarget } from "../../_lib/target";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  try {
    const photos = await fetchMultimediaByDid(target.did);
    return Response.json(photos);
  } catch {
    return Response.json({ error: "Could not load photos." }, { status: 500 });
  }
}
