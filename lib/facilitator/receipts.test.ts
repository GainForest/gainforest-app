import { afterEach, describe, expect, it, vi } from "vitest";
import { FACILITATOR_DID } from "@/app/_lib/urls";
import { receiptRkeyForTransaction, writeFundingReceipt } from "./receipts";

const TX_HASH = `0x${"a".repeat(64)}`;

describe("funding receipt writes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("retries the same deterministic record instead of creating duplicates", async () => {
    vi.stubEnv("FACILITATOR_SERVICE_HOST", "https://pds.example.test");
    vi.stubEnv("FACILITATOR_PASSWORD", "test-password");

    const expectedRkey = receiptRkeyForTransaction(TX_HASH);
    const putBodies: Array<Record<string, unknown>> = [];
    let putAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/com.atproto.server.createSession")) {
        return Response.json({ accessJwt: "test-token" });
      }
      if (url.endsWith("/com.atproto.repo.putRecord")) {
        putAttempts += 1;
        putBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (putAttempts === 1) return Response.json({ message: "temporary failure" }, { status: 503 });
        return Response.json({
          uri: `at://${FACILITATOR_DID}/org.hypercerts.funding.receipt/${expectedRkey}`,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const uri = await writeFundingReceipt({
      from: { $type: "app.certified.defs#did", did: "did:plc:donor" },
      to: { $type: "org.hypercerts.funding.receipt#text", value: "0x1111111111111111111111111111111111111111" },
      amount: "25",
      currency: "USDC",
      transactionHash: TX_HASH,
      receiptSubject: {
        uri: "at://did:plc:forest/org.hypercerts.claim.activity/project",
        cid: "bafyreicard",
      },
    });

    expect(uri).toBe(`at://${FACILITATOR_DID}/org.hypercerts.funding.receipt/${expectedRkey}`);
    expect(putBodies).toHaveLength(2);
    expect(putBodies[0]).toEqual(putBodies[1]);
    expect(putBodies[0]).toMatchObject({
      repo: FACILITATOR_DID,
      collection: "org.hypercerts.funding.receipt",
      rkey: expectedRkey,
    });
    expect(expectedRkey).toMatch(/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/);
  });
});
