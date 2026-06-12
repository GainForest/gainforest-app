import type { AccountRouteData } from "@/app/account/_lib/account-route";
import { ManageDashboardClient } from "./ManageDashboardClient";
import type { ManageMode } from "./manageDashboardMode";
import type { CgsMember, CgsRole } from "../_lib/cgs";

export function ManageDashboard({
  account,
  mode,
  basePath,
  writeRepoDid,
  groupRole,
  initialGroupMembers,
  initialGroupMembersError,
  children,
}: {
  account: AccountRouteData;
  mode?: ManageMode | null;
  basePath?: string;
  writeRepoDid?: string;
  groupRole?: CgsRole;
  initialGroupMembers?: CgsMember[];
  initialGroupMembersError?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <ManageDashboardClient
      account={account}
      mode={mode}
      basePath={basePath}
      writeRepoDid={writeRepoDid}
      groupRole={groupRole}
      initialGroupMembers={initialGroupMembers}
      initialGroupMembersError={initialGroupMembersError}
    >
      {children}
    </ManageDashboardClient>
  );
}
