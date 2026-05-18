import { NextResponse } from "next/server";
import { authConfig, OAUTH_SCOPE } from "../_lib/auth-config";

// OAuth client metadata document, served at /client-metadata.json.
// Production deploys use this as their `client_id`; loopback dev uses
// a special encoded URL instead (see auth-config.ts) and never fetches
// this route.
export async function GET() {
  return NextResponse.json({
    client_id: authConfig.clientId,
    client_name: "GainForest",
    client_uri: authConfig.baseUrl,
    redirect_uris: [authConfig.redirectUri],
    scope: OAUTH_SCOPE,
    logo_uri: `${authConfig.baseUrl}/decor/gainforest-logo.webp`,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: authConfig.isLoopback ? "native" : "web",
    dpop_bound_access_tokens: true,
  });
}
