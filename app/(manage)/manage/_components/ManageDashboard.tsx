import type { AccountRouteData } from "@/app/account/_lib/account-route";
import { ManageDashboardClient } from "./ManageDashboardClient";
import type { ManageMode } from "./manageDashboardMode";

export function ManageDashboard({
  account,
  mode,
  children,
}: {
  account: AccountRouteData;
  mode?: ManageMode | null;
  children?: React.ReactNode;
}) {
  return <ManageDashboardClient account={account} mode={mode}>{children}</ManageDashboardClient>;
}
