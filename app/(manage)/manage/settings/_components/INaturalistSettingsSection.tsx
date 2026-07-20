"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangleIcon,
  BinocularsIcon,
  CheckCircle2Icon,
  CopyIcon,
  Loader2Icon,
  LogOutIcon,
  RotateCcwIcon,
  UploadCloudIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INATURALIST_OBSERVATION_SOURCE, inaturalistOccurrenceIdKey, type INaturalistObservationSummary, type INaturalistProjectSummary, type INaturalistSyncStatus } from "@/app/_lib/inaturalist-shared";
import { createMultimediaFromUrl, createRecord, getRecord, putRecord } from "../../_lib/mutations";
import { manageApiHref, type ManageTarget } from "@/lib/links";
import { cn } from "@/lib/utils";

const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
const IMAGE_DEF_TYPE = "app.gainforest.common.defs#image";

type ObservationProjectContext = { projectUri: string; title: string };
type INaturalistBlobRef = { $type: "blob"; ref: unknown; mimeType: string; size: number };
type LocalSyncState = { status: INaturalistSyncStatus; message?: string | null };
type ConnectionStatus = {
  connected: boolean;
  verificationCode?: string;
  account?: { id: number; login: string; name: string | null; iconUrl: string | null; verifiedAt?: number };
};

type INaturalistPreviewResponse = {
  project?: INaturalistProjectSummary;
  observations?: INaturalistObservationSummary[];
  truncated?: boolean;
  error?: string;
};

type INaturalistProjectsResponse = {
  projects?: INaturalistProjectSummary[];
  error?: string;
};

function omitEmptyRecord<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value === undefined || value === null || value === "") delete record[key];
  }
  return record;
}

function blobRefFromMultimediaRecord(record: Record<string, unknown> | undefined): INaturalistBlobRef | null {
  const file = record?.file;
  if (!file || typeof file !== "object") return null;
  const candidate = file as Record<string, unknown>;
  if (candidate.ref === undefined || candidate.ref === null) return null;
  return {
    $type: "blob",
    ref: candidate.ref,
    mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType : "application/octet-stream",
    size: typeof candidate.size === "number" ? candidate.size : 0,
  };
}

function buildINaturalistOccurrenceRecord(input: {
  observation: INaturalistObservationSummary;
  project: INaturalistProjectSummary;
  projectRef: string;
}): Record<string, unknown> {
  const { observation, project } = input;
  const sourceUrl = observation.url || `https://www.inaturalist.org/observations/${observation.id}`;
  const remarks = [observation.description, `Synced from iNaturalist: ${sourceUrl}`]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n\n");

  return omitEmptyRecord({
    $type: OCCURRENCE_COLLECTION,
    scientificName: observation.scientificName ?? observation.commonName ?? "Unidentified organism",
    vernacularName: observation.commonName ?? undefined,
    kingdom: observation.kingdom ?? undefined,
    basisOfRecord: "HumanObservation",
    occurrenceID: inaturalistOccurrenceIdKey(observation.id),
    occurrenceStatus: "present",
    geodeticDatum: "EPSG:4326",
    eventDate: observation.observedOn ?? new Date().toISOString(),
    recordedBy: observation.recordedBy ?? undefined,
    decimalLatitude: observation.latitude === null ? undefined : String(observation.latitude),
    decimalLongitude: observation.longitude === null ? undefined : String(observation.longitude),
    locality: observation.placeGuess ?? undefined,
    occurrenceRemarks: remarks || undefined,
    projectRef: input.projectRef,
    dynamicProperties: JSON.stringify({
      source: INATURALIST_OBSERVATION_SOURCE,
      inaturalistProjectId: project.id,
      inaturalistProjectSlug: project.slug,
      inaturalistObservationId: observation.id,
      inaturalistUrl: sourceUrl,
      qualityGrade: observation.qualityGrade,
      syncedAt: new Date().toISOString(),
    }),
    createdAt: new Date().toISOString(),
  });
}

export function INaturalistSettingsSection({
  target,
  projects,
  disabledReason,
}: {
  target: ManageTarget;
  projects: ObservationProjectContext[];
  disabledReason?: string | null;
}) {
  const t = useTranslations("common.settings.inaturalist");
  const uploadT = useTranslations("upload.observations.inaturalist");
  const router = useRouter();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [selectedProjectUri, setSelectedProjectUri] = useState<string | null>(projects[0]?.projectUri ?? null);
  const [profileInput, setProfileInput] = useState("");
  const [inaturalistProjects, setINaturalistProjects] = useState<INaturalistProjectSummary[]>([]);
  const [selectedINaturalistProjectId, setSelectedINaturalistProjectId] = useState<string | null>(null);
  const [sourceProject, setSourceProject] = useState<INaturalistProjectSummary | null>(null);
  const [observations, setObservations] = useState<INaturalistObservationSummary[]>([]);
  const [localStatuses, setLocalStatuses] = useState<Map<number, LocalSyncState>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // The verification wizard is long (proof code + 4 steps + input) — keep it
  // collapsed behind an explicit "Connect" click so the settings page stays
  // scannable for people who don't use iNaturalist.
  const [setupOpen, setSetupOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const repoOptions = target.kind === "group" ? { repo: target.did } : undefined;
  const selectedProject = projects.find((project) => project.projectUri === selectedProjectUri) ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inaturalist/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: ConnectionStatus) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ connected: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status?.connected) {
      setINaturalistProjects([]);
      setSelectedINaturalistProjectId(null);
      return;
    }
    let cancelled = false;
    setLoadingProjects(true);
    fetch("/api/inaturalist/projects", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as INaturalistProjectsResponse | null;
        if (!response.ok || !Array.isArray(data?.projects)) throw new Error(data?.error ?? t("projectsLoadFailed"));
        return data.projects;
      })
      .then((nextProjects) => {
        if (cancelled) return;
        setINaturalistProjects(nextProjects);
        setSelectedINaturalistProjectId((current) => current ?? (nextProjects[0] ? String(nextProjects[0].id) : null));
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : t("projectsLoadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status?.connected, t]);

  const mergedObservations = useMemo(
    () => observations.map((observation) => ({ ...observation, ...(localStatuses.get(observation.id) ?? {}) })),
    [observations, localStatuses],
  );
  const syncableCount = mergedObservations.filter((observation) => {
    const state = observation.status ?? observation.syncStatus;
    return state === "pending" || state === "syncedElsewhere";
  }).length;
  const syncedCount = mergedObservations.filter((observation) => (observation.status ?? observation.syncStatus) === "synced").length;
  const pendingCount = mergedObservations.filter((observation) => (observation.status ?? observation.syncStatus) === "pending").length;
  const errorCount = mergedObservations.filter((observation) => (observation.status ?? observation.syncStatus) === "error").length;

  const setObservationStatus = useCallback((id: number, nextStatus: INaturalistSyncStatus, message?: string | null) => {
    setLocalStatuses((current) => {
      const next = new Map(current);
      next.set(id, { status: nextStatus, message });
      return next;
    });
  }, []);

  async function copyCode() {
    if (!status?.verificationCode) return;
    await navigator.clipboard.writeText(status.verificationCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function verifyProfile() {
    setVerifying(true);
    setError(null);
    try {
      const response = await fetch("/api/inaturalist/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: profileInput }),
      });
      const data = (await response.json().catch(() => null)) as ConnectionStatus & { error?: string } | null;
      if (!response.ok || !data?.connected) throw new Error(data?.error ?? t("verifyFailed"));
      setStatus((current) => ({ ...current, ...data, verificationCode: current?.verificationCode }));
      setProfileInput("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("verifyFailed"));
    } finally {
      setVerifying(false);
    }
  }

  async function disconnect() {
    setError(null);
    await fetch("/api/inaturalist/disconnect", { method: "POST" });
    setStatus((current) => ({ connected: false, verificationCode: current?.verificationCode }));
    setINaturalistProjects([]);
    setSelectedINaturalistProjectId(null);
    setSourceProject(null);
    setObservations([]);
  }

  async function preview() {
    if (!status?.connected) {
      setError(t("connectFirst"));
      return;
    }
    if (!selectedProject) {
      setError(t("chooseProject"));
      return;
    }
    if (!selectedINaturalistProjectId) {
      setError(t("chooseINaturalistProject"));
      return;
    }
    setLoading(true);
    setError(null);
    setSourceProject(null);
    setObservations([]);
    setLocalStatuses(new Map());
    try {
      const response = await fetch(manageApiHref("/api/manage/observations/inaturalist", target, {
        projectId: selectedINaturalistProjectId,
        projectRef: selectedProject.projectUri,
      }), { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as INaturalistPreviewResponse | null;
      if (!response.ok || !data?.project || !Array.isArray(data.observations)) {
        throw new Error(data?.error || uploadT("loadFailed"));
      }
      setSourceProject(data.project);
      setObservations(data.observations);
      setTruncated(Boolean(data.truncated));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uploadT("loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function syncObservation(observation: INaturalistObservationSummary, inatProject: INaturalistProjectSummary) {
    if (!selectedProject) throw new Error(t("chooseProject"));
    setObservationStatus(observation.id, "syncing");

    if (observation.syncStatus === "syncedElsewhere" && observation.existingUri) {
      const rkey = observation.existingUri.split("/").pop() ?? "";
      if (!rkey) throw new Error(uploadT("syncFailed"));
      const existing = await getRecord(OCCURRENCE_COLLECTION, rkey, repoOptions);
      await putRecord(OCCURRENCE_COLLECTION, rkey, {
        ...existing.record,
        projectRef: selectedProject.projectUri,
      }, {
        ...repoOptions,
        swapRecord: existing.cid,
      });
      setObservationStatus(observation.id, "synced");
      return;
    }

    const occurrenceRecord = buildINaturalistOccurrenceRecord({ observation, project: inatProject, projectRef: selectedProject.projectUri });
    const occurrence = await createRecord(OCCURRENCE_COLLECTION, occurrenceRecord, undefined, repoOptions);
    const rkey = occurrence.uri.split("/").pop() ?? "";
    let primaryBlobRef: INaturalistBlobRef | null = null;
    let photoError: string | null = null;

    for (const photo of observation.photos) {
      try {
        const photoResult = await createMultimediaFromUrl({
          url: photo.url,
          occurrenceRef: occurrence.uri,
          subjectPart: "wholeOrganism",
          caption: photo.attribution ?? observation.commonName ?? observation.scientificName ?? undefined,
        }, repoOptions);
        primaryBlobRef ??= blobRefFromMultimediaRecord(photoResult.record);
      } catch (caught) {
        photoError = caught instanceof Error ? caught.message : uploadT("photoFailed");
      }
    }

    if (primaryBlobRef && rkey) {
      await putRecord(OCCURRENCE_COLLECTION, rkey, {
        ...occurrenceRecord,
        imageEvidence: { $type: IMAGE_DEF_TYPE, file: primaryBlobRef },
      }, {
        ...repoOptions,
        swapRecord: occurrence.cid,
      });
    }

    setObservationStatus(observation.id, "synced", photoError ? uploadT("syncedPhotoWarning") : null);
  }

  async function syncPending() {
    if (!sourceProject || syncing || disabledReason) return;
    setSyncing(true);
    setError(null);
    try {
      for (const observation of mergedObservations) {
        const state = observation.status ?? observation.syncStatus;
        if (state !== "pending" && state !== "syncedElsewhere") continue;
        try {
          await syncObservation(observation, sourceProject);
        } catch (caught) {
          setObservationStatus(observation.id, "error", caught instanceof Error ? caught.message : uploadT("syncFailed"));
        }
      }
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  const connected = status?.connected === true;
  const verificationCode = status?.verificationCode ?? "";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Image src="/assets/logos/inaturalist.png" alt="" width={18} height={18} className="rounded bg-background" />
        <h2 className="text-sm font-medium">{t("title")}</h2>
      </div>

      <div className="rounded-xl bg-muted p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {connected && status.account ? t("connectedAs", { account: status.account.login }) : t("connectTitle")}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("description")}</p>
          </div>
          {connected ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void disconnect()}>
              <LogOutIcon className="size-3.5" />
              {t("disconnect")}
            </Button>
          ) : (
            <Button type="button" variant={setupOpen ? "outline" : "default"} size="sm" onClick={() => setSetupOpen((open) => !open)}>
              {setupOpen ? t("hideSetup") : t("connect")}
            </Button>
          )}
        </div>

        {!connected && setupOpen ? (
          <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
            <div className="rounded-xl bg-background/70 p-3">
              <p className="text-xs font-medium text-foreground">{t("proofLabel")}</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 rounded-lg bg-muted px-2 py-1.5 text-xs text-foreground">{verificationCode || "…"}</code>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyCode()} disabled={!verificationCode}>
                  {copied ? <CheckCircle2Icon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                  {copied ? t("copied") : t("copy")}
                </Button>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("proofHint")}</p>
              <ol className="mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground">
                <li>{t("steps.openSettings")}</li>
                <li>{t("steps.editBio")}</li>
                <li>{t("steps.pasteCode")}</li>
                <li>{t("steps.returnVerify")}</li>
              </ol>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={profileInput}
                onChange={(event) => setProfileInput(event.target.value)}
                placeholder={t("profilePlaceholder")}
                aria-label={t("profileLabel")}
                disabled={verifying || status === null}
                className="h-9 bg-background"
              />
              <Button type="button" size="sm" onClick={() => void verifyProfile()} disabled={verifying || status === null || !profileInput.trim()}>
                {verifying ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                {verifying ? t("verifying") : t("verify")}
              </Button>
            </div>
          </div>
        ) : null}

        {connected ? (
          <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
            <div className="grid gap-2 lg:grid-cols-[minmax(12rem,18rem)_minmax(14rem,1fr)_auto]">
              <Select value={selectedProjectUri ?? ""} onValueChange={(value) => setSelectedProjectUri(value)} disabled={loading || syncing || projects.length === 0}>
                <SelectTrigger className="h-9 bg-background" aria-label={t("projectLabel")}>
                  <SelectValue placeholder={t("projectLabel")} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.projectUri} value={project.projectUri}>{project.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedINaturalistProjectId ?? ""}
                onValueChange={(value) => {
                  setSelectedINaturalistProjectId(value);
                  setSourceProject(null);
                  setObservations([]);
                  setLocalStatuses(new Map());
                  setError(null);
                }}
                disabled={loading || syncing || loadingProjects || inaturalistProjects.length === 0}
              >
                <SelectTrigger className="h-9 bg-background" aria-label={t("inatProjectLabel")}>
                  <SelectValue placeholder={loadingProjects ? t("projectsLoading") : t("inatProjectLabel")} />
                </SelectTrigger>
                <SelectContent>
                  {inaturalistProjects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>{project.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => void preview()} disabled={loading || syncing || loadingProjects || projects.length === 0 || !selectedINaturalistProjectId}>
                {loading ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCcwIcon className="size-4" />}
                {loading ? uploadT("loading") : sourceProject ? uploadT("refresh") : uploadT("preview")}
              </Button>
            </div>
            {connected && !loadingProjects && inaturalistProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noINaturalistProjects")}</p>
            ) : null}

            {sourceProject ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                <span>{uploadT("found", { count: observations.length, project: sourceProject.title })}</span>
                <span>{uploadT("summary", { synced: syncedCount, pending: pendingCount, errors: errorCount })}</span>
                <Button type="button" size="sm" onClick={() => void syncPending()} disabled={syncableCount === 0 || syncing || Boolean(disabledReason)} title={disabledReason ?? undefined}>
                  {syncing ? <Loader2Icon className="size-3.5 animate-spin" /> : <UploadCloudIcon className="size-3.5" />}
                  {syncing ? uploadT("syncing") : uploadT("syncPending", { count: syncableCount })}
                </Button>
              </div>
            ) : null}

            {error ? (
              <p className="flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangleIcon className="size-4" />
                {error}
              </p>
            ) : null}
            {disabledReason ? <p className="text-xs text-muted-foreground">{disabledReason}</p> : null}
            {truncated ? <p className="text-xs text-muted-foreground">{uploadT("truncated")}</p> : null}

            {sourceProject ? (
              <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                {mergedObservations.map((observation) => {
                  const state = observation.status ?? observation.syncStatus;
                  const imageUrl = observation.photos[0]?.url ?? null;
                  return (
                    <article key={observation.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-background/70 p-2">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {imageUrl ? (
                          // iNaturalist image hosts are external and varied.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="grid h-full place-items-center text-muted-foreground"><BinocularsIcon className="size-5" /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{observation.commonName ?? observation.scientificName ?? uploadT("unnamedObservation")}</p>
                          <span className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                            state === "synced" ? "bg-primary/15 text-primary" :
                              state === "syncing" ? "bg-muted text-muted-foreground" :
                              state === "error" ? "bg-destructive/10 text-destructive" :
                              state === "syncedElsewhere" ? "bg-warn/30 text-foreground" :
                              "bg-muted text-muted-foreground",
                          )}>
                            {state === "syncing" ? uploadT("status.syncing") :
                              state === "synced" ? uploadT("status.synced") :
                              state === "syncedElsewhere" ? uploadT("status.syncedElsewhere") :
                              state === "error" ? uploadT("status.error") : uploadT("status.pending")}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{[observation.observedOn, observation.recordedBy].filter(Boolean).join(" · ") || observation.scientificName || uploadT("unnamedObservation")}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
