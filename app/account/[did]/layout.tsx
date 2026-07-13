import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { canEditGroupProfile } from "@/app/(manage)/manage/_lib/cgs-permissions";
import type { CgsRole } from "@/app/(manage)/manage/_lib/cgs";
import { EditableAccountHeader } from "@/app/(manage)/manage/_components/EditableAccountHeader";
import { fetchHiddenAccountDids, fetchRecognitionBadgesForDid } from "@/app/_lib/indexer";
import { fetchEndorsementsGivenCount } from "@/app/_lib/endorsements-given";
import { RECOGNITION_BADGE_KEYS, type RecognitionBadgeKey } from "@/app/_lib/recognition-badges";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { getRequestOrigin } from "@/app/_lib/request-origin";
import { AccountChrome } from "../_components/AccountChrome";
import { AccountHero } from "../_components/AccountHero";
import { AccountTabBar } from "../_components/AccountTabBar";
import { StewardTools } from "../_components/StewardTools";
import { RecognitionBadgeChips } from "../_components/RecognitionBadgeChips";
import { loadAccountMemberships } from "../_components/AccountTabContent";
import { accountSettingsPath, getAccountRouteData, readAccountRouteParams, readOptionalAccountRouteParams, type AccountRouteData } from "../_lib/account-route";

function absoluteUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function uniqueUrls(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map(absoluteUrlOrNull).filter((value): value is string => Boolean(value))));
}

function withoutEmptyValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)) as T;
}

function buildAccountProfileJsonLd(origin: string, account: AccountRouteData): Record<string, unknown> {
  const profileUrl = new URL(`/account/${encodeURIComponent(account.urlIdentifier)}`, origin).toString();
  const sameAs = uniqueUrls([account.website, ...account.socialLinks]);
  const image = absoluteUrlOrNull(account.avatarUrl);
  const description = account.description || account.longDescription || undefined;
  const mainEntity = withoutEmptyValues({
    "@type": account.kind === "organization" ? "Organization" : "Person",
    name: account.displayName,
    description,
    url: profileUrl,
    image,
    sameAs: sameAs.length ? sameAs : undefined,
    foundingDate: account.kind === "organization" ? account.foundedDate : undefined,
    address: account.kind === "organization" && account.country
      ? { "@type": "PostalAddress", addressCountry: account.country }
      : undefined,
  });

  return withoutEmptyValues({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: account.displayName,
    description,
    url: profileUrl,
    primaryImageOfPage: image,
    mainEntity,
  });
}

function AccountProfileJsonLd({ jsonLd }: { jsonLd: Record<string, unknown> }) {
  return (
    <script
      id="account-profile-json-ld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

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
  const accountHref = `/account/${encodeURIComponent(account.urlIdentifier)}`;
  const title = `${account.displayName} — Account`;
  const description = account.description ?? `Public GainForest profile for ${account.displayName}.`;
  const previewImage = account.avatarUrl ? [{ url: account.avatarUrl, alt: account.displayName }] : undefined;

  return {
    title,
    description,
    alternates: await localizedAlternates(`/account/${encodeURIComponent(account.urlIdentifier)}`),
    openGraph: {
      title,
      description,
      url: accountHref,
      images: previewImage,
    },
    twitter: {
      card: previewImage ? "summary_large_image" : "summary",
      title,
      description,
      images: previewImage,
    },
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
  const [account, session, origin] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    fetchAuthSession(),
    getRequestOrigin(),
  ]);

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
  // The "Endorsements given" tab appears only for organizations that have
  // signed at least one Organization Endorsement badge award. Cached per org.
  const showEndorsementsGiven = account.kind === "organization"
    ? (await fetchEndorsementsGivenCount(account.did).catch(() => 0)) > 0
    : false;
  // The Equipment tab is a private inventory surface, not a public showcase:
  // organizations aggregate the whole team's gear, so — like Members — it
  // only shows to people who belong to the organization, and personal
  // profiles only show it to the signed-in owner. (Individual equipment
  // detail pages stay public, since deployments reference them.)
  const isOwner = session.isLoggedIn && session.did === account.did;
  const showEquipment = account.kind === "organization" ? canManage : isOwner;

  const profileJsonLd = buildAccountProfileJsonLd(origin, account);

  return (
    <main className="w-full">
      <AccountProfileJsonLd jsonLd={profileJsonLd} />
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
              // Tainá is a personal Telegram assistant, so its dashboard tab
              // only appears to the signed-in owner of this profile. Ownership
              // (session DID === account DID) is the whole gate: it can only
              // ever match a personal repo, and some personal accounts carry
              // an organization record, so don't also require kind === "user".
              includeTaina={isOwner}
              showEndorsementsGiven={showEndorsementsGiven}
              showEquipment={showEquipment}
            />
          </>
        }
      >
        {children}
      </AccountChrome>
    </main>
  );
}
