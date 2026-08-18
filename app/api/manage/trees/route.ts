import { fetchOccurrencesByDid } from "@/app/_lib/indexer";
import { isResponse, resolveManageApiTarget } from "../_lib/target";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  try {
    const page = await fetchOccurrencesByDid(target.did, 500);
    return Response.json(page.records);
  } catch {
    return Response.json({ error: "Could not load trees." }, { status: 500 });
  }
}
