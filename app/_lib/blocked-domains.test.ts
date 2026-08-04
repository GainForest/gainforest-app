import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./blocked-domains");
}

describe("normalizeBlockedDomain", () => {
  it("accepts a bare host", async () => {
    const { normalizeBlockedDomain } = await load();
    expect(normalizeBlockedDomain("dev.certified.app")).toBe("dev.certified.app");
  });

  it("strips what an admin is likely to paste", async () => {
    const { normalizeBlockedDomain } = await load();
    expect(normalizeBlockedDomain("  https://DEV.Certified.App/xrpc/  ")).toBe("dev.certified.app");
    expect(normalizeBlockedDomain("*.dev.certified.app")).toBe("dev.certified.app");
    expect(normalizeBlockedDomain("@dev.certified.app")).toBe("dev.certified.app");
    expect(normalizeBlockedDomain("handle@dev.certified.app")).toBe("dev.certified.app");
    expect(normalizeBlockedDomain("dev.certified.app:443")).toBe("dev.certified.app");
    expect(normalizeBlockedDomain("dev.certified.app.")).toBe("dev.certified.app");
  });

  it("rejects values that are not a host", async () => {
    const { normalizeBlockedDomain } = await load();
    expect(normalizeBlockedDomain("")).toBeNull();
    expect(normalizeBlockedDomain("   ")).toBeNull();
    expect(normalizeBlockedDomain("localhost")).toBeNull();
    expect(normalizeBlockedDomain("not a domain")).toBeNull();
    expect(normalizeBlockedDomain("did:plc:abc")).toBeNull();
  });
});

describe("builtinBlockedDomains", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks the development server by default", async () => {
    const { builtinBlockedDomains } = await load();
    expect(builtinBlockedDomains()).toEqual(["dev.certified.app"]);
  });

  it("accepts a configured list and normalizes each entry", async () => {
    vi.stubEnv("NEXT_PUBLIC_BLOCKED_PDS_DOMAINS", "https://a.example.org/, B.Example.org");
    const { builtinBlockedDomains } = await load();
    expect(builtinBlockedDomains()).toEqual(["a.example.org", "b.example.org"]);
  });

  it("blocks nothing when explicitly configured empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_BLOCKED_PDS_DOMAINS", "");
    const { builtinBlockedDomains } = await load();
    expect(builtinBlockedDomains()).toEqual([]);
  });
});

describe("parseBlockedDomainRecord", () => {
  it("reads a well-formed record and normalizes its address", async () => {
    const { parseBlockedDomainRecord } = await load();
    expect(
      parseBlockedDomainRecord({
        uri: "at://did:plc:mod/app.gainforest.moderation.blockedDomain/abc",
        value: { domain: "Dev.Example.ORG", blocked: true, createdAt: "2026-01-01T00:00:00Z" },
      }),
    ).toEqual({
      rkey: "abc",
      uri: "at://did:plc:mod/app.gainforest.moderation.blockedDomain/abc",
      domain: "dev.example.org",
      blocked: true,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("treats a missing blocked flag as a block", async () => {
    const { parseBlockedDomainRecord } = await load();
    expect(
      parseBlockedDomainRecord({
        uri: "at://did:plc:mod/app.gainforest.moderation.blockedDomain/abc",
        value: { domain: "dev.example.org", createdAt: "2026-01-01T00:00:00Z" },
      })?.blocked,
    ).toBe(true);
  });

  it("ignores malformed entries", async () => {
    const { parseBlockedDomainRecord } = await load();
    expect(parseBlockedDomainRecord(null)).toBeNull();
    expect(parseBlockedDomainRecord({ uri: "at://x/y/z" })).toBeNull();
    expect(
      parseBlockedDomainRecord({ uri: "at://x/y/z", value: { domain: "nope", createdAt: "2026-01-01T00:00:00Z" } }),
    ).toBeNull();
    expect(parseBlockedDomainRecord({ uri: "at://x/y/z", value: { domain: "dev.example.org" } })).toBeNull();
  });
});

describe("effectiveBlockedDomainRecords", () => {
  const record = (domain: string, blocked: boolean, createdAt: string, rkey: string) => ({
    rkey,
    uri: `at://did:plc:mod/app.gainforest.moderation.blockedDomain/${rkey}`,
    domain,
    blocked,
    createdAt,
  });

  it("keeps the newest event per address", async () => {
    const { effectiveBlockedDomainRecords } = await load();
    const active = effectiveBlockedDomainRecords([
      record("a.example.org", true, "2026-01-01T00:00:00Z", "1"),
      record("a.example.org", false, "2026-02-01T00:00:00Z", "2"),
      record("b.example.org", true, "2026-01-01T00:00:00Z", "3"),
    ]);
    expect(active.map((entry) => entry.domain)).toEqual(["b.example.org"]);
  });

  it("lets a later block undo an earlier unblock", async () => {
    const { effectiveBlockedDomainRecords } = await load();
    const active = effectiveBlockedDomainRecords([
      record("a.example.org", false, "2026-01-01T00:00:00Z", "1"),
      record("a.example.org", true, "2026-03-01T00:00:00Z", "2"),
    ]);
    expect(active.map((entry) => entry.rkey)).toEqual(["2"]);
  });
});

describe("resolveActiveBlockedDomain", () => {
  it("maps a stale rkey to the address's current block", async () => {
    const { resolveActiveBlockedDomain } = await load();
    const records = [
      {
        rkey: "old",
        uri: "at://x/y/old",
        domain: "a.example.org",
        blocked: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        rkey: "new",
        uri: "at://x/y/new",
        domain: "a.example.org",
        blocked: true,
        createdAt: "2026-02-01T00:00:00Z",
      },
    ];
    expect(resolveActiveBlockedDomain(records, "old")?.rkey).toBe("new");
    expect(resolveActiveBlockedDomain(records, "missing")).toBeNull();
  });
});

describe("fetchDomainAccountDids", () => {
  it("pages through the server's account list", async () => {
    const { fetchDomainAccountDids } = await load();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ repos: [{ did: "did:plc:a" }, { did: "did:plc:b" }], cursor: "next" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ repos: [{ did: "did:plc:c" }, { notADid: true }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const dids = await fetchDomainAccountDids("dev.example.org");
    expect([...dids].sort()).toEqual(["did:plc:a", "did:plc:b", "did:plc:c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("throws when the server refuses, so callers can fail open", async () => {
    const { fetchDomainAccountDids } = await load();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchDomainAccountDids("dev.example.org")).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});
