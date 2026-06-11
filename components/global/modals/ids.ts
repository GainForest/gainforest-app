/** Centralized modal ID constants for global modals. */
export const MODAL_IDS = {
  // Funding config (owner donation settings)
  FUNDING_CONFIG: "funding/config",

  // Wallet linking
  WALLET_ADD: "wallet/add",
  WALLET_MANAGE: "wallet/manage",
  WALLET_DELETE: "wallet/delete",

  // Tree upload
  UPLOAD_TREES_COMPLETE: "upload/trees/complete",
  UPLOAD_TREES_FEEDBACK: "upload/trees/feedback",
  MANAGE_TREE_ADD_TO_TREE_GROUP: "manage/tree/add-to-tree-group",
} as const;

export type ModalId = (typeof MODAL_IDS)[keyof typeof MODAL_IDS];
