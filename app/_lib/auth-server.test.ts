import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => headersMock(),
}));

const AUTH_BASE_URL = "https://www.gainforest.app";
const DID = "did:plc:fzk7bugiaccvix3f4rgpdyid";

function headerList(cookie: string | null) {
  return { get: (name: string) => (name.toLowerCase() === "cookie" ? cookie : null) };
}

/** Stand-in for the auth service + plc.directory. The auth service answers with
 *  the username it recorded at sign-in; the DID document answers with the
 *  current one. */
function stubNetwork(options: {
  sessionHandle: string | null;
  documentHandle?: string | null;
  documentFails?: boolean;
}) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.startsWith(`${AUTH_BASE_URL}/api/auth/session`)) {
      return new Response(
        JSON.stringify(
          options.sessionHandle
            ? { isLoggedIn: true, did: DID, handle: options.sessionHandle }
            : { isLoggedIn: false },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.startsWith("https://plc.directory/")) {
      if (options.documentFails) throw new Error("network down");
      return new Response(
        JSON.stringify({
          alsoKnownAs: options.documentHandle ? [`at://${options.documentHandle}`] : [],
          service: [{ type: "AtprotoPersonalDataServer", serviceEndpoint: "https://certified.one" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

async function load() {
  vi.resetModules();
  return import("./auth-server");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", AUTH_BASE_URL);
  headersMock.mockReturnValue(headerList("__Secure_gainforest_session=abc"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("fetchAuthSession", () => {
  it("uses the username the account actually has now, not the one recorded at sign-in", async () => {
    vi.stubGlobal("fetch", stubNetwork({ sessionHandle: "y2vrxs.certified.one", documentHandle: "lotamoros.certified.one" }));
    const { fetchAuthSession } = await load();
    const session = await fetchAuthSession();
    expect(session).toMatchObject({ isLoggedIn: true, did: DID, handle: "lotamoros.certified.one" });
  });

  it("keeps the session username when it already matches", async () => {
    vi.stubGlobal("fetch", stubNetwork({ sessionHandle: "alice.certified.one", documentHandle: "alice.certified.one" }));
    const { fetchAuthSession } = await load();
    expect(await fetchAuthSession()).toMatchObject({ handle: "alice.certified.one" });
  });

  it("keeps the session username when the account's identity can't be read", async () => {
    vi.stubGlobal("fetch", stubNetwork({ sessionHandle: "alice.certified.one", documentFails: true }));
    const { fetchAuthSession } = await load();
    expect(await fetchAuthSession()).toMatchObject({ isLoggedIn: true, handle: "alice.certified.one" });
  });

  it("stays signed out without looking anything up", async () => {
    vi.stubGlobal("fetch", stubNetwork({ sessionHandle: null }));
    const { fetchAuthSession } = await load();
    expect(await fetchAuthSession()).toEqual({ isLoggedIn: false });
  });

  it("re-reads a cached identity when the username-change cookie appears", async () => {
    // First request caches the pre-change identity.
    const options = { sessionHandle: "y2vrxs.certified.one", documentHandle: "y2vrxs.certified.one" };
    vi.stubGlobal("fetch", stubNetwork(options));
    const { fetchAuthSession } = await load();
    expect(await fetchAuthSession()).toMatchObject({ handle: "y2vrxs.certified.one" });

    // The user changes their username (the DID document moves on) — without
    // the cookie, the cached identity keeps answering.
    options.documentHandle = "lotamoros.certified.one";
    expect(await fetchAuthSession()).toMatchObject({ handle: "y2vrxs.certified.one" });

    // With the cookie the change flow sets, the identity is read again.
    headersMock.mockReturnValue(
      headerList(`__Secure_gainforest_session=abc; gainforest_handle_changed=${Date.now()}`),
    );
    expect(await fetchAuthSession()).toMatchObject({ handle: "lotamoros.certified.one" });
  });
});

describe("username-change marker vs identity cache", () => {
  it("honours the marker for longer than a looked-up identity is reused", async () => {
    const { HANDLE_CHANGED_WINDOW_MS } = await import("./auth");
    const { IDENTITY_CACHE_TTL_MS } = await import("./did-identity");

    // If the marker expired first, an instance still holding the pre-change
    // identity would take over again and show the old username.
    expect(HANDLE_CHANGED_WINDOW_MS).toBeGreaterThan(IDENTITY_CACHE_TTL_MS);
  });
});
