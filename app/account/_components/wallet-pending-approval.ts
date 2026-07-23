import type { VaultLiveSigner } from "@/lib/splits-vault/shared";

/** Credentials this viewer may use for the next approval on a pending transfer. */
export function eligiblePendingSignerCredentialIds(
  signers: VaultLiveSigner[],
  approvedCredentialIds: Iterable<string>,
  viewerDid: string | null,
): string[] {
  if (!viewerDid) return [];
  const approved = new Set(approvedCredentialIds);
  return signers
    .filter((signer) => signer.memberDid === viewerDid && signer.credentialId && !approved.has(signer.credentialId))
    .map((signer) => signer.credentialId as string);
}
