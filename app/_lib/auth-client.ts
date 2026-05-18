import "server-only";
import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { JoseKey } from "@atproto/jwk-jose";
import type { OAuthClientMetadataInput } from "@atproto/oauth-types";
import type { Jwk } from "@atproto/jwk";
import { authConfig } from "./auth-config";
import { stateStore, sessionStore } from "./auth-store";

// Port of simocracy's `lib/atproto-sdk.ts`. Lazy-initialised singleton so
// async key loading happens once per process.

let _client: NodeOAuthClient | null = null;

async function buildKeyset() {
  const raw = authConfig.jwkPrivate;
  if (!raw) {
    throw new Error(
      "Missing ATPROTO_JWK_PRIVATE. Generate one via:\n" +
        "  node -e \"require('crypto').generateKeyPair('ec',{ namedCurve:'P-256' }, ...)\"" +
        "\nor copy `scripts/generate-jwk.mjs` from simocracy-v2.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ATPROTO_JWK_PRIVATE is not valid JSON.");
  }
  const jwkObjects: Record<string, unknown>[] = Array.isArray(
    (parsed as Record<string, unknown>).keys,
  )
    ? (parsed as { keys: Record<string, unknown>[] }).keys
    : [parsed as Record<string, unknown>];
  return Promise.all(
    jwkObjects.map((jwk) =>
      JoseKey.fromImportable(jwk as Jwk, (jwk.kid as string) || "key-1"),
    ),
  );
}

export async function getClient(): Promise<NodeOAuthClient> {
  if (_client) return _client;
  const keyset = await buildKeyset();
  const clientMetadata: OAuthClientMetadataInput = {
    client_id: authConfig.clientId,
    client_name: "GainForest",
    client_uri: authConfig.baseUrl,
    redirect_uris: [authConfig.redirectUri],
    scope: authConfig.scope,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: authConfig.isLoopback ? "native" : "web",
    token_endpoint_auth_method: "none",
    dpop_bound_access_tokens: true,
  };
  _client = new NodeOAuthClient({
    clientMetadata,
    keyset,
    stateStore,
    sessionStore,
  });
  return _client;
}
