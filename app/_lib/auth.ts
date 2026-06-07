const DEFAULT_AUTH_BASE_URL = "https://auth.gainforest.app";

export type AuthSession =
  | { isLoggedIn: false }
  | { isLoggedIn: true; did: string; handle: string };

export function getAuthBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_AUTH_BASE_URL || DEFAULT_AUTH_BASE_URL).replace(/\/$/, "");
}

export function getAuthProvider(): string | null {
  const provider = process.env.NEXT_PUBLIC_AUTH_PROVIDER?.trim();
  return provider || "certs";
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
    return { isLoggedIn: true, did: value.did, handle: value.handle };
  }

  return { isLoggedIn: false };
}
