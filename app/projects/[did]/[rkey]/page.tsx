import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, ArrowUpRightIcon, FolderKanbanIcon } from "lucide-react";
import { fetchRecordByUri } from "../../../_lib/indexer";
import { getPdsRecord, isPdsBlobUrl } from "../../../_lib/pds";
import { AutoRefresh } from "./_components/AutoRefresh";
import { getAccountRouteData, readAccountRouteParams } from "../../../account/_lib/account-route";
import { accountHref, localProjectHref } from "../../../_lib/urls";
import { RecordEngagement } from "../../../_components/RecordEngagement";
import { FollowButton } from "../../../_components/FollowButton";
import { getRequestOrigin } from "../../../_lib/request-origin";
import {
  ProjectDetailView,
  loadBumicertRouteData,
} from "../../../cert/[did]/[rkey]/page";

export const revalidate = 60;

type ProjectPageParams = Promise<{ did: string; rkey: string }>;

const COLLECTION = "org.hypercerts.collection";

type ProjectExplorerRecord = Extract<
  NonNullable<Awaited<ReturnType<typeof fetchRecordByUri>>>,
  { kind: "project" }
>;

type LoadedProject = {
  record: ProjectExplorerRecord | null;
  /** Title read from the owner's PDS when the indexer hasn't caught up yet. */
  pendingTitle: string | null;
  did: string;
  rkey: string;
  urlIdentifier: string;
};

async function loadProject(params: ProjectPageParams): Promise<LoadedProject> {
  const [{ rkey: encodedRkey }, { did, urlIdentifier }] = await Promise.all([
    params,
    readAccountRouteParams(params),
  ]);
  const rkey = safeDecode(encodedRkey);
  const atUri = `at://${did}/${COLLECTION}/${rkey}`;
  const record = await fetchRecordByUri(atUri).catch(() => null);
  if (!record || record.kind !== "project") {
    // The indexer lags fresh writes. When the record exists on the owner's
    // PDS, this is a just-created project that's still being published — show
    // a friendly holding page instead of a 404.
    const pdsRecord = await getPdsRecord(did, COLLECTION, rkey).catch(() => null);
    if (pdsRecord) {
      const title = typeof pdsRecord.value.title === "string" ? pdsRecord.value.title : null;
      return { record: null, pendingTitle: title ?? "", did, rkey, urlIdentifier };
    }
    notFound();
  }
  return { record, pendingTitle: null, did, rkey, urlIdentifier };
}

export async function generateMetadata({ params }: { params: ProjectPageParams }): Promise<Metadata> {
  const { record, pendingTitle, urlIdentifier, rkey } = await loadProject(params);
  const t = await getTranslations("marketplace.projectPage");
  if (!record) {
    return {
      title: pendingTitle ? t("metaTitle", { name: pendingTitle }) : t("publishingTitle"),
      description: t("metaFallback"),
      robots: { index: false },
    };
  }
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

const PROJECT_DETAIL_TABS = ["overview", "places", "updates", "reviews"] as const;
type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number];

const LEGACY_PROJECT_TABS: Record<string, ProjectDetailTab> = {
  "site-boundaries": "places",
  timeline: "updates",
  donations: "overview",
};

function parseProjectDetailTab(value: string | undefined): ProjectDetailTab {
  if (!value) return "overview";
  const mapped = LEGACY_PROJECT_TABS[value] ?? value;
  return PROJECT_DETAIL_TABS.some((tab) => tab === mapped) ? (mapped as ProjectDetailTab) : "overview";
}

function projectTabHref(basePath: string, tab: ProjectDetailTab): string {
  return tab === "overview" ? basePath : `${basePath}?${new URLSearchParams({ tab }).toString()}`;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: ProjectPageParams;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ record, pendingTitle, did, rkey, urlIdentifier }, search] = await Promise.all([loadProject(params), searchParams]);

  if (!record) {
    return <ProjectPublishing title={pendingTitle} />;
  }

  const projectBaseHref = localProjectHref(urlIdentifier, rkey);
  const requestedTab = typeof search.tab === "string" ? search.tab : Array.isArray(search.tab) ? search.tab[0] : undefined;
  if (requestedTab === "donations") {
    redirect(`${projectBaseHref}#support`);
  }
  const activeTab = parseProjectDetailTab(requestedTab);
  if (requestedTab !== undefined && requestedTab !== activeTab) {
    redirect(projectTabHref(projectBaseHref, activeTab));
  }

  // A project owns exactly one Cert. Render the full Cert experience inline so
  // the project page carries every feature (story, evidence, site boundaries,
  // reviews, donations, timeline) instead of linking out to a separate Cert
  // page. The tabs and links resolve against the project URL.
  const certUri = record.bumicertUris[0] ?? null;
  if (certUri) {
    const certRkey = rkeyFromUri(certUri);
    const [routeData, origin] = await Promise.all([
      certRkey ? loadBumicertRouteData(did, certRkey, urlIdentifier) : Promise.resolve(null),
      getRequestOrigin(),
    ]);

    if (routeData) {
      const canonicalIdentifier = routeData.owner.urlIdentifier;
      const projectHref = localProjectHref(canonicalIdentifier, rkey);
      if (canonicalIdentifier !== urlIdentifier) {
        redirect(projectTabHref(projectHref, activeTab));
      }
      const t = await getTranslations("marketplace.projectPage");
      return (
        <ProjectDetailView
          routeData={routeData}
          basePath={projectHref}
          activeTab={activeTab}
          origin={origin}
          backHref="/projects"
          backLabel={t("back")}
          editHref={`/account/${encodeURIComponent(canonicalIdentifier)}/projects?mode=edit&project=${encodeURIComponent(rkey)}`}
          editLabel={t("edit")}
          projectRkey={rkey}
          // Match timeline evidence pinned to the Cert URI *or* the project
          // (collection) URI — older projects attached their updates to the
          // collection, which is where this project's timeline lives.
          timelineMatchUris={[routeData.record.atUri, record.atUri]}
          // Like + comment target the project (collection) record, so the count
          // matches the activity feed (which folds Certs into their project).
          engagementSubjectUri={record.atUri}
        />
      );
    }
  }

  // Fallback: a project without a resolvable Cert (legacy or mid-creation).
  return <ProjectFallback record={record} did={did} rkey={rkey} urlIdentifier={urlIdentifier} />;
}

async function ProjectFallback({
  record,
  did,
  rkey,
  urlIdentifier,
}: {
  record: ProjectExplorerRecord;
  did: string;
  rkey: string;
  urlIdentifier: string;
}) {
  const [t, owner] = await Promise.all([
    getTranslations("marketplace.projectPage"),
    getAccountRouteData(did, urlIdentifier).catch(() => null),
  ]);

  if (owner && owner.urlIdentifier !== urlIdentifier) {
    redirect(localProjectHref(owner.urlIdentifier, rkey));
  }

  const ownerIdentifier = owner?.urlIdentifier ?? urlIdentifier;
  const ownerName = owner?.displayName ?? record.creatorName ?? "";

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
            ) : (
              <p className="mt-6 max-w-2xl text-[15px] leading-[1.6] text-foreground/60">{t("noCerts")}</p>
            )}

            {/* Like + comment this project — same records + counts as the feed. */}
            <div className="mt-6 border-t border-border-soft pt-4">
              <RecordEngagement subjectUri={record.atUri} />
            </div>
          </div>

          {owner ? (
            <aside className="min-w-0">
              <div className="rounded-2xl border border-border-soft bg-surface/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45">{t("ledBy")}</p>
                  <FollowButton targetDid={did} name={ownerName} />
                </div>
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
            </aside>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/** Holding page for a just-created project the indexer hasn't published yet.
 *  Auto-refreshes until the full page can render. */
async function ProjectPublishing({ title }: { title: string | null }) {
  const t = await getTranslations("marketplace.projectPage");
  return (
    <main className="min-h-screen bg-background">
      <AutoRefresh intervalMs={8000} />
      <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary-dark">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          {t("publishingBadge")}
        </span>
        <h1 className="mt-4 font-instrument text-4xl italic leading-tight tracking-[-0.01em] text-foreground md:text-5xl">
          {title?.trim() || t("publishingTitle")}
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-[1.6] text-muted-foreground">{t("publishingBody")}</p>
      </div>
    </main>
  );
}

function rkeyFromUri(uri: string): string | null {
  const rkey = uri.split("/").filter(Boolean).pop();
  return rkey ?? null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
