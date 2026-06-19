import type { AccountRouteData } from "@/app/account/_lib/account-route";
import { ManageDashboardClient } from "./ManageDashboardClient";
import type { ManageMode } from "./manageDashboardMode";
import type { CgsRole } from "../_lib/cgs";

export function ManageDashboard({
  account,
  mode,
  basePath,
  writeRepoDid,
  groupRole,
  currentUserDid,
  children,
}: {
  account: AccountRouteData;
  mode?: ManageMode | null;
  basePath?: string;
  writeRepoDid?: string;
  groupRole?: CgsRole;
  currentUserDid?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <ManageDashboardClient
      account={account}
      mode={mode}
      basePath={basePath}
      writeRepoDid={writeRepoDid}
      groupRole={groupRole}
      currentUserDid={currentUserDid}
    >
      {children}
    </ManageDashboardClient>
  );
}
