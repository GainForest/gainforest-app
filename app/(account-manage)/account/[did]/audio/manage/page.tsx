import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { AudioSection } from "@/app/(manage)/manage/_sections";
import { AudioMothClient } from "@/app/audiomoth/_components/AudioMothClient";
import Container from "@/components/ui/container";
import { ObservationsSubNav } from "@/app/account/_components/ObservationsSubNav";
import {
  accountAudioManagePath,
  accountObservationsManagePath,
  getAccountRouteData,
  readAccountRouteParams,
} from "@/app/account/_lib/account-route";

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
 * Where an account's recordings are managed — the full recording workflow
 * (the library with its deployments, SD-card upload, labelling,
 * identifications, the soundscape workbench and USB device setup), extracted from the audio hub so
 * that all management happens here. The twin of the observations workspace,
 * reached from the Audio pill beside it, and like it standing alone:
 * The route sits outside the profile segment, so it renders without the
 * profile hero and tabs from the first server paint.
 *
 * The workspace acts on the account named in the URL: the account context
 * syncs itself to /account/<id>/… routes, and the gate below guarantees the
 * viewer can manage that account, so reads and writes land in its repo.
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

  const subNav = (
    <ObservationsSubNav
      identifier={account.urlIdentifier}
      photosHref={accountObservationsManagePath(account.urlIdentifier)}
      audioHref={accountAudioManagePath(account.urlIdentifier)}
    />
  );

  // The legacy record editor has no surface of its own; it stays reachable
  // through the same explicit ?section= / ?mode= deep links it always had.
  const sp = await searchParams;
  if (typeof sp.section === "string" || typeof sp.mode === "string") {
    return (
      <Container className="pt-6 pb-8">
        {subNav}
        <AudioSection target={access.target} />
      </Container>
    );
  }

  return (
    <div className="pb-16">
      {/* Matches the workspace sections' width (max-w-6xl px-6) so the title
          lines up with the pills and tab bar below it. */}
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <h1 className="font-instrument text-2xl font-light italic tracking-[-0.03em] text-foreground sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
      </div>
      <AudioMothClient
        sessionDid={moderator.session.isLoggedIn ? moderator.session.did : null}
        showHero={false}
        mediaTabs={subNav}
      />
    </div>
  );
}
