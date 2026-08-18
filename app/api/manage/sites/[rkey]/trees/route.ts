import { fetchOccurrencesBySiteRef } from "@/app/_lib/indexer";
import { isResponse, resolveManageApiTarget } from "../../../_lib/target";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ rkey: string }> | { rkey: string };
};

export async function GET(request: Request, context: RouteContext) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  const { rkey } = await context.params;
  if (!rkey || rkey.includes("/")) {
    return Response.json({ error: "Could not check linked trees." }, { status: 400 });
  }

  const siteRef = `at://${target.did}/app.certified.location/${rkey}`;

  try {
    const page = await fetchOccurrencesBySiteRef(target.did, siteRef, 10000);
    return Response.json({
      trees: page.records.map((tree) => ({
        uri: tree.atUri,
        rkey: tree.rkey,
        scientificName: tree.scientificName,
        decimalLatitude: tree.lat,
        decimalLongitude: tree.lon,
      })),
      truncated: page.hasMore,
    });
  } catch {
    return Response.json({ error: "Could not check linked trees." }, { status: 502 });
  }
}
