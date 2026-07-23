import { describe, expect, it } from "vitest";
import type { VaultLiveSigner } from "@/lib/splits-vault/shared";
import { eligiblePendingSignerCredentialIds } from "./wallet-pending-approval";

function signer(index: number, credentialId: string, memberDid?: string): VaultLiveSigner {
  return {
    index,
    credentialId,
    memberDid,
    publicKeyX: `0x${"1".repeat(64)}`,
    publicKeyY: `0x${"2".repeat(64)}`,
  };
}

describe("eligiblePendingSignerCredentialIds", () => {
  const viewerDid = "did:plc:viewer";
  const signers = [
    signer(0, "viewer-unused", viewerDid),
    signer(1, "viewer-approved", viewerDid),
    signer(2, "other-unused", "did:plc:other"),
    signer(3, "unowned"),
  ];

  it("returns only unused credentials owned by the viewer", () => {
    expect(eligiblePendingSignerCredentialIds(signers, ["viewer-approved"], viewerDid)).toEqual([
      "viewer-unused",
    ]);
  });

  it("returns no credentials before the viewer identity is known", () => {
    expect(eligiblePendingSignerCredentialIds(signers, [], null)).toEqual([]);
  });
});
