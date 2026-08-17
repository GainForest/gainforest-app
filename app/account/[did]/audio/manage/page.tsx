import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { canDeleteRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";
import { AudioSection } from "@/app/(manage)/manage/_sections";
import Container from "@/components/ui/container";
import { ObservationsSubNav } from "../../../_components/ObservationsSubNav";
import {
  accountAudioManagePath,
  accountObservationsManagePath,
  getAccountRouteData,
  readAccountRouteParams,
} from "../../../_lib/account-route";
import { AccountAudioViewer } from "../AccountAudioViewer";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, t] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    getTranslations("common.audioManage"),
  ]);

  return {
    title: t("metaTitle", { name: account.displayName }),
    robots: { index: false, follow: false },
  };
}

/**
 * Where an account's recordings are managed — uploading, renaming, deleting.
 * The twin of the observations workspace, reached from the Audio pill beside
 * it, and like it, standing alone: AccountChrome passes it through without the
 * profile hero and tabs, because user management is moving onto its own pages.
 *
 * Same staged gate as its twin: the viewer must be a GainForest admin and must
 * be able to manage this account. Every other steward keeps their recording
 * tools on the profile's Audio tab until this opens up.
 */
export default async function AccountAudioManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ did: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, t] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    getTranslations("common.audioManage"),
  ]);

  // Hiding the entry points is cosmetic; this is the gate that matters.
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) notFound();

  const access = await resolveAccountManageAccess(account.urlIdentifier);
  if (access.status !== "allowed") notFound();
  const target = access.target;

  // The legacy record editor has no surface of its own; it stays reachable
  // through the same explicit deep links it always had.
  const sp = await searchParams;
  const wantsEditor = typeof sp.section === "string" || typeof sp.mode === "string";

  const subNav = (
    <ObservationsSubNav
      identifier={account.urlIdentifier}
      photosHref={accountObservationsManagePath(account.urlIdentifier)}
      audioHref={accountAudioManagePath(account.urlIdentifier)}
    />
  );

  if (wantsEditor) {
    return (
      <Container className="pt-6 pb-8">
        {subNav}
        <AudioSection target={target} />
      </Container>
    );
  }

  return (
    <Container className="pt-6 pb-8">
      <div>
        <h1 className="font-instrument text-2xl font-light italic tracking-[-0.03em] text-foreground sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
      </div>
      {subNav}
      {/* Embedded: this page already carries the title, width and padding, so
          the viewer drops its own rather than repeating them. */}
      <AccountAudioViewer
        did={account.did}
        showUploadCta={target.kind === "personal"}
        canDelete={canDeleteRecord(target).allowed}
        mutationRepo={target.kind === "group" ? target.did : null}
        embedded
      />
    </Container>
  );
}
