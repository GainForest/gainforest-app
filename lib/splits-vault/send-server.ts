/**
 * Sending funds from a donation wallet — server-side ERC-4337 engine.
 *
 * The wallet is a Splits SmartVault (EntryPoint v0.7). Instead of relying on
 * an external bundler service, the GainForest facilitator EOA (the same key
 * that already relays USDC donations, see lib/facilitator) acts as the
 * bundler AND sponsors gas:
 *
 *   1. `prepareSend` builds the unsigned UserOperation (deploying the vault
 *      lazily via factory initCode on its first send) and returns the
 *      userOpHash the browser must sign with an enrolled passkey.
 *   2. The browser produces a WebAuthn assertion over the hash.
 *   3. `submitSend` re-validates EVERY field of the operation against the
 *      wallet record and a strict allow-list (plain ETH/USDC/USDT transfers
 *      only), wraps the passkey signature in the SmartVault format, tops up
 *      the vault's EntryPoint gas deposit from the facilitator when needed
 *      (`EntryPoint.depositTo` — anyone may pre-fund any account's gas), and
 *      submits `EntryPoint.handleOps` from the facilitator EOA.
 *
 * Because the facilitator is also the `beneficiary` of `handleOps`, the gas
 * charged to the vault's deposit flows straight back to the facilitator; its
 * net spend is roughly the actual gas of the two transactions. Any unused
 * deposit stays in the EntryPoint as the vault's gas budget for future sends.
 *
 * SmartVault signature layout (threshold 1, see SmartVault.sol):
 *   signature = 0x00 (SingleUserOp) ++ abi.encode(SingleUserOpSignature)
 *   SingleUserOpSignature = { LightUserOpGasLimits gasLimits (ignored),
 *                             SignatureWrapper[] { uint8 signerIndex,
 *                                                  bytes abi.encode(WebAuthnAuth) } }
 */

import "server-only";

import {
  concatHex,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  isAddress,
  isAddressEqual,
  createWalletClient,
  http,
  parseEventLogs,
  zeroAddress,
  parseEther,
  parseGwei,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import {
  entryPoint07Abi,
  entryPoint07Address,
  getUserOperationHash,
  toPackedUserOperation,
  type UserOperation,
} from "viem/account-abstraction";
import { RPC_URL, USDC_CONTRACT } from "@/lib/facilitator/usdc";
import { keccak256 } from "viem";
import * as WebAuthnP256 from "ox/WebAuthnP256";
import {
  SMART_VAULT_FACTORY,
  MULTI_SIGNER_AUTH_ABI,
  VAULT_OWNER,
  orgVaultSalt,
  toSignerStruct,
  type PendingSendUserOp,
  type SplitsVaultRecord,
  type VaultSignerSet,
} from "./shared";
import { getMainnetClient } from "./server";
import { USDT_CONTRACT, getWalletToken, type WalletTokenSymbol } from "./tokens";

// ── Constants ─────────────────────────────────────────────────────────────────

export const ENTRY_POINT = entryPoint07Address;

/** Gas limits: generous static ceilings (P-256 verification runs in-EVM on
 * mainnet — no RIP-7212 precompile — and the first send also deploys the
 * ERC-1967 proxy). Verification scales with the approval threshold, since
 * every passkey signature is a separate in-EVM P-256 verification. Unused
 * gas is refunded to the vault's deposit. */
const CALL_GAS_LIMIT = 200_000n;
const VERIFICATION_GAS_BASE_DEPLOYED = 300_000n;
const VERIFICATION_GAS_BASE_DEPLOYING = 950_000n;
const VERIFICATION_GAS_PER_SIGNATURE = 400_000n;
const PRE_VERIFICATION_GAS = 60_000n;

function verificationGasLimitFor(deployed: boolean, threshold: number): bigint {
  const base = deployed ? VERIFICATION_GAS_BASE_DEPLOYED : VERIFICATION_GAS_BASE_DEPLOYING;
  return base + VERIFICATION_GAS_PER_SIGNATURE * BigInt(Math.max(1, threshold));
}

/** Refuse to sponsor when the worst-case gas cost exceeds this many ETH. */
function maxSponsoredWei(): bigint {
  const configured = Number(process.env.WALLET_SEND_MAX_GAS_ETH || "0.02");
  return parseEther(Number.isFinite(configured) && configured > 0 ? configured.toString() : "0.02");
}

const EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      {
        name: "call_",
        type: "tuple",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const CREATE_ACCOUNT_ABI = [
  {
    type: "function",
    name: "createAccount",
    stateMutability: "payable",
    inputs: [
      { name: "owner_", type: "address" },
      {
        name: "signers_",
        type: "tuple[]",
        components: [
          { name: "slot1", type: "bytes32" },
          { name: "slot2", type: "bytes32" },
        ],
      },
      { name: "threshold_", type: "uint8" },
      { name: "salt_", type: "uint256" },
    ],
    outputs: [{ name: "account", type: "address" }],
  },
] as const;

// ── Errors ────────────────────────────────────────────────────────────────────

/** A user-facing failure with an HTTP status. Message keys are resolved client-side. */
export class SendError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "invalid_request"
      | "insufficient_balance"
      | "network_busy"
      | "signature_rejected"
      | "submit_failed"
      | "expired"
      | "pending_exists"
      | "approval_invalid",
    public readonly status: number,
  ) {
    super(code);
    this.name = "SendError";
  }
}

// ── Facilitator access ────────────────────────────────────────────────────────

function getFacilitatorAccount() {
  const key = process.env.FACILITATOR_PRIVATE_KEY;
  if (!key) throw new SendError("not_configured", 503);
  return privateKeyToAccount(key as `0x${string}`);
}

function getFacilitatorWalletClient() {
  return createWalletClient({
    chain: mainnet,
    transport: http(process.env.ETHEREUM_RPC_URL || process.env.MAINNET_RPC_URL || RPC_URL),
    account: getFacilitatorAccount(),
  });
}

// ── Building the operation ────────────────────────────────────────────────────

export type SendParams = {
  token: WalletTokenSymbol;
  to: `0x${string}`;
  /** Raw token units as a decimal string. */
  amountUnits: string;
};

export type PreparedUserOp = PendingSendUserOp;

export type PreparedSend = {
  userOp: PreparedUserOp;
  /** The full userOp hash — signed by the FINAL approval. */
  hash: Hex;
  /**
   * The "light" userOp hash (SmartVault.sol) — signed by every approval
   * before the final one when the wallet requires more than one.
   */
  lightHash: Hex;
  /** How many distinct passkey approvals the wallet requires. */
  threshold: number;
};

function buildCallData(params: SendParams, amount: bigint): Hex {
  const token = getWalletToken(params.token);
  if (!token) throw new SendError("invalid_request", 400);
  const call = token.address
    ? {
        target: token.address,
        value: 0n,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [params.to, amount] }),
      }
    : { target: params.to, value: amount, data: "0x" as Hex };
  return encodeFunctionData({ abi: EXECUTE_ABI, functionName: "execute", args: [call] });
}

function buildFactoryData(did: string, record: SplitsVaultRecord): Hex {
  return encodeFunctionData({
    abi: CREATE_ACCOUNT_ABI,
    functionName: "createAccount",
    args: [
      VAULT_OWNER,
      record.signers.map(toSignerStruct),
      record.threshold,
      BigInt(orgVaultSalt(did)),
    ],
  });
}

const LIGHT_GAS_LIMITS_COMPONENTS = [
  { name: "maxPriorityFeePerGas", type: "uint256" },
  { name: "preVerificationGas", type: "uint256" },
  { name: "callGasLimit", type: "uint256" },
  { name: "verificationGasLimit", type: "uint256" },
  { name: "paymaster", type: "address" },
  { name: "paymasterVerificationGasLimit", type: "uint256" },
  { name: "paymasterPostOpGasLimit", type: "uint256" },
] as const;

/**
 * The LightUserOpGasLimits every non-final approval commits to. We pin them
 * to the operation's exact gas values, which trivially satisfies the
 * contract's `_verifyGasLimits` (userOp values must not exceed them).
 */
function lightGasLimits(userOp: UserOperation<"0.7">) {
  return {
    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
    preVerificationGas: userOp.preVerificationGas,
    callGasLimit: userOp.callGasLimit,
    verificationGasLimit: userOp.verificationGasLimit,
    paymaster: zeroAddress,
    paymasterVerificationGasLimit: 0n,
    paymasterPostOpGasLimit: 0n,
  };
}

/**
 * SmartVault light userOp hash: keccak256(abi.encode(
 *   keccak256(abi.encode(sender, nonce, keccak256(callData))),
 *   LightUserOpGasLimits, entryPoint, chainId)).
 * Signed by the first `threshold - 1` approvals (ignored when threshold is 1).
 */
function computeLightHash(userOp: UserOperation<"0.7">): Hex {
  const lightUserOpHash = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      [userOp.sender, userOp.nonce, keccak256(userOp.callData)],
    ),
  );
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "tuple", components: LIGHT_GAS_LIMITS_COMPONENTS },
        { type: "address" },
        { type: "uint256" },
      ],
      [lightUserOpHash, lightGasLimits(userOp), ENTRY_POINT, BigInt(mainnet.id)],
    ),
  );
}

function validateParams(params: SendParams, vaultAddress: `0x${string}`): bigint {
  const token = getWalletToken(params.token);
  if (!token) throw new SendError("invalid_request", 400);
  if (!isAddress(params.to) || isAddressEqual(params.to, zeroAddress)) throw new SendError("invalid_request", 400);
  if (isAddressEqual(params.to, vaultAddress)) throw new SendError("invalid_request", 400);
  let amount: bigint;
  try {
    amount = BigInt(params.amountUnits);
  } catch {
    throw new SendError("invalid_request", 400);
  }
  if (amount <= 0n) throw new SendError("invalid_request", 400);
  return amount;
}

/**
 * Decode a vault `execute` calldata back into plain send parameters.
 * Throws `invalid_request` when it is not exactly one allowed transfer.
 */
export function decodeSendCallData(callData: Hex): SendParams {
  let decoded: { functionName: string; args: readonly unknown[] };
  try {
    decoded = decodeFunctionData({ abi: EXECUTE_ABI, data: callData });
  } catch {
    throw new SendError("invalid_request", 400);
  }
  if (decoded.functionName !== "execute") throw new SendError("invalid_request", 400);
  const call = decoded.args[0] as { target: `0x${string}`; value: bigint; data: Hex };
  if (isAddressEqual(call.target, USDC_CONTRACT) || isAddressEqual(call.target, USDT_CONTRACT)) {
    const transfer = decodeFunctionData({ abi: erc20Abi, data: call.data });
    const [to, amount] = transfer.args as [`0x${string}`, bigint];
    return {
      token: isAddressEqual(call.target, USDC_CONTRACT) ? "USDC" : "USDT",
      to,
      amountUnits: amount.toString(),
    };
  }
  return { token: "ETH", to: call.target, amountUnits: call.value.toString() };
}

async function currentFees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const client = getMainnetClient();
  const fees = await client.estimateFeesPerGas().catch(() => null);
  const maxPriorityFeePerGas = fees?.maxPriorityFeePerGas && fees.maxPriorityFeePerGas > 0n
    ? fees.maxPriorityFeePerGas
    : parseGwei("1");
  const maxFeePerGas = fees?.maxFeePerGas && fees.maxFeePerGas > maxPriorityFeePerGas
    ? fees.maxFeePerGas
    : parseGwei("3");
  return { maxFeePerGas, maxPriorityFeePerGas };
}

function totalGas(userOp: { callGasLimit: bigint; verificationGasLimit: bigint; preVerificationGas: bigint }): bigint {
  return userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas;
}

async function assertTokenBalance(params: SendParams, vaultAddress: `0x${string}`, amount: bigint): Promise<void> {
  const client = getMainnetClient();
  const token = getWalletToken(params.token);
  if (!token) throw new SendError("invalid_request", 400);
  const balance = token.address
    ? await client
        .readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [vaultAddress] })
        .catch(() => 0n)
    : await client.getBalance({ address: vaultAddress }).catch(() => 0n);
  if (balance < amount) throw new SendError("insufficient_balance", 400);
}

/**
 * Build an unsigned UserOperation around arbitrary (already validated) vault
 * calldata, with the hashes the passkeys must sign. Shared by sends and
 * on-chain management operations.
 */
async function buildOperation(
  did: string,
  record: SplitsVaultRecord,
  signerSet: VaultSignerSet,
  callData: Hex,
): Promise<PreparedSend> {
  getFacilitatorAccount(); // fail fast when sponsorship is not configured
  const client = getMainnetClient();
  const [nonce, fees] = await Promise.all([
    client.readContract({
      address: ENTRY_POINT,
      abi: entryPoint07Abi,
      functionName: "getNonce",
      args: [record.address, 0n],
    }),
    currentFees(),
  ]);

  const userOp: UserOperation<"0.7"> = {
    sender: record.address,
    nonce,
    ...(signerSet.deployed ? {} : { factory: SMART_VAULT_FACTORY, factoryData: buildFactoryData(did, record) }),
    callData,
    callGasLimit: CALL_GAS_LIMIT,
    verificationGasLimit: verificationGasLimitFor(signerSet.deployed, signerSet.threshold),
    preVerificationGas: PRE_VERIFICATION_GAS,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    signature: "0x",
  };

  if (totalGas(userOp) * userOp.maxFeePerGas > maxSponsoredWei()) throw new SendError("network_busy", 503);

  const hash = getUserOperationHash({
    chainId: mainnet.id,
    entryPointAddress: ENTRY_POINT,
    entryPointVersion: "0.7",
    userOperation: userOp,
  });

  return {
    lightHash: computeLightHash(userOp),
    threshold: signerSet.threshold,
    userOp: {
      sender: userOp.sender,
      nonce: userOp.nonce.toString(),
      ...(userOp.factory ? { factory: userOp.factory, factoryData: userOp.factoryData } : {}),
      callData: userOp.callData,
      callGasLimit: userOp.callGasLimit.toString(),
      verificationGasLimit: userOp.verificationGasLimit.toString(),
      preVerificationGas: userOp.preVerificationGas.toString(),
      maxFeePerGas: userOp.maxFeePerGas.toString(),
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
    },
    hash,
  };
}

/**
 * Build the unsigned UserOperation for a send and the hash the passkey must
 * sign. `did` is the account whose wallet record this is (CREATE2 salt input).
 */
export async function prepareSend(
  did: string,
  record: SplitsVaultRecord,
  signerSet: VaultSignerSet,
  params: SendParams,
): Promise<PreparedSend> {
  const amount = validateParams(params, record.address);
  await assertTokenBalance(params, record.address, amount);
  return buildOperation(did, record, signerSet, buildCallData(params, amount));
}

// ── Validating + signing + submitting ────────────────────────────────────────

export type WebAuthnSignaturePayload = {
  /** Index of the signing passkey in the wallet record's signer list. */
  signerIndex: number;
  authenticatorData: Hex;
  clientDataJSON: string;
  challengeIndex: number;
  typeIndex: number;
  r: string;
  s: string;
};

const WEBAUTHN_AUTH_ABI = [
  {
    type: "tuple",
    components: [
      { name: "authenticatorData", type: "bytes" },
      { name: "clientDataJSON", type: "string" },
      { name: "challengeIndex", type: "uint256" },
      { name: "typeIndex", type: "uint256" },
      { name: "r", type: "uint256" },
      { name: "s", type: "uint256" },
    ],
  },
] as const;

const SINGLE_USER_OP_SIGNATURE_ABI = [
  {
    type: "tuple",
    components: [
      {
        name: "gasLimits",
        type: "tuple",
        components: [
          { name: "maxPriorityFeePerGas", type: "uint256" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "callGasLimit", type: "uint256" },
          { name: "verificationGasLimit", type: "uint256" },
          { name: "paymaster", type: "address" },
          { name: "paymasterVerificationGasLimit", type: "uint256" },
          { name: "paymasterPostOpGasLimit", type: "uint256" },
        ],
      },
      {
        name: "signatures",
        type: "tuple[]",
        components: [
          { name: "signerIndex", type: "uint8" },
          { name: "signatureData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

/**
 * Wrap the ordered WebAuthn approvals into the SmartVault userOp signature
 * format. The first `threshold - 1` entries must have signed the light hash;
 * the last entry must have signed the full userOp hash. The gas limits
 * encoded here MUST match the ones hashed into the light hash
 * (`lightGasLimits`), or on-chain validation fails.
 */
export function encodeVaultSignature(userOp: UserOperation<"0.7">, payloads: WebAuthnSignaturePayload[]): Hex {
  const signatures = payloads.map((payload) => ({
    signerIndex: payload.signerIndex,
    signatureData: encodeAbiParameters(WEBAUTHN_AUTH_ABI, [
      {
        authenticatorData: payload.authenticatorData,
        clientDataJSON: payload.clientDataJSON,
        challengeIndex: BigInt(payload.challengeIndex),
        typeIndex: BigInt(payload.typeIndex),
        r: BigInt(payload.r),
        s: BigInt(payload.s),
      },
    ]),
  }));
  const single = encodeAbiParameters(SINGLE_USER_OP_SIGNATURE_ABI, [
    { gasLimits: lightGasLimits(userOp), signatures },
  ]);
  // 0x00 = SignatureTypes.SingleUserOp
  return concatHex(["0x00", single]);
}

function parseBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new SendError("invalid_request", 400);
  }
}

/** Decode the single `execute` Call out of vault calldata. */
function decodeExecuteCall(callData: Hex): { target: `0x${string}`; value: bigint; data: Hex } {
  let decoded: { functionName: string; args: readonly unknown[] };
  try {
    decoded = decodeFunctionData({ abi: EXECUTE_ABI, data: callData });
  } catch {
    throw new SendError("invalid_request", 400);
  }
  if (decoded.functionName !== "execute") throw new SendError("invalid_request", 400);
  return decoded.args[0] as { target: `0x${string}`; value: bigint; data: Hex };
}

/** The calldata must be exactly one allowed transfer; re-checks the balance. */
async function validateSendCallData(record: SplitsVaultRecord, callData: Hex): Promise<void> {
  const call = decodeExecuteCall(callData);
  const isErc20 = isAddressEqual(call.target, USDC_CONTRACT) || isAddressEqual(call.target, USDT_CONTRACT);
  let spend: { token: WalletTokenSymbol; to: `0x${string}`; amount: bigint };
  if (isErc20) {
    if (call.value !== 0n) throw new SendError("invalid_request", 400);
    let transfer: { functionName: string; args: readonly unknown[] };
    try {
      transfer = decodeFunctionData({ abi: erc20Abi, data: call.data });
    } catch {
      throw new SendError("invalid_request", 400);
    }
    if (transfer.functionName !== "transfer") throw new SendError("invalid_request", 400);
    const [to, amount] = transfer.args as [`0x${string}`, bigint];
    if (!isAddress(to) || isAddressEqual(to, zeroAddress) || amount <= 0n) throw new SendError("invalid_request", 400);
    spend = { token: isAddressEqual(call.target, USDC_CONTRACT) ? "USDC" : "USDT", to, amount };
  } else {
    // Plain ETH transfer: no calldata, positive value, sane recipient.
    if (call.data !== "0x" || call.value <= 0n) throw new SendError("invalid_request", 400);
    if (!isAddress(call.target) || isAddressEqual(call.target, zeroAddress)) throw new SendError("invalid_request", 400);
    if (isAddressEqual(call.target, record.address)) throw new SendError("invalid_request", 400);
    spend = { token: "ETH", to: call.target, amount: call.value };
  }

  // Re-check the balance right before sponsoring — a transfer that would fail
  // in-flight still burns the gas deposit we front.
  await assertTokenBalance(
    { token: spend.token, to: spend.to, amountUnits: spend.amount.toString() },
    record.address,
    spend.amount,
  );
}

/**
 * Re-validate the operation-envelope fields (sender, deployment data, nonce,
 * fees, gas ceilings) of a client-echoed userOp before sponsoring it.
 * Calldata rules are validated separately per operation kind.
 */
async function validateUserOpEnvelope(
  did: string,
  record: SplitsVaultRecord,
  signerSet: VaultSignerSet,
  raw: PreparedUserOp,
): Promise<UserOperation<"0.7">> {
  if (!isAddress(raw.sender) || !isAddressEqual(raw.sender, record.address)) {
    throw new SendError("invalid_request", 400);
  }

  // Deployment data must be exactly ours, and only when the vault is undeployed.
  if (signerSet.deployed) {
    if (raw.factory || raw.factoryData) throw new SendError("invalid_request", 400);
  } else {
    if (!raw.factory || !isAddressEqual(raw.factory, SMART_VAULT_FACTORY)) throw new SendError("invalid_request", 400);
    if ((raw.factoryData || "").toLowerCase() !== buildFactoryData(did, record).toLowerCase()) {
      throw new SendError("invalid_request", 400);
    }
  }

  // The nonce must be the account's current one. A mismatch means another
  // operation confirmed since this one was prepared — it can never succeed.
  const client = getMainnetClient();
  const nonce = parseBigInt(raw.nonce);
  const [currentNonce, block] = await Promise.all([
    client.readContract({
      address: ENTRY_POINT,
      abi: entryPoint07Abi,
      functionName: "getNonce",
      args: [record.address, 0n],
    }),
    client.getBlock().catch(() => null),
  ]);
  if (nonce !== currentNonce) throw new SendError("expired", 409);

  // Fee staleness: an operation prepared while fees were lower than today's
  // base fee cannot be mined profitably — ask the user to start over.
  const maxFeePerGas = parseBigInt(raw.maxFeePerGas);
  if (block?.baseFeePerGas && block.baseFeePerGas > maxFeePerGas) throw new SendError("expired", 409);

  const userOp: UserOperation<"0.7"> = {
    sender: record.address,
    nonce,
    ...(signerSet.deployed ? {} : { factory: SMART_VAULT_FACTORY, factoryData: raw.factoryData }),
    callData: raw.callData,
    callGasLimit: parseBigInt(raw.callGasLimit),
    verificationGasLimit: parseBigInt(raw.verificationGasLimit),
    preVerificationGas: parseBigInt(raw.preVerificationGas),
    maxFeePerGas: parseBigInt(raw.maxFeePerGas),
    maxPriorityFeePerGas: parseBigInt(raw.maxPriorityFeePerGas),
    signature: "0x",
  };

  // Gas ceilings: never sponsor more than our caps.
  if (userOp.callGasLimit > CALL_GAS_LIMIT) throw new SendError("invalid_request", 400);
  if (userOp.verificationGasLimit > verificationGasLimitFor(false, signerSet.threshold)) {
    throw new SendError("invalid_request", 400);
  }
  if (userOp.preVerificationGas > PRE_VERIFICATION_GAS) throw new SendError("invalid_request", 400);
  if (userOp.maxPriorityFeePerGas > userOp.maxFeePerGas) throw new SendError("invalid_request", 400);
  if (totalGas(userOp) * userOp.maxFeePerGas > maxSponsoredWei()) throw new SendError("network_busy", 503);

  return userOp;
}

/** Full send validation: envelope + transfer allow-list + balance. */
async function validateUserOp(
  did: string,
  record: SplitsVaultRecord,
  signerSet: VaultSignerSet,
  raw: PreparedUserOp,
): Promise<UserOperation<"0.7">> {
  const userOp = await validateUserOpEnvelope(did, record, signerSet, raw);
  await validateSendCallData(record, raw.callData);
  return userOp;
}

/**
 * Re-validate a stored/echoed operation and return it with both hashes.
 * Used when starting a pending transfer and again before finalizing it.
 */
export async function validatePreparedSend(
  did: string,
  record: SplitsVaultRecord,
  signerSet: VaultSignerSet,
  raw: PreparedUserOp,
): Promise<{ userOp: UserOperation<"0.7">; hash: Hex; lightHash: Hex }> {
  const userOp = await validateUserOp(did, record, signerSet, raw);
  const hash = getUserOperationHash({
    chainId: mainnet.id,
    entryPointAddress: ENTRY_POINT,
    entryPointVersion: "0.7",
    userOperation: userOp,
  });
  return { userOp, hash, lightHash: computeLightHash(userOp) };
}

/** A WebAuthn approval as it arrives from a signer's browser. */
export type ApprovalSignature = {
  credentialId: string;
  authenticatorData: Hex;
  clientDataJSON: string;
  challengeIndex: number;
  typeIndex: number;
  r: string;
  s: string;
};

/** secp256r1 curve order — the contract rejects high-s signatures. */
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

/**
 * Verify a WebAuthn approval off-chain against the wallet's LIVE signer set,
 * so an invalid approval can never be stored (it would brick the final
 * submission). Returns the signer's on-chain index.
 */
export function verifyApprovalSignature(
  signerSet: VaultSignerSet,
  signature: ApprovalSignature,
  challenge: Hex,
): number {
  const signer = signerSet.signers.find((entry) => entry.credentialId === signature.credentialId);
  if (!signer) throw new SendError("approval_invalid", 400);
  let r: bigint;
  let s: bigint;
  try {
    r = BigInt(signature.r);
    s = BigInt(signature.s);
  } catch {
    throw new SendError("approval_invalid", 400);
  }
  // The on-chain verifier rejects malleable (high-s) signatures.
  if (s > P256_N / 2n) throw new SendError("approval_invalid", 400);
  const valid = WebAuthnP256.verify({
    challenge,
    publicKey: { x: BigInt(signer.publicKeyX), y: BigInt(signer.publicKeyY), prefix: 4 },
    signature: { r, s },
    metadata: {
      authenticatorData: signature.authenticatorData,
      clientDataJSON: signature.clientDataJSON,
      challengeIndex: signature.challengeIndex,
      typeIndex: signature.typeIndex,
      userVerificationRequired: false,
    },
  });
  if (!valid) throw new SendError("approval_invalid", 400);
  return signer.index;
}

/**
 * Validate, sign-wrap, sponsor and submit a prepared send. `signatures` must
 * contain exactly `record.threshold` approvals from distinct signers, in
 * signing order (light hash first, full hash last). Resolves with the
 * transaction hash once the operation is confirmed on-chain.
 */
function assertSignatureSet(signerSet: VaultSignerSet, signatures: WebAuthnSignaturePayload[]): void {
  if (signatures.length !== signerSet.threshold) throw new SendError("invalid_request", 400);
  const liveIndexes = new Set(signerSet.signers.map((signer) => signer.index));
  const seen = new Set<number>();
  for (const signature of signatures) {
    if (
      !Number.isInteger(signature.signerIndex) ||
      !liveIndexes.has(signature.signerIndex) ||
      seen.has(signature.signerIndex)
    ) {
      throw new SendError("invalid_request", 400);
    }
    seen.add(signature.signerIndex);
  }
}

export async function submitSend(
  did: string,
  record: SplitsVaultRecord,
  signerSet: VaultSignerSet,
  raw: PreparedUserOp,
  signatures: WebAuthnSignaturePayload[],
): Promise<{ transactionHash: `0x${string}` }> {
  assertSignatureSet(signerSet, signatures);
  const userOp = await validateUserOp(did, record, signerSet, raw);
  return sponsorAndSubmit(record, userOp, signatures);
}

/** Sponsor gas, simulate, and submit a fully signed operation. */
async function sponsorAndSubmit(
  record: SplitsVaultRecord,
  userOp: UserOperation<"0.7">,
  signatures: WebAuthnSignaturePayload[],
): Promise<{ transactionHash: `0x${string}` }> {
  userOp.signature = encodeVaultSignature(userOp, signatures);
  const packed = toPackedUserOperation(userOp);

  const facilitator = getFacilitatorAccount();
  const client = getMainnetClient();
  const walletClient = getFacilitatorWalletClient();

  // Sponsor: top up the vault's EntryPoint gas deposit to the worst case.
  const requiredPrefund = totalGas(userOp) * userOp.maxFeePerGas;
  const deposit = await client.readContract({
    address: ENTRY_POINT,
    abi: entryPoint07Abi,
    functionName: "balanceOf",
    args: [record.address],
  });
  if (deposit < requiredPrefund) {
    const topUp = requiredPrefund - deposit;
    const facilitatorBalance = await client.getBalance({ address: facilitator.address });
    if (facilitatorBalance < topUp * 2n) throw new SendError("network_busy", 503);
    const depositHash = await walletClient.writeContract({
      address: ENTRY_POINT,
      abi: entryPoint07Abi,
      functionName: "depositTo",
      args: [record.address],
      value: topUp,
    });
    await client.waitForTransactionReceipt({ hash: depositHash, timeout: 90_000 });
  }

  // Dry-run first so an invalid signature never costs real gas.
  try {
    await client.simulateContract({
      address: ENTRY_POINT,
      abi: entryPoint07Abi,
      functionName: "handleOps",
      args: [[packed], facilitator.address],
      account: facilitator.address,
    });
  } catch {
    throw new SendError("signature_rejected", 400);
  }

  const txHash = await walletClient.writeContract({
    address: ENTRY_POINT,
    abi: entryPoint07Abi,
    functionName: "handleOps",
    args: [[packed], facilitator.address],
  });
  const receipt = await client
    .waitForTransactionReceipt({ hash: txHash, timeout: 120_000 })
    .catch(() => null);
  if (!receipt || receipt.status !== "success") throw new SendError("submit_failed", 502);

  // handleOps succeeding is not enough — the inner call has its own success
  // flag on the UserOperationEvent (e.g. a token transfer could still revert).
  const events = parseEventLogs({ abi: entryPoint07Abi, logs: receipt.logs, eventName: "UserOperationEvent" });
  const event = events.find((log) => isAddressEqual(log.args.sender, record.address));
  if (!event || !event.args.success) throw new SendError("submit_failed", 502);

  return { transactionHash: txHash };
}

// ── On-chain signer management ─────────────────────────────────────────────

/**
 * A signer-set change executed by the vault calling ITSELF (the SmartVault's
 * MultiSignerAuth mutators are self-call-only). Used for wallets that are
 * deployed — or funded-but-undeployed, where record edits are blocked
 * because they would change the CREATE2 address; the on-chain path keeps the
 * address because the founding set stays untouched.
 */
export type ManageAction =
  | { type: "addSigner"; publicKeyX: Hex; publicKeyY: Hex }
  | { type: "removeSigner"; signerIndex: number }
  | { type: "setThreshold"; threshold: number };

function lowestFreeSignerIndex(signerSet: VaultSignerSet): number {
  const used = new Set(signerSet.signers.map((signer) => signer.index));
  for (let index = 0; index <= 255; index += 1) {
    if (!used.has(index)) return index;
  }
  throw new SendError("invalid_request", 400);
}

/**
 * Validate a management action against the LIVE signer set and build the
 * exact self-call calldata for it. Deterministic — the same signer set and
 * action always produce the same bytes, which `submitManage` relies on.
 */
export function buildManageCallData(record: SplitsVaultRecord, signerSet: VaultSignerSet, action: ManageAction): Hex {
  let inner: Hex;
  if (action.type === "addSigner") {
    let x: bigint;
    let y: bigint;
    try {
      x = BigInt(action.publicKeyX);
      y = BigInt(action.publicKeyY);
    } catch {
      throw new SendError("invalid_request", 400);
    }
    // Passkeys always have a non-zero Y; a zero Y would enroll an EOA slot.
    if (y === 0n || x === 0n) throw new SendError("invalid_request", 400);
    if (
      signerSet.signers.some(
        (signer) =>
          signer.publicKeyX.toLowerCase() === action.publicKeyX.toLowerCase() &&
          signer.publicKeyY.toLowerCase() === action.publicKeyY.toLowerCase(),
      )
    ) {
      throw new SendError("invalid_request", 400);
    }
    inner = encodeFunctionData({
      abi: MULTI_SIGNER_AUTH_ABI,
      functionName: "addSigner",
      args: [{ slot1: action.publicKeyX as Hex, slot2: action.publicKeyY as Hex }, lowestFreeSignerIndex(signerSet)],
    });
  } else if (action.type === "removeSigner") {
    if (!signerSet.signers.some((signer) => signer.index === action.signerIndex)) {
      throw new SendError("invalid_request", 400);
    }
    // The contract reverts when signerCount would drop below the threshold.
    if (signerSet.signers.length - 1 < signerSet.threshold) throw new SendError("invalid_request", 400);
    inner = encodeFunctionData({ abi: MULTI_SIGNER_AUTH_ABI, functionName: "removeSigner", args: [action.signerIndex] });
  } else {
    if (
      !Number.isInteger(action.threshold) ||
      action.threshold < 1 ||
      action.threshold > signerSet.signers.length ||
      action.threshold === signerSet.threshold
    ) {
      throw new SendError("invalid_request", 400);
    }
    inner = encodeFunctionData({ abi: MULTI_SIGNER_AUTH_ABI, functionName: "updateThreshold", args: [action.threshold] });
  }
  return encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: "execute",
    args: [{ target: record.address, value: 0n, data: inner }],
  });
}

/** Build the unsigned management operation + hashes to sign. */
export async function prepareManage(
  did: string,
  record: SplitsVaultRecord,
  signerSet: VaultSignerSet,
  action: ManageAction,
): Promise<PreparedSend> {
  return buildOperation(did, record, signerSet, buildManageCallData(record, signerSet, action));
}

/**
 * Validate and submit a fully approved management operation. The echoed
 * calldata must be byte-identical to the action re-derived against the
 * CURRENT chain state — nothing but the declared change can be executed.
 */
export async function submitManage(
  did: string,
  record: SplitsVaultRecord,
  signerSet: VaultSignerSet,
  raw: PreparedUserOp,
  signatures: WebAuthnSignaturePayload[],
  action: ManageAction,
): Promise<{ transactionHash: `0x${string}` }> {
  assertSignatureSet(signerSet, signatures);
  const expected = buildManageCallData(record, signerSet, action);
  if (raw.callData.toLowerCase() !== expected.toLowerCase()) throw new SendError("invalid_request", 400);
  const userOp = await validateUserOpEnvelope(did, record, signerSet, raw);
  return sponsorAndSubmit(record, userOp, signatures);
}
