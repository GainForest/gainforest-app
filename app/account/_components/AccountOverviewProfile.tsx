import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { canEditGroupProfile } from "@/app/(manage)/manage/_lib/cgs-permissions";
import type { CgsRole } from "@/app/(manage)/manage/_lib/cgs";
import { EditableAccountHeader } from "@/app/(manage)/manage/_components/EditableAccountHeader";
import { AccountHero } from "./AccountHero";
import { loadAccountMemberships } from "./AccountTabContent";
import { accountSettingsPath, type AccountRouteData } from "../_lib/account-route";

/**
 * Full profile metadata belongs to Overview. The global account header remains
 * compact on every tab, while this section preserves the existing public and
 * role-gated editable profile experiences in their dedicated destination.
 */
export async function AccountOverviewProfile({ account }: { account: AccountRouteData }) {
  const [session, access] = await Promise.all([
    fetchAuthSession(),
    resolveAccountManageAccess(account.urlIdentifier).catch(() => null),
  ]);
  const target = access?.status === "allowed" ? access.target : null;
  const groupRole: CgsRole | undefined = target?.kind === "group"
    ? target.role === "owner"
      ? "owner"
      : target.role === "admin"
        ? "admin"
        : "member"
    : undefined;
  const canEditProfile = target
    ? target.kind === "group"
      ? canEditGroupProfile({ kind: "group", role: groupRole }).allowed
      : true
    : false;
  const memberships = await loadAccountMemberships(account, session);

  return (
    <div data-account-overview-profile className="pt-2">
      {canEditProfile && target ? (
        <EditableAccountHeader
          account={account}
          writeRepoDid={target.kind === "group" ? target.did : undefined}
          groupRole={groupRole}
          settingsHref={accountSettingsPath(account.urlIdentifier)}
          viewPublicHref={null}
          showAbout={false}
          memberships={memberships}
          headingLevel="h2"
        />
      ) : (
        <AccountHero account={account} memberships={memberships} headingLevel="h2" />
      )}
    </div>
  );
}
