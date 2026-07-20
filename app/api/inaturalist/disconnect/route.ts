import { cookies } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { INATURALIST_CONNECTION_COOKIE } from "@/app/_lib/inaturalist-proof";

export const runtime = "nodejs";

export async function POST() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return Response.json({ error: "Please sign in." }, { status: 401 });
  const cookieStore = await cookies();
  cookieStore.delete(INATURALIST_CONNECTION_COOKIE);
  return Response.json({ ok: true });
}
