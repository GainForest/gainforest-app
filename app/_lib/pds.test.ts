import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./pds");
}

// did:web resolves its PDS host without any network fetch, which keeps these
// tests focused on the getRecord responses.
const DID = "did:web:pds.example";
const uri = (rkey: string) => `at://${DID}/app.certified.location/${rkey}`;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("dropDeletedRecordUris", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the input unchanged when empty", async () => {
    const { dropDeletedRecordUris } = await load();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await dropDeletedRecordUris([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps live records and drops RecordNotFound ones", async () => {
    const { dropDeletedRecordUris } = await load();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("rkey=gone")) {
          return jsonResponse(400, { error: "RecordNotFound", message: "Could not locate record" });
        }
        return jsonResponse(200, { uri: url, cid: "bafy...", value: {} });
      }),
    );
    expect(await dropDeletedRecordUris([uri("gone"), uri("alive")])).toEqual([uri("alive")]);
  });

  it("fails open: keeps the uri on network failure or non-RecordNotFound errors", async () => {
    const { dropDeletedRecordUris } = await load();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("rkey=flaky")) throw new Error("network down");
        if (url.includes("rkey=server-error")) return jsonResponse(500, { error: "InternalServerError" });
        return jsonResponse(200, { uri: url, cid: "bafy...", value: {} });
      }),
    );
    const uris = [uri("flaky"), uri("server-error"), uri("alive")];
    expect(await dropDeletedRecordUris(uris)).toEqual(uris);
  });

  it("keeps malformed uris untouched", async () => {
    const { dropDeletedRecordUris } = await load();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await dropDeletedRecordUris(["not-an-at-uri"])).toEqual(["not-an-at-uri"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

