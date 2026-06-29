import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { canEditGroupProfile } from "@/app/(manage)/manage/_lib/cgs-permissions";
import type { CgsRole } from "@/app/(manage)/manage/_lib/cgs";
import { EditableAccountHeader } from "@/app/(manage)/manage/_components/EditableAccountHeader";
import { fetchHiddenAccountDids, fetchRecognitionBadgesForDid } from "@/app/_lib/indexer";
import { RECOGNITION_BADGE_KEYS, type RecognitionBadgeKey } from "@/app/_lib/recognition-badges";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { AccountChrome } from "../_components/AccountChrome";
import { AccountHero } from "../_components/AccountHero";
import { AccountTabBar } from "../_components/AccountTabBar";
import { StewardTools } from "../_components/StewardTools";
import { RecognitionBadgeChips } from "../_components/RecognitionBadgeChips";
import { loadAccountMemberships } from "../_components/AccountTabContent";
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

  // The organizations you belong to are private to you: the group service only
  // lets us read your own memberships, so they surface as a "Member of…" row in
  // the hero of your own profile (empty everywhere else).
  const memberships = await loadAccountMemberships(account, session);

  // GainForest stewards (any group member) can hide an account as a test
  // account. Only resolve the current flag state for actual moderators so the
  // extra reads never run for ordinary visitors.
  const moderator = session.isLoggedIn ? await getGainForestModeratorAccess().catch(() => null) : null;
  const testAccountFlagged = moderator?.isModerator
    ? await fetchHiddenAccountDids().then((dids) => dids.has(account.did)).catch(() => false)
    : null;
  // Steward-awarded recognition badges shown publicly on the profile (and used
  // as the moderator control's initial state). One cached index read per view.
  const awardedRecognition: RecognitionBadgeKey[] = await fetchRecognitionBadgesForDid(account.did)
    .then((keys) => RECOGNITION_BADGE_KEYS.filter((key) => keys.has(key)))
    .catch(() => []);
  // The Admin tab (list of flagged test accounts) lives on the admin group's
  // own profile, shown to any of its members.
  const showAdminTab = Boolean(moderator?.isModerator && moderator.repoDid === account.did);

  return (
    <main className="w-full">
      <AccountChrome
        hero={
          <>
            {moderator?.isModerator && testAccountFlagged !== null ? (
              <StewardTools
                did={account.did}
                accountName={account.displayName}
                initialTestFlagged={testAccountFlagged}
                initialAwarded={awardedRecognition}
              />
            ) : null}
            {canEditProfile && target ? (
              <EditableAccountHeader
                account={account}
                writeRepoDid={target.kind === "group" ? target.did : undefined}
                groupRole={groupRole}
                settingsHref={accountSettingsPath(account.urlIdentifier)}
                viewPublicHref={null}
                showAbout={false}
                memberships={memberships}
              />
            ) : (
              <AccountHero account={account} memberships={memberships} />
            )}
            <RecognitionBadgeChips badges={awardedRecognition} />
            <AccountTabBar
              did={account.urlIdentifier}
              accountKind={account.kind}
              includeSettings={canManage}
              showOrgData={canManage}
              showAdmin={showAdminTab}
            />
          </>
        }
      >
        {children}
      </AccountChrome>
    </main>
  );
}
