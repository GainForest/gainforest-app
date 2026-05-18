import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getClient } from "../../../_lib/auth-client";
import { authConfig } from "../../../_lib/auth-config";
import { cookieSessionStore } from "../../../_lib/auth-store";
import { SESSION_COOKIE } from "../../../_lib/auth-session";

// Port of simocracy-v2/app/api/oauth/callback/route.ts.
//
// The user just came back from their PDS with `?code=...&state=...`. The
// SDK exchanges those for a real DPoP-bound session and stores it in our
// session store. We then issue an opaque cookie token mapped to the DID.
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const client = await getClient();
    const { session } = await client.callback(req.nextUrl.searchParams);

    const token = randomBytes(32).toString("base64url");
    await cookieSessionStore.set(token, session.did);

    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: authConfig.isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return NextResponse.redirect(new URL("/", authConfig.baseUrl));
  } catch (error) {
    console.error("[oauth/callback] failed", error);
    return NextResponse.redirect(
      new URL("/?error=auth_failed", authConfig.baseUrl),
    );
  }
}
