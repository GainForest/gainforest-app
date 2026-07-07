import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { listGroupMemberDids } from "@/app/_lib/equipment-server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { CanonicalRedirect } from "@/app/account/_components/CanonicalRedirect";
import { EquipmentSection } from "../../_components/EquipmentSection";
import { accountEquipmentPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, t] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    getTranslations("common.equipment"),
  ]);
  return {
    title: t("metadataTitle", { name: account.displayName }),
    robots: { index: false, follow: false },
  };
}

export default async function AccountEquipmentPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountEquipmentPath(account.urlIdentifier)} />;
  }

  const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false as const }));
  const viewerDid = session.isLoggedIn ? session.did : null;

  if (account.kind === "organization") {
    // The organization tab aggregates every team member's gear. The team
    // roster is only readable by people who belong to the organization, so —
    // like the Members tab — this surface stays members-only.
    const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
    if (!access || access.status !== "allowed") notFound();

    // Some personal accounts legitimately carry an organization record; they
    // have no team roster, so those fall through to the personal view below.
    if (access.target.kind === "group") {
      let memberDids: string[] = [];
      let membersUnavailable = false;
      try {
        memberDids = await listGroupMemberDids(access.target.did);
      } catch {
        // Fall back to what we can still show: gear on the org's own repo plus
        // the signed-in member's, with a soft note that the list is partial.
        membersUnavailable = true;
        memberDids = viewerDid ? [viewerDid] : [];
      }

      const repos = [...new Set([account.did, ...memberDids])];
      return (
        <EquipmentSection
          variant="organization"
          repos={repos}
          viewerDid={viewerDid}
          canAdd={Boolean(viewerDid && (memberDids.includes(viewerDid) || membersUnavailable))}
          membersUnavailable={membersUnavailable}
        />
      );
    }
  }

  // Personal profiles: the equipment registry is a private inventory surface,
  // so only the signed-in owner can see it (individual equipment detail pages
  // stay public, since deployments reference them).
  if (viewerDid !== account.did) notFound();

  return (
    <EquipmentSection
      variant="personal"
      repos={[account.did]}
      viewerDid={viewerDid}
      canAdd={viewerDid === account.did}
    />
  );
}
