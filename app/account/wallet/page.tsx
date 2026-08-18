import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { accountWalletPath } from "../_lib/account-route";

// Shortcut: /account/wallet → the signed-in user's own Wallet page
// (/account/<identifier>/wallet). Used by Tainá's wallet tour so it can
// navigate there without knowing the visitor's handle.

export const metadata: Metadata = {
  title: "Wallet — GainForest",
  robots: { index: false, follow: false },
};

export default async function AccountWalletShortcutPage() {
  const target = await resolvePersonalManageTarget();
  redirect(target ? accountWalletPath(target.identifier) : "/account");
}
