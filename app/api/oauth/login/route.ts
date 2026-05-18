import { NextRequest, NextResponse } from "next/server";
import { getClient } from "../../../_lib/auth-client";
import { authConfig, OAUTH_SCOPE } from "../../../_lib/auth-config";

// Port of simocracy-v2/app/api/oauth/login/route.ts.
//
// Accepts `?handle=<atproto-handle-or-pds-url>` from the form on the
// landing page, kicks off the ATProto OAuth flow with PAR (handled inside
// the SDK), and redirects the browser to the upstream authorisation server.
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const handle =
      req.nextUrl.searchParams.get("handle") ??
      req.nextUrl.searchParams.get("identifier") ??
      "";
    if (!handle) {
      return NextResponse.redirect(
        new URL("/?error=missing_handle", authConfig.baseUrl),
      );
    }
    const client = await getClient();
    const authUrl = await client.authorize(handle, { scope: OAUTH_SCOPE });
    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error("[oauth/login] failed", error);
    return NextResponse.redirect(
      new URL("/?error=auth_failed", authConfig.baseUrl),
    );
  }
}
