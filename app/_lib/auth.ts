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
