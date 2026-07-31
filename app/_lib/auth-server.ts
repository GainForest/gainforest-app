import { headers } from "next/headers";
import {
  getAuthBaseUrl,
  getAuthForwardCookie,
  getHandleChangeFreshness,
  parseAuthSession,
  type AuthSession,
} from "./auth";
import { resolveDidIdentity } from "./did-identity";

export async function fetchAuthSession(): Promise<AuthSession> {
  try {
    const headerList = await headers();
    const cookieHeader = headerList.get("cookie");
    const cookie = getAuthForwardCookie(cookieHeader);

    const response = await fetch(`${getAuthBaseUrl()}/api/auth/session`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      return { isLoggedIn: false };
    }

    return await withCurrentHandle(
      parseAuthSession(await response.json()),
      getHandleChangeFreshness(cookieHeader),
    );
  } catch {
    return { isLoggedIn: false };
  }
}

/**
 * The auth service records the username when the user signs in, so it goes
 * stale the moment they change it and only catches up when they sign in again —
 * leaving them looking at their old username, and every link built from it
 * pointing at a name that no longer resolves. The DID document is the
 * authority, so prefer what it says. Lookups are cached and never fatal: if the
 * document can't be read the session is returned unchanged.
 */
async function withCurrentHandle(session: AuthSession, freshness: string | null): Promise<AuthSession> {
  if (!session.isLoggedIn) return session;
  const identity = await resolveDidIdentity(session.did, freshness).catch(() => null);
  const current = identity?.handle?.trim().toLowerCase();
  if (!current || current === session.handle.trim().toLowerCase()) return session;
  return { ...session, handle: current };
}
