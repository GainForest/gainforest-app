import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./did-identity");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getEpdsHosts", () => {
  it("defaults to certified.one", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_PDS_DOMAIN", "");
    vi.stubEnv("DEFAULT_PDS_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_EPDS_URL", "");
    const { getEpdsHosts } = await load();
    expect(getEpdsHosts()).toEqual(["certified.one"]);
  });

  it("includes the configured default PDS domain and ePDS URL host", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_PDS_DOMAIN", "certified.dev");
    vi.stubEnv("NEXT_PUBLIC_EPDS_URL", "https://epds.example.org/");
    const { getEpdsHosts } = await load();
    expect(getEpdsHosts()).toEqual(["certified.dev", "epds.example.org"]);
  });
});

describe("isEpdsIdentity", () => {
  it("matches accounts hosted on the ePDS host", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_PDS_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_EPDS_URL", "");
    const { isEpdsIdentity } = await load();
    expect(isEpdsIdentity({ handle: null, pdsHost: "certified.one" })).toBe(true);
    expect(isEpdsIdentity({ handle: null, pdsHost: "Certified.One" })).toBe(true);
  });

  it("rejects Bluesky and other atproto hosts", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_PDS_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_EPDS_URL", "");
    const { isEpdsIdentity } = await load();
    expect(isEpdsIdentity({ handle: "alice.bsky.social", pdsHost: "morel.us-east.host.bsky.network" })).toBe(false);
    expect(isEpdsIdentity({ handle: "bob.example.com", pdsHost: "pds.example.com" })).toBe(false);
  });

  it("falls back to the handle suffix when the PDS host is unknown", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_PDS_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_EPDS_URL", "");
    const { isEpdsIdentity } = await load();
    expect(isEpdsIdentity({ handle: "alice.certified.one", pdsHost: null })).toBe(true);
    expect(isEpdsIdentity({ handle: "alice.notcertified.one", pdsHost: null })).toBe(false);
    expect(isEpdsIdentity({ handle: null, pdsHost: null })).toBe(false);
  });
});
