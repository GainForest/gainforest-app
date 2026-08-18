import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, ArrowUpRightIcon, CalendarIcon, LeafIcon, MapPinIcon, RulerIcon } from "lucide-react";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import {
  fetchMeasurementsByOccurrence,
  fetchObservationMedia,
  fetchRecordByUri,
  summarizeObservationMeasurements,
  type ObservationMeasurementFact,
  type ObservationMediaItem,
  type OccurrenceRecord,
} from "../../../_lib/indexer";
import { resolveBlobUrl, isPdsBlobUrl } from "../../../_lib/pds";
import { countryFlag, formatDate } from "../../../_lib/format";
import { getRequestOrigin } from "../../../_lib/request-origin";
import { getAccountRouteData, readAccountRouteParams } from "../../../account/_lib/account-route";
import { accountHref, localObservationHref } from "../../../_lib/urls";
import { RecordLocationMap } from "../../../_components/RecordLocationMap";
import { RecordEngagement } from "../../../_components/RecordEngagement";
import { ObservationMediaViewer, type ObservationViewerImage } from "./_components/ObservationMediaViewer";
import { ObservationDetailsSection } from "./_components/ObservationDetailsSection";
import { SpeciesSuggestions } from "./_components/SpeciesSuggestions";

export const revalidate = 60;

type ObservationPageParams = Promise<{ did: string; rkey: string }>;
type ObservationOwner = Awaited<ReturnType<typeof getAccountRouteData>> | null;

const COLLECTION = "app.gainforest.dwc.occurrence";
const AUDIO_EXT = /\.(?:mp3|m4a|wav|ogg|oga|flac|aac)(?:[?#]|$)/i;
const IMAGE_EXT = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;

async function loadObservation(params: ObservationPageParams) {
  const [{ rkey: encodedRkey }, { did, urlIdentifier }] = await Promise.all([
    params,
    readAccountRouteParams(params),
  ]);
  const rkey = safeDecode(encodedRkey);
  const atUri = `at://${did}/${COLLECTION}/${rkey}`;
  const record = await fetchRecordByUri(atUri).catch(() => null);
  if (!record || record.kind !== "occurrence") notFound();
  return { record, did, rkey, urlIdentifier };
}

export async function generateMetadata({ params }: { params: ObservationPageParams }): Promise<Metadata> {
  const { record, urlIdentifier, rkey } = await loadObservation(params);
  const t = await getTranslations("marketplace.observationPage");
  const name = observationName(record, t);
  const description = [record.scientificName, record.locality, record.country].filter(Boolean).join(" · ") || t("metaFallback");
  const detailHref = localObservationHref(urlIdentifier, rkey);
  const images = record.imageUrl ? [{ url: record.imageUrl, alt: name }] : undefined;
  return {
    title: t("metaTitle", { name }),
    description,
    alternates: await localizedAlternates(localObservationHref(urlIdentifier, rkey)),
    openGraph: {
      title: name,
      description,
      type: "article",
      url: detailHref,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description,
      images,
    },
  };
}

export default async function ObservationDetailPage({ params }: { params: ObservationPageParams }) {
  const { record, did, rkey, urlIdentifier } = await loadObservation(params);
  const t = await getTranslations("marketplace.observationPage");
  const measurementsT = await getTranslations("marketplace.measurements");

  const [owner, media, resolvedAudio, measurementRecords, origin] = await Promise.all([
    getAccountRouteData(did, urlIdentifier).catch(() => null),
    fetchObservationMedia(record.did, record.atUri).catch(() => [] as ObservationMediaItem[]),
    record.audioUrl ? Promise.resolve(record.audioUrl) : record.audioRef ? resolveBlobUrl(record.did, record.audioRef).catch(() => null) : Promise.resolve(null),
    fetchMeasurementsByOccurrence(record.atUri).catch(() => []),
    getRequestOrigin(),
  ]);
  const measurementFacts = summarizeObservationMeasurements(measurementRecords);

  // Canonicalise to the owner's handle URL when one is known (mirrors the Cert page).
  if (owner && owner.urlIdentifier !== urlIdentifier) {
    redirect(localObservationHref(owner.urlIdentifier, rkey));
  }

  const imageItems = media.filter(isImageItem);
  const audioItems = media.filter(isAudioItem);
  const images: ObservationViewerImage[] = imageItems.length > 0
    ? imageItems.map((item) => ({ url: item.record.accessUri as string, caption: item.record.caption }))
    : record.imageUrl
      ? [{ url: record.imageUrl, caption: null }]
      : [];
  const audioUrl = resolvedAudio ?? audioItems[0]?.record.accessUri ?? null;

  const name = observationName(record, t);
  const scientific = secondaryScientificName(record);
  const place = [record.locality, record.stateProvince, record.country].filter(Boolean).join(", ");
  const detailHref = localObservationHref(owner?.urlIdentifier ?? urlIdentifier, rkey);
  const observationJsonLd = buildObservationJsonLd(origin, detailHref, record, owner, name, place, images[0]?.url ?? record.imageUrl ?? null);
  const breadcrumbJsonLd = buildObservationBreadcrumbJsonLd(origin, detailHref, t("back"), name);

  return (
    <>
      <script
        id="observation-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(observationJsonLd) }}
      />
      <script
        id="observation-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="min-h-screen bg-background pb-20">
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-8">
        <Link
          href="/observations"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
          {t("back")}
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary-dark">
            <LeafIcon className="h-3.5 w-3.5" aria-hidden />
            {t("kind")}
          </span>
        </div>

        <h1 className="mt-3 font-instrument text-4xl italic leading-tight tracking-[-0.01em] text-foreground md:text-5xl">
          {name}
          {scientific ? (
            <span className="ml-2 align-middle text-2xl not-italic text-foreground/55 md:text-3xl">
              {scientific}
            </span>
          ) : null}
        </h1>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <ObservationMediaViewer images={images} audioUrl={audioUrl} title={name} />
            {/* Like + comment this sighting (the real record) — the same
                interaction surfaced in the activity feed. */}
            <div className="mt-4 border-t border-border-soft pt-3">
              <RecordEngagement subjectUri={record.atUri} />
            </div>
            <SpeciesSuggestions subjectUri={record.atUri} />
          </div>

          <aside className="min-w-0 space-y-5">
            {owner ? (
              <div className="rounded-2xl border border-border-soft bg-surface/60 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45">
                  {t("sharedBy")}
                </p>
                <Link href={accountHref(owner.urlIdentifier)} className="group mt-3 flex items-center gap-3">
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
                        {owner.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-foreground transition-colors group-hover:text-primary">
                      {owner.displayName}
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
                <MetaRow icon={<CalendarIcon className="h-4 w-4" aria-hidden />} label={t("observed")}>
                  {record.eventDate ? formatDate(record.eventDate) : t("notRecorded")}
                </MetaRow>
                <MetaRow icon={<CalendarIcon className="h-4 w-4" aria-hidden />} label={t("shared")}>
                  {formatDate(record.createdAt)}
                </MetaRow>
                {place ? (
                  <MetaRow icon={<MapPinIcon className="h-4 w-4" aria-hidden />} label={t("place")}>
                    {`${countryFlag(record.countryCode)} ${place}`.trim()}
                  </MetaRow>
                ) : null}
              </dl>
            </div>

            <RecordLocationMap record={record} />
          </aside>
        </div>

        {measurementFacts.length > 0 ? (
          <section className="mt-10 border-t border-border-soft pt-8">
            <h2 className="mb-5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <RulerIcon className="h-3.5 w-3.5" aria-hidden />
              {measurementsT("title")}
            </h2>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {measurementFacts.map((fact, index) => (
                <div key={`${fact.key ?? fact.label ?? "m"}-${index}`}>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
                    {fact.key ? measurementsT(`fields.${fact.key}`) : fact.label ?? ""}
                  </dt>
                  <dd className="mt-1 text-[14.5px] leading-[1.5] text-foreground">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <ObservationDetailsSection
          record={record}
          primaryImageUrl={images[0]?.url ?? record.imageUrl ?? null}
          fallbackHref={accountHref(urlIdentifier)}
        />
      </div>
      </main>
    </>
  );
}

function compactJsonLd<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && !(Array.isArray(entry) && entry.length === 0)),
  ) as T;
}

function buildObservationJsonLd(
  origin: string,
  detailHref: string,
  record: OccurrenceRecord,
  owner: ObservationOwner,
  name: string,
  place: string,
  imageUrl: string | null,
): Record<string, unknown> {
  const url = new URL(detailHref, origin).toString();
  const image = imageUrl ? new URL(imageUrl, origin).toString() : undefined;
  const observerUrl = owner ? new URL(accountHref(owner.urlIdentifier), origin).toString() : undefined;
  const spatialCoverage = record.lat !== null && record.lon !== null
    ? compactJsonLd({
        "@type": "Place",
        name: place || record.locality || record.country || undefined,
        geo: {
          "@type": "GeoCoordinates",
          latitude: record.lat,
          longitude: record.lon,
        },
      })
    : place
      ? { "@type": "Place", name: place }
      : undefined;

  return compactJsonLd({
    "@context": "https://schema.org",
    "@type": "Observation",
    name,
    description: record.remarks || [record.scientificName, record.locality, record.country].filter(Boolean).join(" · ") || undefined,
    url,
    image,
    datePublished: record.createdAt,
    observationDate: record.eventDate ?? undefined,
    spatialCoverage,
    about: record.scientificName
      ? compactJsonLd({
          "@type": "Thing",
          name: record.scientificName,
          alternateName: record.vernacularName ?? undefined,
        })
      : undefined,
    creator: owner
      ? compactJsonLd({
          "@type": owner.kind === "organization" ? "Organization" : "Person",
          name: owner.displayName,
          url: observerUrl,
          image: owner.avatarUrl ? new URL(owner.avatarUrl, origin).toString() : undefined,
        })
      : undefined,
  });
}

function buildObservationBreadcrumbJsonLd(
  origin: string,
  detailHref: string,
  observationsLabel: string,
  observationTitle: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "GainForest",
        item: new URL("/", origin).toString(),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: observationsLabel,
        item: new URL("/observations", origin).toString(),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: observationTitle,
        item: new URL(detailHref, origin).toString(),
      },
    ],
  };
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

type ObservationPageT = Awaited<ReturnType<typeof getTranslations<"marketplace.observationPage">>>;

function observationName(record: OccurrenceRecord, t: ObservationPageT): string {
  if (record.media.includes("audio") && record.vernacularName === "Nature sound recording") {
    return record.scientificName || t("natureSound");
  }
  return (
    record.vernacularName ||
    record.scientificName ||
    (record.media.includes("audio") ? t("natureSound") : t("unidentified"))
  );
}

function secondaryScientificName(record: OccurrenceRecord): string | null {
  if (!record.vernacularName || !record.scientificName) return null;
  if (record.vernacularName.toLowerCase() === record.scientificName.toLowerCase()) return null;
  return record.scientificName;
}

function isImageItem(item: ObservationMediaItem): boolean {
  const url = item.record.accessUri;
  if (!url) return false;
  const format = (item.record.format ?? "").toLowerCase();
  if (format.startsWith("image/")) return true;
  if (format.startsWith("audio/") || format.startsWith("video/")) return false;
  if (AUDIO_EXT.test(url)) return false;
  return !format || IMAGE_EXT.test(url) || !AUDIO_EXT.test(url);
}

function isAudioItem(item: ObservationMediaItem): boolean {
  const url = item.record.accessUri;
  if (!url) return false;
  const format = (item.record.format ?? "").toLowerCase();
  return format.startsWith("audio/") || AUDIO_EXT.test(url);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
