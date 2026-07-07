import type { Metadata } from "next";
import type { ReactNode } from "react";
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
import { formatDate, shortDid } from "@/app/_lib/format";
import { getDeploymentEvent, linkedEquipmentUri, parseAtUri } from "@/app/_lib/deployment-events";
import { equipmentDetailPath } from "@/app/_lib/equipment";
import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import { accountEquipmentPath } from "@/app/account/_lib/account-route";
import { DeploymentLocationMap } from "./DeploymentLocationMap";
import { DeploymentDetailActions } from "./DeploymentDetailActions";
import { DeploymentRecordings } from "./DeploymentRecordings";

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

  const [session, ownerProfile] = await Promise.all([
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
    getCertifiedProfileCard(item.did).catch(() => null),
  ]);
  const viewerDid = session.isLoggedIn ? session.did : null;
  const isOwner = viewerDid === item.did;
  const ownerName = ownerProfile?.displayName?.trim() || shortDid(item.did);
  const name = item.locality ?? t("untitled");

  const lat = item.decimalLatitude ? Number(item.decimalLatitude) : NaN;
  const lon = item.decimalLongitude ? Number(item.decimalLongitude) : NaN;
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
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
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

      <section className="mt-4 rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <MetaRow icon={<FingerprintIcon className="h-4 w-4" aria-hidden />} label={t("deploymentIdLabel")}>
            <span className="font-mono">{item.eventID}</span>
          </MetaRow>
          <MetaRow icon={<CalendarIcon className="h-4 w-4" aria-hidden />} label={t("deployedLabel")}>
            {formatDate(item.eventDate)}
          </MetaRow>
          <MetaRow icon={<MapPinIcon className="h-4 w-4" aria-hidden />} label={t("coordinatesLabel")}>
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
          </MetaRow>
          <MetaRow icon={<RadioIcon className="h-4 w-4" aria-hidden />} label={t("equipmentUsedLabel")}>
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
          </MetaRow>
          {item.samplingProtocol ? (
            <MetaRow icon={<RouteIcon className="h-4 w-4" aria-hidden />} label={t("protocolLabel")}>
              {item.samplingProtocol}
            </MetaRow>
          ) : null}
        </dl>
      </section>

      <DeploymentRecordings did={item.did} eventUri={item.uri} isOwner={isOwner} />

      <section className="mt-4 rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t("recordedByLabel")}
        </p>
        <Link href={accountEquipmentPath(item.did)} className="group mt-3 flex items-center gap-3">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
            {ownerProfile?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary PDS/CDN hosts
              <img src={ownerProfile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-sm font-semibold text-muted-foreground">
                {ownerName.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
              {ownerName}
            </span>
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              {t("viewEquipment")}
              <ArrowUpRightIcon className="h-3 w-3" aria-hidden />
            </span>
          </span>
        </Link>
      </section>
    </main>
  );
}

function MetaRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">{label}</dt>
        <dd className="mt-0.5 text-sm leading-snug text-foreground">{children}</dd>
      </div>
    </div>
  );
}
