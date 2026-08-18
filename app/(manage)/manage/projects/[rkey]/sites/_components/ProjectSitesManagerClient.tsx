"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  CirclePlusIcon,
  Loader2Icon,
  MapPinIcon,
  RefreshCcwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { manageApiHref, profileBasePath, type ManageTarget } from "@/lib/links";
import type { ManagedLocation } from "@/app/_lib/indexer";
import { canCreateRecord, canUpdateRecord } from "../../../../_lib/cgs-permissions";
import { putRecord } from "../../../../_lib/mutations";
import { SiteEditorModal, SiteEditorModalId, type SavedSiteRef } from "../../../../_modals/SiteEditorModal";

const PROJECT_COLLECTION = "org.hypercerts.collection";
const PREVIEW_APP_BASE_URL = "https://polygons-gainforest.vercel.app";

type ManagedProject = {
  rkey: string;
  cid: string | null;
  title: string;
  locationUri: string | null;
  rawRecord: Record<string, unknown> | null;
};

type ProjectsResponse = ManagedProject[] | { error: string };
type SitesResponse = ManagedLocation[] | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function previewUrl(site: ManagedLocation): string | null {
  if (site.record.location?.kind !== "uri" || !site.metadata.uri) return null;
  return `${PREVIEW_APP_BASE_URL}/view?certifiedLocationRecordUri=${encodeURIComponent(site.metadata.uri)}`;
}

// Preserve the project record while swapping its `location` reference. We keep
// any `$type` the existing location used so we don't change the record's shape.
function buildProjectRecord(project: ManagedProject, location: { uri: string; cid: string } | null): Record<string, unknown> {
  const base = project.rawRecord ? { ...project.rawRecord } : {};
  base.$type = PROJECT_COLLECTION;
  base.type = typeof base.type === "string" && base.type.trim() ? base.type : "project";
  base.title = typeof base.title === "string" && base.title.trim() ? base.title : project.title;
  base.createdAt = typeof base.createdAt === "string" ? base.createdAt : new Date().toISOString();

  if (!location) {
    delete base.location;
    return base;
  }

  const existing = isRecord(base.location) ? base.location : null;
  base.location = typeof existing?.$type === "string"
    ? { $type: existing.$type, uri: location.uri, cid: location.cid }
    : { uri: location.uri, cid: location.cid };
  return base;
}

export function ProjectSitesManagerClient({ target, projectRkey }: { target: ManageTarget; projectRkey: string }) {
  const t = useTranslations("common.projectManage");
  const modal = useModal();
  const [project, setProject] = useState<ManagedProject | null>(null);
  const [sites, setSites] = useState<ManagedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUri, setSavingUri] = useState<string | null>(null);

  const updatePermission = canUpdateRecord(target);
  const createPermission = canCreateRecord(target);
  const repoOptions = target.kind === "group" ? { repo: target.did } : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsRes, sitesRes] = await Promise.all([
        fetch(manageApiHref("/api/manage/projects", target), { cache: "no-store" }),
        fetch(manageApiHref("/api/manage/sites", target), { cache: "no-store" }),
      ]);
      const projectsData = (await projectsRes.json()) as ProjectsResponse;
      const sitesData = (await sitesRes.json()) as SitesResponse;
      if (!projectsRes.ok || !Array.isArray(projectsData)) {
        setError(!Array.isArray(projectsData) ? projectsData.error : t("loadError"));
        return;
      }
      const match = projectsData.find((entry) => entry.rkey === projectRkey) ?? null;
      if (!match) {
        setError(t("projectNotFound"));
        return;
      }
      setProject(match);
      setSites(Array.isArray(sitesData) ? sitesData : []);
    } catch {
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [projectRkey, t, target]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentSite = useMemo(
    () => (project?.locationUri ? sites.find((site) => site.metadata.uri === project.locationUri) ?? null : null),
    [project?.locationUri, sites],
  );

  const applyLocation = useCallback(
    async (location: { uri: string; cid: string } | null, busyKey: string) => {
      if (!project) return;
      if (!updatePermission.allowed) {
        setError(updatePermission.reason ?? t("permissionUpdate"));
        return;
      }
      if (!project.rawRecord || !project.cid) {
        setError(t("loadError"));
        return;
      }
      try {
        setSavingUri(busyKey);
        setError(null);
        const record = buildProjectRecord(project, location);
        const result = await putRecord(PROJECT_COLLECTION, project.rkey, record, {
          ...(project.cid ? { swapRecord: project.cid } : {}),
          ...(repoOptions ?? {}),
        });
        setProject((prev) => prev ? { ...prev, cid: result.cid, locationUri: location?.uri ?? null, rawRecord: record } : prev);
      } catch (mutationError) {
        setError(mutationError instanceof Error ? mutationError.message : t("saveError"));
      } finally {
        setSavingUri(null);
      }
    },
    [project, repoOptions, t, updatePermission.allowed, updatePermission.reason],
  );

  function openCreateSite() {
    if (!createPermission.allowed) {
      setError(createPermission.reason ?? t("permissionCreate"));
      return;
    }
    modal.pushModal(
      {
        id: SiteEditorModalId,
        dialogWidth: "max-w-lg",
        content: (
          <SiteEditorModal
            did={target.did}
            target={target}
            initialData={null}
            onSaved={(saved: SavedSiteRef) => {
              void (async () => {
                await load();
                await applyLocation({ uri: saved.uri, cid: saved.cid }, saved.uri);
              })();
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  }

  const backLink = (
    <Button asChild variant="outline" size="sm">
      <Link href={`${profileBasePath(target)}/projects`}>
        <ArrowLeftIcon className="size-4" />
        {t("backToProjects")}
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {backLink}
        <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading || savingUri !== null}>
          <RefreshCcwIcon className={cn("size-4", loading && "animate-spin")} />
          {t("refresh")}
        </Button>
      </div>

      <div className="mb-5 max-w-3xl">
        <h1 className="font-instrument text-3xl font-light italic tracking-[-0.03em] text-foreground sm:text-4xl">
          {project?.title ?? t("sitesTitle")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("sitesDescription")}</p>
      </div>

      {error ? (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-foreground">
          <TriangleAlertIcon className="size-4 shrink-0 text-warn" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("currentSiteLabel")}</h2>
            {currentSite ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <MapPinIcon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{currentSite.record.name ?? t("siteFallbackName")}</p>
                    {previewUrl(currentSite) ? (
                      <a href={previewUrl(currentSite)!} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        {t("viewMap")}
                      </a>
                    ) : currentSite.record.description ? (
                      <p className="truncate text-xs text-muted-foreground">{currentSite.record.description}</p>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!updatePermission.allowed || savingUri !== null}
                  title={updatePermission.reason ?? undefined}
                  onClick={() => void applyLocation(null, "remove")}
                >
                  {savingUri === "remove" ? <Loader2Icon className="size-4 animate-spin" /> : <XIcon className="size-4" />}
                  {t("removeSite")}
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t("noSiteBody")}</p>
            )}
          </section>

          <section className="rounded-3xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">{t("chooseSite")}</h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openCreateSite}
                disabled={!createPermission.allowed || savingUri !== null}
                title={createPermission.reason ?? undefined}
              >
                <CirclePlusIcon className="size-4" />
                {t("createSite")}
              </Button>
            </div>

            {sites.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("noSitesAvailable")}</p>
            ) : (
              <ul role="list" className="mt-3 divide-y divide-border-soft">
                {sites.map((site) => {
                  const isCurrent = site.metadata.uri === project?.locationUri;
                  const busy = savingUri === site.metadata.uri;
                  return (
                    <li key={site.metadata.uri} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <MapPinIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate text-sm text-foreground">{site.record.name ?? t("siteFallbackName")}</span>
                      </div>
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/[0.08] px-2.5 py-1 text-xs font-medium text-primary">
                          <CheckIcon className="size-3.5" aria-hidden />
                          {t("linkedBadge")}
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={!updatePermission.allowed || savingUri !== null}
                          title={updatePermission.reason ?? undefined}
                          onClick={() => void applyLocation({ uri: site.metadata.uri, cid: site.metadata.cid }, site.metadata.uri)}
                        >
                          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                          {t("setAsSite")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
