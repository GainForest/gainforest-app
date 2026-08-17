import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { ObservationsSection, TreesSection } from "@/app/(manage)/manage/_sections";
import { ObservationsSubNav } from "../../../_components/ObservationsSubNav";
import {
  accountObservationsManagePath,
  getAccountRouteData,
  readAccountRouteParams,
} from "../../../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, t] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    getTranslations("common.observationsManage"),
  ]);

  return {
    title: t("metaTitle", { name: account.displayName }),
    // Private surface: only the owner (or an organization's members) can open
    // it, so it is never handed to search engines.
    robots: { index: false, follow: false },
  };
}

/**
 * Where an account's sightings are managed — added, edited, grouped and
 * attached to projects. The profile's Observations tab still carries this same
 * surface for stewards; this dedicated page is where it is being moved to.
 *
 * Restricted to GainForest admins while it is still being worked on — the same
 * footing as the audio workspace — so the account menu only offers it to them.
 * Two gates apply: the viewer must be an admin, and must also be able to manage
 * this account (its owner, or a member of the organization). Everyone else gets
 * the not-found page.
 *
 * Personal accounts and organizations behave identically — the resolved target
 * decides which repo is written to, nothing else changes.
 */
export default async function AccountObservationsManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ did: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, t] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    getTranslations("common.observationsManage"),
  ]);

  // Hiding the menu row is cosmetic; this is the gate that matters.
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) notFound();

  const access = await resolveAccountManageAccess(account.urlIdentifier);
  if (access.status !== "allowed") notFound();

  // Trees are just sightings that carry measurements, so they stay a layer of
  // this page (?layer=measurements) rather than a surface of their own.
  const layerParam = (await searchParams).layer;
  const showMeasurements = (Array.isArray(layerParam) ? layerParam[0] : layerParam) === "measurements";

  return (
    <>
      {/* The measurements layer carries its own heading, so only the sightings
          view names the page. */}
      {showMeasurements ? null : (
        <div className="mt-4">
          <h1 className="font-instrument text-2xl font-light italic tracking-[-0.03em] text-foreground sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
        </div>
      )}
      <ObservationsSubNav
        identifier={account.urlIdentifier}
        photosHref={accountObservationsManagePath(account.urlIdentifier)}
      />
      {showMeasurements ? <TreesSection target={access.target} /> : <ObservationsSection target={access.target} />}
    </>
  );
}
