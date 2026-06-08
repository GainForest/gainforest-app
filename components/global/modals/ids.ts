/** Centralized modal ID constants for the global funding / wallet modals. */
export const MODAL_IDS = {
  // Funding config (owner donation settings)
  FUNDING_CONFIG: "funding/config",

  // Wallet linking
  WALLET_ADD: "wallet/add",
  WALLET_MANAGE: "wallet/manage",
  WALLET_DELETE: "wallet/delete",
} as const;

export type ModalId = (typeof MODAL_IDS)[keyof typeof MODAL_IDS];
