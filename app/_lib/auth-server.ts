import { headers } from "next/headers";
import { getAuthBaseUrl, getAuthForwardCookie, parseAuthSession, type AuthSession } from "./auth";
import { resolveDidIdentity } from "./did-identity";

export async function fetchAuthSession(): Promise<AuthSession> {
  try {
    const headerList = await headers();
    const cookie = getAuthForwardCookie(headerList.get("cookie"));

    const response = await fetch(`${getAuthBaseUrl()}/api/auth/session`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      return { isLoggedIn: false };
    }

    return await withCurrentHandle(parseAuthSession(await response.json()));
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
async function withCurrentHandle(session: AuthSession): Promise<AuthSession> {
  if (!session.isLoggedIn) return session;
  const identity = await resolveDidIdentity(session.did).catch(() => null);
  const current = identity?.handle?.trim().toLowerCase();
  if (!current || current === session.handle.trim().toLowerCase()) return session;
  return { ...session, handle: current };
}
