import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchTainaDashboard } from "@/app/_lib/taina-agent";

export const dynamic = "force-dynamic";

/**
 * GET /api/taina/dashboard
 * Returns the signed-in user's Tainá bot status, API key and live observation
 * chat, read from the agent runtime. Session-gated; the DID comes from the
 * bumicerts session, never the client.
 */
export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  try {
    const { ok, status, data } = await fetchTainaDashboard(session.did);
    if (!ok) {
      return NextResponse.json({ error: data.error ?? "dashboard_failed" }, { status });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("[taina] dashboard failed", error);
    return NextResponse.json({ error: "runtime_unreachable" }, { status: 502 });
  }
}
