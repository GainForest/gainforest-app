"use client";

/**
 * WebAuthn passkey creation for organization vaults.
 *
 * Creates a resident P-256 passkey in the member's authenticator (Face ID,
 * fingerprint, iCloud Keychain, Google Password Manager, security key …) and
 * returns the public-key coordinates the SmartVault `Signer` struct needs.
 * The private key never leaves the authenticator.
 */

import { createWebAuthnCredential } from "viem/account-abstraction";
import * as WebAuthnP256 from "ox/WebAuthnP256";

export type CreatedPasskey = {
  credentialId: string;
  publicKeyX: `0x${string}`;
  publicKeyY: `0x${string}`;
};

/** Split a serialized P-256 public key (with or without the 0x04 prefix) into x/y. */
function splitPublicKey(publicKey: `0x${string}`): { x: `0x${string}`; y: `0x${string}` } {
  let hex = publicKey.slice(2);
  if (hex.length === 130 && hex.startsWith("04")) hex = hex.slice(2);
  if (hex.length !== 128) throw new Error("Unexpected passkey public key format");
  return { x: `0x${hex.slice(0, 64)}` as `0x${string}`, y: `0x${hex.slice(64)}` as `0x${string}` };
}

export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && typeof navigator.credentials?.create === "function";
}

/**
 * Prompt the member to create a passkey named after the organization.
 * Throws when the user cancels or the device has no authenticator.
 */
export async function createVaultPasskey(orgLabel: string): Promise<CreatedPasskey> {
  const credential = await createWebAuthnCredential({ name: orgLabel });
  const { x, y } = splitPublicKey(credential.publicKey);
  return { credentialId: credential.id, publicKeyX: x, publicKeyY: y };
}

/** A WebAuthn assertion over a userOp hash, ready for the send API. */
export type VaultUserOpSignature = {
  /** The credential the authenticator actually used. */
  credentialId: string;
  authenticatorData: `0x${string}`;
  clientDataJSON: string;
  challengeIndex: number;
  typeIndex: number;
  /** Decimal strings — bigint-safe across JSON. */
  r: string;
  s: string;
};

/**
 * Ask the user to approve a wallet operation with one of the enrolled
 * passkeys. `challenge` is the userOpHash; any of `credentialIds` may sign
 * (the authenticator picks whichever it holds). The signature is normalized
 * to low-s, as the on-chain P-256 verifier requires.
 */
export async function signVaultUserOp(
  challenge: `0x${string}`,
  credentialIds: string[],
): Promise<VaultUserOpSignature> {
  const { id, metadata, signature } = await WebAuthnP256.sign({
    challenge,
    credentialId: credentialIds.length === 1 ? credentialIds[0] : credentialIds,
    userVerification: "preferred",
  });
  return {
    credentialId: id,
    authenticatorData: metadata.authenticatorData,
    clientDataJSON: metadata.clientDataJSON,
    challengeIndex: metadata.challengeIndex ?? metadata.clientDataJSON.indexOf('"challenge"'),
    typeIndex: metadata.typeIndex ?? metadata.clientDataJSON.indexOf('"type"'),
    r: signature.r.toString(),
    s: signature.s.toString(),
  };
}
