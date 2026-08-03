import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CanonicalRedirect } from "@/app/account/_components/CanonicalRedirect";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { ProfileActivity } from "../../_components/ProfileActivity";
import {
  accountLikesPath,
  getAccountRouteData,
  readOptionalAccountRouteParams,
} from "../../_lib/account-route";

type LikesRouteAccess = {
  account: Awaited<ReturnType<typeof getAccountRouteData>>;
  urlIdentifier: string;
  allowed: boolean;
};

/**
 * Likes reveal an account holder's reading and support history. They are not a
 * public profile activity: a personal account can see only its own likes, while
 * a shared organization account can be viewed by its members. This gate lives
 * in the server page so a pasted `/likes` URL never mounts the client indexer
 * query for another visitor.
 */
async function getLikesRouteAccess(params: Promise<{ did: string }>): Promise<LikesRouteAccess | null> {
  const routeParams = await readOptionalAccountRouteParams(params);
  if (!routeParams) return null;

  const [account, session, manageAccess] = await Promise.all([
    getAccountRouteData(routeParams.did, routeParams.urlIdentifier),
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
    resolveAccountManageAccess(routeParams.urlIdentifier).catch(() => null),
  ]);
  const isPersonalOwner = session.isLoggedIn && session.did === account.did;
  const isOrganizationMember = manageAccess?.status === "allowed" && manageAccess.target.kind === "group";

  return { account, urlIdentifier: routeParams.urlIdentifier, allowed: isPersonalOwner || isOrganizationMember };
}

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const access = await getLikesRouteAccess(params);
  if (!access?.allowed) {
    return { title: "Profile not found", robots: { index: false, follow: false } };
  }
  const t = await getTranslations("common.activity");
  return {
    title: `${access.account.displayName} — ${t("likesTab")}`,
    robots: { index: false, follow: false },
  };
}

export default async function AccountLikesPage({ params }: { params: Promise<{ did: string }> }) {
  const access = await getLikesRouteAccess(params);
  if (!access?.allowed) notFound();

  const { account, urlIdentifier } = access;
  if (urlIdentifier !== account.urlIdentifier) {
    return <CanonicalRedirect to={accountLikesPath(account.urlIdentifier)} />;
  }

  return <ProfileActivity did={account.did} identifier={account.urlIdentifier} active="likes" showLikes />;
}
