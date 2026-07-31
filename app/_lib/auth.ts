export type AuthSession =
  | { isLoggedIn: false }
  | { isLoggedIn: true; did: string; handle: string; email?: string };

export function getAuthBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_AUTH_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_AUTH_BASE_URL is required");
  }
  return baseUrl.replace(/\/$/, "");
}

export function getAuthProvider(): string | null {
  const provider = process.env.NEXT_PUBLIC_AUTH_PROVIDER?.trim();
  return provider || "certs";
}

export function getAuthInternalServiceToken(): string | null {
  return process.env.AUTH_INTERNAL_SERVICE_TOKEN?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

function authSessionCookieName(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host.startsWith("dev.") || host.startsWith("staging.") || host.includes("staging")) {
      return "__Secure_gainforest_staging_session";
    }
  } catch {
    // Fall through to production cookie name.
  }
  return "__Secure_gainforest_session";
}

export function getAuthForwardCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const targetName = authSessionCookieName(getAuthBaseUrl());
  const target = cookies.find((cookie) => cookie.startsWith(`${targetName}=`));
  if (target) return target;

  const authCookies = cookies.filter((cookie) =>
    cookie.startsWith("__Secure_gainforest_session=") ||
    cookie.startsWith("__Secure_gainforest_staging_session="),
  );
  if (authCookies.length === 1) return authCookies[0];

  return cookieHeader;
}

/** Set (with a fresh timestamp) when the user changes their username, so every
 *  server instance they reach re-reads their identity instead of serving a
 *  cached copy for up to the cache TTL. */
export const HANDLE_CHANGED_COOKIE = "gainforest_handle_changed";

const HANDLE_CHANGED_WINDOW_MS = 15 * 60 * 1000;
const HANDLE_CHANGED_BUCKET_MS = 30 * 1000;

/**
 * Freshness marker for the signed-in user's identity lookup, derived from the
 * username-change cookie. Returns a value that changes when the cookie does and
 * is folded into the identity cache key — forcing a fresh lookup on instances
 * still holding the pre-change identity. The value is bucketed and only
 * accepted from a short window, so a forged cookie can't mint unbounded cache
 * keys — and it carries no username, so there is nothing to spoof.
 */
export function getHandleChangeFreshness(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${HANDLE_CHANGED_COOKIE}=`));
  if (!cookie) return null;
  const timestamp = Number(cookie.slice(HANDLE_CHANGED_COOKIE.length + 1));
  if (!Number.isFinite(timestamp)) return null;
  const now = Date.now();
  if (timestamp > now + 60_000 || timestamp < now - HANDLE_CHANGED_WINDOW_MS) return null;
  return String(Math.floor(timestamp / HANDLE_CHANGED_BUCKET_MS));
}

export function parseAuthSession(value: unknown): AuthSession {
  if (
    typeof value === "object" &&
    value !== null &&
    "isLoggedIn" in value &&
    value.isLoggedIn === true &&
    "did" in value &&
    typeof value.did === "string" &&
    "handle" in value &&
    typeof value.handle === "string"
  ) {
    return {
      isLoggedIn: true,
      did: value.did,
      handle: value.handle,
      ...("email" in value && typeof value.email === "string" && value.email.trim()
        ? { email: value.email.trim() }
        : {}),
    };
  }

  return { isLoggedIn: false };
}
