// Shared ATProto OAuth config.
//
// Port of simocracy-v2's `lib/config.ts`, slimmed down to what gainforest's
// landing actually needs. Key differences:
//
//  - We don't run on Vercel-with-Upstash here, so the redis-state-store has
//    been replaced with an in-memory store (see `auth-store.ts`). That means
//    sign-in state survives one serverless invocation only; it is *fine* for
//    a single-instance Next.js dev/prod deploy, and will need a real KV store
//    if this app is ever fanned out across multiple workers.
//  - No "ePDS" multi-PDS routing — the landing always points at the PDS the
//    user types into the sign-in form, so we just call `client.authorize()`
//    with that string directly.
//
// The OAuth scope is identical to simocracy's so any session can read/write
// the same way through `@atproto/api`'s Agent.

export const OAUTH_SCOPE = "atproto transition:generic";

function getBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3030";
}

function isLoopback(url: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)/.test(url);
}

const baseUrl = getBaseUrl();
const isLoopbackMode = isLoopback(baseUrl);
const isProduction = process.env.NODE_ENV === "production";

// In loopback dev mode ATProto OAuth has a special client_id form that
// encodes the scope and redirect_uri in the query string; in production
// we serve a /client-metadata.json document at a stable URL instead. This
// matches simocracy's behaviour 1:1.
function buildClientId(): { clientId: string; redirectUri: string } {
  if (isLoopbackMode) {
    const loopbackBase = baseUrl.replace("localhost", "127.0.0.1");
    const redirectUri = `${loopbackBase}/api/oauth/callback`;
    const url = new URL("http://localhost");
    url.searchParams.set("scope", OAUTH_SCOPE);
    url.searchParams.set("redirect_uri", redirectUri);
    return { clientId: url.toString(), redirectUri };
  }
  return {
    clientId: `${baseUrl}/client-metadata.json`,
    redirectUri: `${baseUrl}/api/oauth/callback`,
  };
}

const { clientId, redirectUri } = buildClientId();

export const authConfig = {
  baseUrl,
  isLoopback: isLoopbackMode,
  isProduction,
  clientId,
  redirectUri,
  scope: OAUTH_SCOPE,
  jwkPrivate: process.env.ATPROTO_JWK_PRIVATE,
} as const;
