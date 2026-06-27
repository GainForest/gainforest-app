import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { canEditGroupProfile } from "@/app/(manage)/manage/_lib/cgs-permissions";
import type { CgsRole } from "@/app/(manage)/manage/_lib/cgs";
import { EditableAccountHeader } from "@/app/(manage)/manage/_components/EditableAccountHeader";
import { AccountChrome } from "../_components/AccountChrome";
import { AccountHero } from "../_components/AccountHero";
import { AccountTabBar } from "../_components/AccountTabBar";
import { accountSettingsPath, getAccountRouteData, readAccountRouteParams, readOptionalAccountRouteParams } from "../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const routeParams = await readOptionalAccountRouteParams(params);
  if (!routeParams) {
    return {
      title: "Profile not found",
      description: "A gentle message for a public profile GainForest cannot find.",
      robots: { index: false, follow: false },
    };
  }

  const account = await getAccountRouteData(routeParams.did, routeParams.urlIdentifier);
  return {
    title: `${account.displayName} — Account`,
    description: account.description ?? `Public GainForest profile for ${account.displayName}.`,
    alternates: { canonical: `/account/${encodeURIComponent(account.urlIdentifier)}` },
  };
}

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ did: string }>;
}) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  const session = await fetchAuthSession();

  // Owners (and org admins) edit their profile in place; everyone else — including
  // plain org members, who can still manage records through the tabs — sees the
  // read-only public hero.
  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  const target = access?.status === "allowed" ? access.target : null;
  const groupRole: CgsRole | undefined = target?.kind === "group"
    ? target.role === "owner" ? "owner" : target.role === "admin" ? "admin" : "member"
    : undefined;
  const canEditProfile = target
    ? target.kind === "group"
      ? canEditGroupProfile({ kind: "group", role: groupRole }).allowed
      : true
    : false;
  const canManage = Boolean(target);

  // Your organizations are private to you: the group service only lets us read
  // your own memberships, so this tab appears only on your own profile.
  const showOrganizations = account.kind === "user" && session.isLoggedIn && session.did === account.did;

  return (
    <main className="w-full">
      <AccountChrome
        hero={
          <>
            {canEditProfile && target ? (
              <EditableAccountHeader
                account={account}
                writeRepoDid={target.kind === "group" ? target.did : undefined}
                groupRole={groupRole}
                settingsHref={accountSettingsPath(account.urlIdentifier)}
                viewPublicHref={null}
                showAbout={false}
              />
            ) : (
              <AccountHero account={account} />
            )}
            <AccountTabBar
              did={account.urlIdentifier}
              accountKind={account.kind}
              showOrganizations={showOrganizations}
              includeSettings={canManage}
              showOrgData={canManage}
            />
          </>
        }
      >
        {children}
      </AccountChrome>
    </main>
  );
}
