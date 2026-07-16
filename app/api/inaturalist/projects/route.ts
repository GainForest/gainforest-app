import { cookies } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchINaturalistUserProjects } from "@/app/_lib/inaturalist-server";
import { INATURALIST_CONNECTION_COOKIE, unsealJson, type INaturalistConnection } from "@/app/_lib/inaturalist-proof";

export const runtime = "nodejs";

export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return Response.json({ error: "Please sign in." }, { status: 401 });

  const cookieStore = await cookies();
  const connection = unsealJson<INaturalistConnection>(cookieStore.get(INATURALIST_CONNECTION_COOKIE)?.value);
  if (!connection || connection.ownerDid !== session.did) {
    return Response.json({ error: "Verify your iNaturalist account in Settings first." }, { status: 401 });
  }

  try {
    const projects = await fetchINaturalistUserProjects(connection.userId);
    return Response.json({ projects });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load iNaturalist projects." }, { status: 400 });
  }
}
