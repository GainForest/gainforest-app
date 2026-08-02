import { describe, expect, it } from "vitest";
import { relayUpstreamCookies } from "./upstream-cookies";

function upstreamWith(cookies: string[]): Response {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { headers });
}

function relayed(cookies: string[]): string[] {
  const response = relayUpstreamCookies(upstreamWith(cookies), new Response(null));
  return response.headers.getSetCookie();
}

describe("relayUpstreamCookies", () => {
  it("passes the refreshed session cookie on to the browser", () => {
    expect(relayed(["__Secure_gainforest_session=resealed; Domain=.gainforest.app; Path=/; HttpOnly"])).toEqual([
      "__Secure_gainforest_session=resealed; Domain=.gainforest.app; Path=/; HttpOnly",
    ]);
  });

  it("keeps several cookies separate instead of folding them into one", () => {
    expect(relayed(["a=1; Path=/", "b=2; Path=/"])).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });

  it("leaves the response alone when upstream set no cookie", () => {
    expect(relayed([])).toEqual([]);
  });

  it("keeps cookies the response already carries", () => {
    const response = new Response(null, { headers: { "set-cookie": "own=1; Path=/" } });
    relayUpstreamCookies(upstreamWith(["upstream=2; Path=/"]), response);
    expect(response.headers.getSetCookie()).toEqual(["own=1; Path=/", "upstream=2; Path=/"]);
  });
});
