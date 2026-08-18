/** USDC on Ethereum mainnet — constants and minimal ABI for EIP-3009 TransferWithAuthorization. */

export const CHAIN_ID = 1 as const;
export const CHAIN_NAME = "Ethereum" as const;
export const RPC_URL = "https://ethereum-rpc.publicnode.com" as const;
export const BLOCK_EXPLORER_URL = "https://etherscan.io" as const;
export const PAYMENT_NETWORK = "ethereum" as const;
export const PAYMENT_RAIL = "x402-usdc-ethereum" as const;
export const USDC_CONTRACT = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
export const DECIMALS = 6 as const;

export const EIP3009_DOMAIN_NAME = "USD Coin" as const;
export const EIP3009_DOMAIN_VERSION = "2" as const;

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export const EIP3009_TYPES_FOR_WALLET = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  ...EIP3009_TYPES,
} as const;

export const USDC_ABI = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export function toUsdcUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** DECIMALS));
}

export function fromUsdcUnits(units: bigint): string {
  const whole = units / BigInt(10 ** DECIMALS);
  const frac = units % BigInt(10 ** DECIMALS);
  const fracStr = frac.toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}
