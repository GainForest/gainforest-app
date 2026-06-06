import type { AccountRouteData } from "@/app/account/_lib/account-route";
import { AccountTabBar } from "@/app/account/_components/AccountTabBar";

export function ManageAccountTabs({ account }: { account: AccountRouteData }) {
  return (
    <AccountTabBar
      did={account.urlIdentifier}
      accountKind={account.kind}
      scope="manage"
      includeSettings
    />
  );
}
