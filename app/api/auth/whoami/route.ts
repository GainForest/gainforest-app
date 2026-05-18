import { NextResponse } from "next/server";
import { getSession } from "../../../_lib/auth-session";

// Tiny endpoint the client can hit to find out whether the current
// browser is signed in, without doing a full SSR pass. Returns
// { signedIn, did } where `did` is only present when signedIn is true.
export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    signedIn: !!session,
    did: session?.did ?? null,
  });
}
