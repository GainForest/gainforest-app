import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  MapPinIcon,
  NotebookPenIcon,
  TagIcon,
  UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { formatDate, shortDid } from "@/app/_lib/format";
import { STATUS_TONES, categoryIcon, getEquipment, type EquipmentStatusTone } from "@/app/_lib/equipment";
import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import { RecordEngagement } from "@/app/_components/RecordEngagement";
import { accountEquipmentPath, accountPath } from "@/app/account/_lib/account-route";
import { EquipmentDetailActions } from "./EquipmentDetailActions";

export const dynamic = "force-dynamic";

type EquipmentPageParams = Promise<{ did: string; rkey: string }>;

const TONE_BADGE: Record<EquipmentStatusTone, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  down: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function loadEquipment(params: EquipmentPageParams) {
  const { did: encodedDid, rkey: encodedRkey } = await params;
  const did = safeDecode(encodedDid);
  const rkey = safeDecode(encodedRkey);
  if (!did.startsWith("did:")) notFound();
  const item = await getEquipment(did, rkey).catch(() => null);
  if (!item) notFound();
  return item;
}

export async function generateMetadata({ params }: { params: EquipmentPageParams }): Promise<Metadata> {
  const item = await loadEquipment(params);
  const t = await getTranslations("common.equipment.detail");
  return {
    title: t("metadataTitle", { name: item.name }),
    robots: { index: false, follow: false },
  };
}

export default async function EquipmentDetailPage({ params }: { params: EquipmentPageParams }) {
  const item = await loadEquipment(params);
  const t = await getTranslations("common.equipment");
  const tProfile = await getTranslations("common.feed.profileCard");

  const [session, ownerProfile] = await Promise.all([
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
    getCertifiedProfileCard(item.did).catch(() => null),
  ]);
  const viewerDid = session.isLoggedIn ? session.did : null;
  const isOwner = viewerDid === item.did;
  const ownerName = ownerProfile?.displayName?.trim() || shortDid(item.did);

  const mapUrl = item.geo
    ? `https://www.openstreetmap.org/?mlat=${item.geo.lat}&mlon=${item.geo.lon}#map=15/${item.geo.lat}/${item.geo.lon}`
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-20 pt-8 md:pt-12">
      {/* The registry list is owner-only, so only the owner gets a back link to it. */}
      {isOwner ? (
        <Link
          href={accountEquipmentPath(item.did)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
          {t("detail.back")}
        </Link>
      ) : null}

      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-muted text-3xl">
            {categoryIcon(item.category)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{item.name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{item.assetId || t("table.noId")}</span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  TONE_BADGE[STATUS_TONES[item.status]],
                )}
              >
                {t(`statuses.${item.status}`)}
              </span>
            </p>
          </div>
        </div>
        {isOwner ? <EquipmentDetailActions item={item} ownerDid={item.did} /> : null}
      </header>

      <section className="mt-8 rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <MetaRow icon={<TagIcon className="h-4 w-4" aria-hidden />} label={t("table.type")}>
            {t(`categories.${item.category}`)}
          </MetaRow>
          <MetaRow icon={<UserIcon className="h-4 w-4" aria-hidden />} label={t("table.holder")}>
            {item.currentOwner ?? "—"}
          </MetaRow>
          <MetaRow icon={<MapPinIcon className="h-4 w-4" aria-hidden />} label={t("table.site")}>
            {item.projectSite ?? "—"}
          </MetaRow>
          <MetaRow icon={<MapPinIcon className="h-4 w-4" aria-hidden />} label={t("detail.coordinates")}>
            {item.geo && mapUrl ? (
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-sm underline-offset-2 hover:underline"
              >
                {item.geo.lat.toFixed(5)}, {item.geo.lon.toFixed(5)}
                <ArrowUpRightIcon className="h-3 w-3" aria-hidden />
              </a>
            ) : (
              "—"
            )}
          </MetaRow>
          <MetaRow icon={<CalendarIcon className="h-4 w-4" aria-hidden />} label={t("detail.acquired")}>
            {item.acquiredAt ? formatDate(item.acquiredAt) : "—"}
          </MetaRow>
          <MetaRow icon={<CalendarIcon className="h-4 w-4" aria-hidden />} label={t("table.updated")}>
            {formatDate(item.updatedAt)}
          </MetaRow>
        </dl>
      </section>

      {item.notes ? (
        <section className="mt-4 rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <NotebookPenIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t("form.notes")}
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{item.notes}</p>
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t("detail.registeredBy")}
        </p>
        {/* Visitors go to the owner's public profile; the owner-only registry
            list is linked only when the viewer is the owner. */}
        <Link
          href={isOwner ? accountEquipmentPath(item.did) : accountPath(item.did)}
          className="group mt-3 flex items-center gap-3"
        >
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
              {isOwner ? t("detail.viewAllEquipment") : tProfile("viewProfile")}
              <ArrowUpRightIcon className="h-3 w-3" aria-hidden />
            </span>
          </span>
        </Link>
      </section>

      {/* Like + comment this equipment — same records + counts as the feed. */}
      <div className="mt-6 border-t border-border-soft pt-4">
        <RecordEngagement subjectUri={item.uri} />
      </div>
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
