import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  FingerprintIcon,
  MapPinIcon,
  RadioIcon,
  RouteIcon,
} from "lucide-react";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { formatDate } from "@/app/_lib/format";
import { getDeploymentEvent, linkedEquipmentUri, parseAtUri } from "@/app/_lib/deployment-events";
import { equipmentDetailPath } from "@/app/_lib/equipment";
import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import { accountEquipmentPath, accountPath } from "@/app/account/_lib/account-route";
import { DeploymentLocationMap } from "./DeploymentLocationMap";
import { DeploymentDetailActions } from "./DeploymentDetailActions";
import { DeploymentRecordings } from "./DeploymentRecordings";
import { AssetAttribution, AssetMetaRow } from "@/app/equipment/[did]/[rkey]/AssetDetailPrimitives";

export const dynamic = "force-dynamic";

type DeploymentPageParams = Promise<{ did: string; rkey: string }>;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function loadDeployment(params: DeploymentPageParams) {
  const { did: encodedDid, rkey: encodedRkey } = await params;
  const did = safeDecode(encodedDid);
  const rkey = safeDecode(encodedRkey);
  if (!did.startsWith("did:")) notFound();
  const item = await getDeploymentEvent(did, rkey).catch(() => null);
  if (!item) notFound();
  return item;
}

export async function generateMetadata({ params }: { params: DeploymentPageParams }): Promise<Metadata> {
  const item = await loadDeployment(params);
  const t = await getTranslations("common.audiomoth.deployments");
  const name = item.locality ?? t("untitled");
  return {
    title: t("metadataTitle", { name }),
    robots: { index: false, follow: false },
  };
}

export default async function DeploymentDetailPage({ params }: { params: DeploymentPageParams }) {
  const item = await loadDeployment(params);
  const t = await getTranslations("common.audiomoth.deployments");
  const tProfile = await getTranslations("common.feed.profileCard");

  const [session, ownerProfile] = await Promise.all([
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
    getCertifiedProfileCard(item.did).catch(() => null),
  ]);
  const viewerDid = session.isLoggedIn ? session.did : null;
  const isOwner = viewerDid === item.did;
  const ownerName = ownerProfile?.displayName?.trim() || tProfile("unnamed");
  const name = item.locality ?? t("untitled");

  const lat = item.decimalLatitude !== null && item.decimalLatitude !== undefined
    ? Number(item.decimalLatitude)
    : NaN;
  const lon = item.decimalLongitude !== null && item.decimalLongitude !== undefined
    ? Number(item.decimalLongitude)
    : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

  const linkedUri = linkedEquipmentUri(item.eventRemarks);
  const linkedParts = linkedUri ? parseAtUri(linkedUri) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-20 pt-8 md:pt-12">
      <Link
        href="/audiomoth?tab=deployments"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
        {t("detailBack")}
      </Link>

      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <MapPinIcon className="size-7" />
          </span>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{item.eventID}</p>
          </div>
        </div>
        {isOwner && viewerDid ? <DeploymentDetailActions event={item} sessionDid={viewerDid} /> : null}
      </header>

      {hasCoords ? (
        <div className="mt-8">
          <DeploymentLocationMap lat={lat} lon={lon} label={name} />
        </div>
      ) : null}

      <section className="mt-8 rounded-2xl bg-muted/40 p-5 sm:p-6">
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <AssetMetaRow icon={<FingerprintIcon className="h-4 w-4" aria-hidden />} label={t("deploymentIdLabel")}>
            <span className="font-mono">{item.eventID}</span>
          </AssetMetaRow>
          <AssetMetaRow icon={<CalendarIcon className="h-4 w-4" aria-hidden />} label={t("deployedLabel")}>
            {formatDate(item.eventDate)}
          </AssetMetaRow>
          <AssetMetaRow icon={<MapPinIcon className="h-4 w-4" aria-hidden />} label={t("coordinatesLabel")}>
            {hasCoords ? (
              <a
                href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono underline-offset-2 hover:underline"
              >
                {lat.toFixed(5)}, {lon.toFixed(5)}
                <ArrowUpRightIcon className="h-3 w-3" aria-hidden />
              </a>
            ) : (
              "—"
            )}
          </AssetMetaRow>
          <AssetMetaRow icon={<RadioIcon className="h-4 w-4" aria-hidden />} label={t("equipmentUsedLabel")}>
            {linkedParts ? (
              <Link
                href={equipmentDetailPath(linkedParts.did, linkedParts.rkey)}
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                {item.equipmentUsed ?? t("equipmentLinked")}
                <ArrowUpRightIcon className="h-3 w-3" aria-hidden />
              </Link>
            ) : (
              item.equipmentUsed ?? "—"
            )}
          </AssetMetaRow>
          {item.samplingProtocol ? (
            <AssetMetaRow icon={<RouteIcon className="h-4 w-4" aria-hidden />} label={t("protocolLabel")}>
              {item.samplingProtocol}
            </AssetMetaRow>
          ) : null}
        </dl>
      </section>

      <DeploymentRecordings did={item.did} eventUri={item.uri} isOwner={isOwner} />

      <AssetAttribution
        heading={t("recordedByLabel")}
        href={isOwner ? accountEquipmentPath(item.did) : accountPath(item.did)}
        ownerName={ownerName}
        avatarUrl={ownerProfile?.avatarUrl}
        actionLabel={isOwner ? t("viewEquipment") : tProfile("viewProfile")}
      />
    </main>
  );
}
