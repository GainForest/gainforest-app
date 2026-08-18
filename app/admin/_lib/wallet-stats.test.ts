import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/_lib/indexer", () => ({ fetchAccountCards: vi.fn(), indexerQuery: vi.fn() }));
vi.mock("@/app/_lib/pds", () => ({ resolveBlobUrl: vi.fn() }));

import { buildWalletStatRows, type RawWalletRecord } from "./wallet-stats";

const ADDRESS = "0x024B9ac1176000000000000000000000000000aa";

function record(did: string, overrides: Record<string, unknown> = {}): RawWalletRecord {
  return {
    did,
    value: {
      $type: "app.gainforest.wallet.primary",
      address: ADDRESS,
      createdAt: "2026-08-14T23:37:41.285Z",
      signers: [{ kind: "passkey" }],
      ...overrides,
    },
  };
}

describe("buildWalletStatRows", () => {
  it("counts an account with both a primary and a legacy record once, preferring primary", () => {
    const rows = buildWalletStatRows(
      [record("did:plc:alice")],
      [record("did:plc:alice", { name: "old vault" }), record("did:plc:bob", { createdAt: "2026-01-01T00:00:00.000Z" })],
    );
    expect(rows).toHaveLength(2);
    const alice = rows.find((row) => row.did === "did:plc:alice");
    expect(alice?.legacy).toBe(false);
    expect(alice?.walletName).toBeNull();
    const bob = rows.find((row) => row.did === "did:plc:bob");
    expect(bob?.legacy).toBe(true);
  });

  it("sorts newest first, sinking records without a parseable creation date", () => {
    const rows = buildWalletStatRows(
      [
        record("did:plc:old", { createdAt: "2026-01-02T00:00:00.000Z" }),
        record("did:plc:undated", { createdAt: "not-a-date" }),
        record("did:plc:new", { createdAt: "2026-08-01T00:00:00.000Z" }),
      ],
      [],
    );
    expect(rows.map((row) => row.did)).toEqual(["did:plc:new", "did:plc:old", "did:plc:undated"]);
  });

  it("keeps an account with a malformed record, degrading fields to null", () => {
    const rows = buildWalletStatRows([{ did: "did:plc:broken", value: { address: "nope" } }], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ did: "did:plc:broken", address: null, createdAt: null, signerCount: null });
  });

  it("reads address, name, creation date and signer count from a well-formed record", () => {
    const rows = buildWalletStatRows(
      [record("did:plc:alice", { name: "Forest fund", signers: [{ kind: "passkey" }, { kind: "passkey" }] })],
      [],
    );
    expect(rows[0]).toMatchObject({
      address: ADDRESS,
      walletName: "Forest fund",
      createdAt: "2026-08-14T23:37:41.285Z",
      signerCount: 2,
      legacy: false,
    });
  });
});
