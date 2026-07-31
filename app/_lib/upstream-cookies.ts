/**
 * Relay `Set-Cookie` from the central auth service to the browser.
 *
 * Routes here proxy the user's request server-to-server, so any cookie the auth
 * service sets lands on *our* fetch response and goes nowhere unless it is
 * copied onto the response we return. That matters whenever the upstream call
 * changes something the session records — changing a username re-seals the
 * session with the new one, and dropping the cookie leaves the user signed in
 * under their old name until they next sign in.
 *
 * Auth cookies are scoped to the shared parent domain, so a cookie set through
 * this app's origin is accepted for the auth service too.
 */
export function relayUpstreamCookies<T extends Response>(upstream: Response, response: T): T {
  // `getSetCookie()` keeps multiple cookies separate; `get()` folds them into
  // one string, which is only safe when there is a single cookie.
  const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(upstream.headers) : [];
  const fallback = upstream.headers.get("set-cookie");
  const cookies = setCookies.length > 0 ? setCookies : fallback ? [fallback] : [];
  for (const cookie of cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
