import type { AccountRouteData } from "@/app/account/_lib/account-route";
import { ManageDashboardClient } from "./ManageDashboardClient";

export function ManageDashboard({
  account,
  mode,
}: {
  account: AccountRouteData;
  mode: string | null;
}) {
  return <ManageDashboardClient account={account} mode={mode} />;
}
