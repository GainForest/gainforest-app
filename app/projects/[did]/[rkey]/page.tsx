import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, ArrowUpRightIcon, BadgeIcon, CalendarIcon, CompassIcon, FolderKanbanIcon, ImageIcon, LeafIcon, MapPinIcon, UsersIcon } from "lucide-react";
import {
  fetchCertifiedLocationCountriesByUri,
  fetchProjectImageGalleriesByDid,
  fetchProjectObservationSummary,
  fetchRecordByUri,
  type BumicertRecord,
  type OccurrenceRecord,
  type ProjectGalleryImage,
  type ProjectImageGallery,
} from "../../../_lib/indexer";
import { isPdsBlobUrl } from "../../../_lib/pds";
import { formatCountry, formatDate, formatNumber } from "../../../_lib/format";
import { formatWorkScopeTag, type WorkScopeLabels } from "../../../_lib/work-scope-labels";
import { getAccountRouteData, readAccountRouteParams } from "../../../account/_lib/account-route";
import { accountHref, localObservationHref, localProjectHref } from "../../../_lib/urls";
import { AccountBumicertsGrid } from "../../../account/_components/AccountBumicertsGrid";

export const revalidate = 60;

type ProjectPageParams = Promise<{ did: string; rkey: string }>;

const COLLECTION = "org.hypercerts.collection";

async function loadProject(params: ProjectPageParams) {
  const [{ rkey: encodedRkey }, { did, urlIdentifier }] = await Promise.all([
    params,
    readAccountRouteParams(params),
  ]);
  const rkey = safeDecode(encodedRkey);
  const atUri = `at://${did}/${COLLECTION}/${rkey}`;
  const record = await fetchRecordByUri(atUri).catch(() => null);
  if (!record || record.kind !== "project") notFound();
  return { record, did, rkey, urlIdentifier };
}

export async function generateMetadata({ params }: { params: ProjectPageParams }): Promise<Metadata> {
  const { record, urlIdentifier, rkey } = await loadProject(params);
  const t = await getTranslations("marketplace.projectPage");
  const description = record.shortDescription?.trim() || t("metaFallback");
  return {
    title: t("metaTitle", { name: record.title }),
    description,
    alternates: { canonical: localProjectHref(urlIdentifier, rkey) },
    openGraph: {
      title: record.title,
      description,
      type: "article",
      images: record.imageUrl ? [{ url: record.imageUrl }] : undefined,
    },
  };
}

export default async function ProjectDetailPage({ params }: { params: ProjectPageParams }) {
  const { record, did, rkey, urlIdentifier } = await loadProject(params);
  const t = await getTranslations("marketplace.projectPage");

  const certUris = record.bumicertUris.slice(0, 100);
  const [owner, certs, rawGalleries, observations] = await Promise.all([
    getAccountRouteData(did, urlIdentifier).catch(() => null),
    certUris.length
      ? Promise.all(certUris.map((uri) => fetchRecordByUri(uri).catch(() => null))).then((records) =>
          records.filter((entry): entry is BumicertRecord => entry?.kind === "bumicert"),
        )
      : Promise.resolve([] as BumicertRecord[]),
    fetchProjectImageGalleriesByDid(did).catch(() => [] as ProjectImageGallery[]),
    fetchProjectObservationSummary(record.atUri, 10).catch(() => ({ count: 0, records: [] as OccurrenceRecord[] })),
  ]);

  // Canonicalise to the owner's handle URL when one is known (mirrors the
  // observation and Cert pages).
  if (owner && owner.urlIdentifier !== urlIdentifier) {
    redirect(localProjectHref(owner.urlIdentifier, rkey));
  }

  const ownerIdentifier = owner?.urlIdentifier ?? urlIdentifier;
  const ownerName = owner?.displayName ?? record.creatorName ?? "";

  // Overview synthesised from the project's Certs: total contributors, distinct
  // mapped places (+ the countries they fall in), the union of focus areas, and
  // the overall active date range.
  const workScopeT = await getTranslations("common.workScopes");
  const workScopeLabels: WorkScopeLabels = {
    reforestation: workScopeT("reforestation"),
    forest_protection: workScopeT("forestProtection"),
    biodiversity_monitoring: workScopeT("natureMonitoring"),
    community_stewardship: workScopeT("communityStewardship"),
    carbon_removal: workScopeT("carbonRemoval"),
    restoration_maintenance: workScopeT("restorationMaintenance"),
  };
  const locationUris = [...new Set(certs.flatMap((cert) => cert.locationUris))];
  const countryMap = locationUris.length
    ? await fetchCertifiedLocationCountriesByUri(locationUris).catch(() => new Map<string, string>())
    : new Map<string, string>();
  const overview = buildProjectOverview(certs, workScopeLabels, locationUris, countryMap);

  // Linked galleries (matched by project URI) and observations (matched by
  // projectRef) — summarised as counts plus a row of image previews.
  const galleryImages = rawGalleries
    .filter((gallery) => gallery.projectUri === record.atUri)
    .flatMap((gallery) => gallery.images)
    .filter((image) => Boolean(image.url));
  const galleryPreview = galleryImages.slice(0, 10);
  const observationPreview = observations.records.slice(0, 10);

  return (
    <main className="min-h-screen bg-background pb-20">
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-8">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
          {t("back")}
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary-dark">
            <FolderKanbanIcon className="h-3.5 w-3.5" aria-hidden />
            {t("kind")}
          </span>
        </div>

        <h1 className="mt-3 font-instrument text-4xl italic leading-tight tracking-[-0.01em] text-foreground md:text-5xl">
          {record.title}
        </h1>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border-soft bg-muted">
              {record.imageUrl ? (
                <Image
                  src={record.imageUrl}
                  alt={record.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 640px"
                  unoptimized={!isPdsBlobUrl(record.imageUrl)}
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-primary/[0.06] text-primary/45">
                  <FolderKanbanIcon className="h-16 w-16" aria-hidden />
                </div>
              )}
            </div>

            {record.shortDescription ? (
              <p className="mt-6 max-w-3xl whitespace-pre-line text-base leading-7 text-foreground/80 md:text-lg md:leading-8">
                {record.shortDescription}
              </p>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-5">
            {owner ? (
              <div className="rounded-2xl border border-border-soft bg-surface/60 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45">{t("ledBy")}</p>
                <Link href={accountHref(ownerIdentifier)} className="group mt-3 flex items-center gap-3">
                  <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                    {owner.avatarUrl ? (
                      <Image
                        src={owner.avatarUrl}
                        alt=""
                        fill
                        sizes="44px"
                        unoptimized={!isPdsBlobUrl(owner.avatarUrl)}
                        className="object-cover"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-sm font-semibold text-muted-foreground">
                        {ownerName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-foreground transition-colors group-hover:text-primary">
                      {ownerName}
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground">
                      {t("viewProfile")}
                      <ArrowUpRightIcon className="h-3 w-3" aria-hidden />
                    </span>
                  </span>
                </Link>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border-soft bg-surface/60 p-4">
              <dl className="space-y-3.5">
                <MetaRow icon={<CalendarIcon className="h-4 w-4" aria-hidden />} label={t("created")}>
                  {formatDate(record.createdAt)}
                </MetaRow>
                <MetaRow icon={<BadgeIcon className="h-4 w-4" aria-hidden />} label={t("certs")}>
                  {formatNumber(record.bumicertCount)}
                </MetaRow>
              </dl>
            </div>
          </aside>
        </div>

        {certs.length > 0 ? (
          <section className="mt-10 border-t border-border-soft pt-8">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t("overviewTitle")}
            </h2>
            <p className="max-w-3xl text-base leading-7 text-foreground/80 md:text-lg md:leading-8">
              {t("overviewLead", { certs: certs.length })}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <OverviewStat icon={<BadgeIcon className="h-4 w-4" aria-hidden />} label={t("certs")} value={formatNumber(record.bumicertCount)} />
              <OverviewStat icon={<UsersIcon className="h-4 w-4" aria-hidden />} label={t("contributors")} value={formatNumber(overview.contributorTotal)} />
              <OverviewStat icon={<MapPinIcon className="h-4 w-4" aria-hidden />} label={t("places")} value={formatNumber(overview.placeCount)} />
              <OverviewStat icon={<CompassIcon className="h-4 w-4" aria-hidden />} label={t("focusAreasLabel")} value={formatNumber(overview.focusAreas.length)} />
              <OverviewStat icon={<LeafIcon className="h-4 w-4" aria-hidden />} label={t("observations")} value={formatNumber(observations.count)} />
              <OverviewStat icon={<ImageIcon className="h-4 w-4" aria-hidden />} label={t("photos")} value={formatNumber(galleryImages.length)} />
            </div>

            {overview.focusAreas.length > 0 ? (
              <div className="mt-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45">{t("focusAreasLabel")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {overview.focusAreas.map((area) => (
                    <span key={area} className="inline-flex h-7 items-center rounded-full bg-secondary px-3 text-[13px] font-medium text-secondary-foreground">
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {overview.countryCodes.length > 0 || overview.startDate || overview.endDate ? (
              <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {overview.countryCodes.length > 0 ? (
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45">{t("whereLabel")}</dt>
                    <dd className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5 text-[14px] text-foreground">
                      {overview.countryCodes.map((code) => (
                        <span key={code}>{formatCountry(code)}</span>
                      ))}
                    </dd>
                  </div>
                ) : null}
                {overview.startDate || overview.endDate ? (
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45">{t("activePeriodLabel")}</dt>
                    <dd className="mt-1.5 text-[14px] text-foreground">{formatActivePeriod(overview.startDate, overview.endDate)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </section>
        ) : null}

        {galleryPreview.length > 0 ? (
          <section className="mt-10 border-t border-border-soft pt-8">
            <h2 className="mb-4 flex items-baseline gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t("galleryTitle")}
              <span className="text-foreground/40">{formatNumber(galleryImages.length)}</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {galleryPreview.map((image, index) => (
                <GalleryThumb
                  key={image.id}
                  image={image}
                  overflow={index === galleryPreview.length - 1 ? galleryImages.length - galleryPreview.length : 0}
                />
              ))}
            </div>
          </section>
        ) : null}

        {observationPreview.length > 0 ? (
          <section className="mt-10 border-t border-border-soft pt-8">
            <h2 className="mb-4 flex items-baseline gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t("observationsTitle")}
              <span className="text-foreground/40">{formatNumber(observations.count)}</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {observationPreview.map((observation, index) => (
                <ObservationThumb
                  key={observation.id}
                  observation={observation}
                  href={localObservationHref(ownerIdentifier, observation.rkey)}
                  overflow={index === observationPreview.length - 1 ? observations.count - observationPreview.length : 0}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-10 border-t border-border-soft pt-8">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {t("certsTitle")}
          </h2>
          {certs.length > 0 ? (
            <AccountBumicertsGrid
              bumicerts={certs}
              organizationIdentifier={ownerIdentifier}
              organizationName={ownerName}
              logoUrl={owner?.avatarUrl ?? null}
            />
          ) : (
            <p className="mt-4 max-w-2xl text-[15px] leading-[1.6] text-foreground/60">{t("noCerts")}</p>
          )}
        </section>
      </div>
    </main>
  );
}

type ProjectOverview = {
  contributorTotal: number;
  placeCount: number;
  focusAreas: string[];
  countryCodes: string[];
  startDate: string | null;
  endDate: string | null;
};

function buildProjectOverview(
  certs: BumicertRecord[],
  workScopeLabels: WorkScopeLabels,
  locationUris: string[],
  countryMap: Map<string, string>,
): ProjectOverview {
  let contributorTotal = 0;
  const focusSeen = new Set<string>();
  const focusAreas: string[] = [];
  const starts: string[] = [];
  const ends: string[] = [];

  for (const cert of certs) {
    contributorTotal += cert.contributorCount;
    for (const tag of cert.scopeTags) {
      const label = formatWorkScopeTag(tag, workScopeLabels).trim();
      const key = label.toLowerCase();
      if (label && !focusSeen.has(key)) {
        focusSeen.add(key);
        focusAreas.push(label);
      }
    }
    if (cert.startDate) starts.push(cert.startDate);
    if (cert.endDate) ends.push(cert.endDate);
  }

  const countryCodes = [
    ...new Set([...countryMap.values()].map((code) => code.trim().toUpperCase()).filter(Boolean)),
  ].sort();

  return {
    contributorTotal,
    placeCount: locationUris.length,
    focusAreas,
    countryCodes,
    startDate: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
    endDate: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
  };
}

function formatActivePeriod(start: string | null, end: string | null): string {
  const startLabel = start ? formatDate(start) : null;
  const endLabel = end ? formatDate(end) : null;
  if (startLabel && endLabel) return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  return startLabel ?? endLabel ?? "";
}

function GalleryThumb({ image, overflow }: { image: ProjectGalleryImage; overflow: number }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-border-soft bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element -- gallery blobs come
          from arbitrary PDS hosts; a plain img avoids widening remotePatterns. */}
      <img src={image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
      {overflow > 0 ? (
        <div className="absolute inset-0 grid place-items-center bg-foreground/55 text-lg font-semibold text-background">
          +{formatNumber(overflow)}
        </div>
      ) : null}
    </div>
  );
}

function ObservationThumb({ observation, href, overflow }: { observation: OccurrenceRecord; href: string; overflow: number }) {
  return (
    <Link href={href} className="group relative block aspect-square overflow-hidden rounded-xl border border-border-soft bg-muted">
      {observation.imageUrl ? (
        <Image
          src={observation.imageUrl}
          alt={observation.vernacularName ?? observation.scientificName ?? ""}
          fill
          sizes="(max-width: 640px) 50vw, 200px"
          unoptimized={!isPdsBlobUrl(observation.imageUrl)}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-primary/40">
          <LeafIcon className="h-7 w-7" aria-hidden />
        </div>
      )}
      {overflow > 0 ? (
        <div className="absolute inset-0 grid place-items-center bg-foreground/55 text-lg font-semibold text-background">
          +{formatNumber(overflow)}
        </div>
      ) : null}
    </Link>
  );
}

function OverviewStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface/60 p-4">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function MetaRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">{label}</dt>
        <dd className="mt-0.5 text-[14px] leading-snug text-foreground">{children}</dd>
      </div>
    </div>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
