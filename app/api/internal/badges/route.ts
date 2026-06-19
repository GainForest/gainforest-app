import { getInternalBadgeAccess } from "@/app/internal/badges/_lib/access";
import { fetchInternalBadgeData } from "@/app/internal/badges/_lib/badge-records";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await getInternalBadgeAccess();
  if (!access.isLoggedIn) {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }
  if (!access.configured || !access.allowed || !access.repoDid) {
    return Response.json({ error: "You do not have access to this dashboard." }, { status: 403 });
  }

  const includeAwards = new URL(request.url).searchParams.get("includeAwards") === "1";
  const data = await fetchInternalBadgeData(access.repoDid, { includeAwards });
  return Response.json(
    { ...data, writeRepo: access.writeRepo },
    { headers: { "cache-control": "no-store" } },
  );
}
