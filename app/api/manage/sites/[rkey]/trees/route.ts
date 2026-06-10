import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchOccurrencesBySiteRef } from "@/app/_lib/indexer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ rkey: string }> | { rkey: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Please sign in and try again." }, { status: 401 });
  }

  const { rkey } = await context.params;
  if (!rkey || rkey.includes("/")) {
    return Response.json({ error: "Could not check linked trees." }, { status: 400 });
  }

  const siteRef = `at://${session.did}/app.certified.location/${rkey}`;

  try {
    const page = await fetchOccurrencesBySiteRef(session.did, siteRef, 10000);
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
