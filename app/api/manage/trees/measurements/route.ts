import { fetchMeasurementsByDid } from "@/app/_lib/indexer";
import { isResponse, resolveManageApiTarget } from "../../_lib/target";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  try {
    const measurements = await fetchMeasurementsByDid(target.did);
    return Response.json(measurements);
  } catch {
    return Response.json({ error: "Could not load measurements." }, { status: 500 });
  }
}
