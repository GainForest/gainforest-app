import { headers } from "next/headers";
import { getAuthBaseUrl, getAuthForwardCookie, parseAuthSession, type AuthSession } from "./auth";

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

    return parseAuthSession(await response.json());
  } catch {
    return { isLoggedIn: false };
  }
}
