"use client";

/**
 * "Add to project" for a folder of recordings (an `ac.deployment`).
 *
 * Right-clicking a folder on the profile's Audio tab opens this dialog: pick
 * one of the account's projects — or name a new one, created on the spot —
 * and the folder lands on that project's evidence timeline as an
 * `org.hypercerts.context.attachment`, the same way a published soundscape
 * does (see ShareSoundscape's AddSoundscapeToProjectModal).
 *
 * What gets attached: the deployment's detail page link when it has one, plus
 * a sample of the folder's recordings as playable audio tiles. Recordings are
 * referenced by AT-URI, never copied — the folder itself is untouched.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  FolderKanbanIcon,
  FolderPlusIcon,
  Loader2Icon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalContent, ModalDescription, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";
import { manageApiHref } from "@/lib/links";
import { localProjectHref } from "@/app/_lib/urls";
import { isPdsBlobUrl, resolveStrongRef } from "@/app/_lib/pds";
import { notifyProjectsChanged } from "@/app/_lib/projects-events";
import { createRecord, deleteRecord } from "@/app/(manage)/manage/_lib/mutations";
import {
  CERT_COLLECTION,
  PROJECT_COLLECTION,
  buildCertRecord,
  buildProjectRecord,
  emptyProjectCertDraft,
  extractRkey,
} from "@/app/(manage)/manage/_lib/project-cert";
import { createContextAttachment } from "@/app/cert/[did]/[rkey]/_components/timeline/contextAttachmentMutations";

/** Matches the project wizard's minimum title length. */
const NEW_PROJECT_TITLE_MIN = 3;
const NEW_PROJECT_TITLE_MAX = 90;
const NOTE_MAX = 200;

/**
 * How many of the folder's recordings are attached as playable tiles. An
 * SD card can hold hundreds of WAVs; the timeline entry stays a sample — the
 * folder itself (linked via the deployment page) always has everything.
 */
const RECORDING_SAMPLE_MAX = 24;

type PickerProject = {
  rkey: string;
  did: string;
  atUri: string;
  cid: string | null;
  title: string;
  imageUrl: string | null;
};

type ApiProject = {
  rkey?: unknown;
  did?: unknown;
  atUri?: unknown;
  cid?: unknown;
  title?: unknown;
  imageUrl?: unknown;
};

function toPickerProject(raw: ApiProject, fallbackTitle: string): PickerProject | null {
  if (typeof raw.rkey !== "string" || typeof raw.did !== "string" || typeof raw.atUri !== "string") return null;
  return {
    rkey: raw.rkey,
    did: raw.did,
    atUri: raw.atUri,
    cid: typeof raw.cid === "string" ? raw.cid : null,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : fallbackTitle,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
  };
}

export function AddDeploymentToProjectModal({
  folderName,
  detailUrl,
  recordingUris,
  did,
  mutationRepo,
}: {
  /** The folder's display name — becomes the timeline entry's title. */
  folderName: string;
  /** Absolute URL of the deployment's detail page, when it has one. */
  detailUrl: string | null;
  /** AT-URIs of the folder's recordings, oldest first. */
  recordingUris: string[];
  /** The profile's repo DID (the personal write target). */
  did: string;
  /** Group repo DID for mutations, when the profile is an organization. */
  mutationRepo: string | null;
}) {
  const t = useTranslations("common.recordingFolders.addToProject");
  const modal = useModal();

  const [projects, setProjects] = useState<PickerProject[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedTo, setAddedTo] = useState<PickerProject | null>(null);

  const repoOptions = useMemo(() => (mutationRepo ? { repo: mutationRepo } : undefined), [mutationRepo]);
  const apiTarget = useMemo(
    () => (mutationRepo ? ({ kind: "group", did: mutationRepo } as const) : ({ kind: "personal", did } as const)),
    [did, mutationRepo],
  );

  const close = useCallback(async () => {
    await modal.hide();
    modal.popModal();
  }, [modal]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(manageApiHref("/api/manage/projects", apiTarget), { cache: "no-store" });
        const data = (await response.json()) as ApiProject[] | { error?: string };
        if (cancelled) return;
        if (!response.ok || !Array.isArray(data)) {
          setLoadError(true);
          setProjects([]);
          return;
        }
        setProjects(
          data
            .map((raw) => toPickerProject(raw, t("untitledProject")))
            .filter((project): project is PickerProject => Boolean(project)),
        );
      } catch {
        if (cancelled) return;
        setLoadError(true);
        setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiTarget, t]);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) => project.title.toLowerCase().includes(normalized));
  }, [projects, query]);

  /** Write the timeline attachment pointing the project at this folder. */
  const attachTo = useCallback(
    async (project: PickerProject) => {
      // A timeline entry pins the exact version of the project it hangs off,
      // so a project listed without a CID is read from its PDS first.
      const subject = project.cid ? { uri: project.atUri, cid: project.cid } : await resolveStrongRef(project.atUri);
      // Most recent recordings, as playable audio tiles; the deployment page
      // link (when there is one) leads to the full folder.
      const sample = recordingUris.slice(-RECORDING_SAMPLE_MAX);
      await createContextAttachment({
        draft: {
          title: folderName,
          contentType: "audio",
          contents: [...(detailUrl ? [detailUrl] : []), ...sample],
          note: note.trim() || t("defaultNote", { count: recordingUris.length }),
        },
        activitySubject: subject,
        organizationDid: project.did,
        repo: mutationRepo ?? undefined,
      });
    },
    [detailUrl, folderName, mutationRepo, note, recordingUris, t],
  );

  const addToExisting = useCallback(
    async (project: PickerProject) => {
      setBusyKey(project.atUri);
      setError(null);
      try {
        await attachTo(project);
        setAddedTo(project);
      } catch {
        setError(t("failed"));
      } finally {
        setBusyKey(null);
      }
    },
    [attachTo, t],
  );

  /**
   * Minimal version of the project wizard's create flow: the 1:1 cert first,
   * then the project linking to it, rolling the orphan cert back if the
   * project write fails. Everything beyond the title can be filled in later
   * from Manage → Projects.
   */
  const createAndAdd = useCallback(async () => {
    const title = newTitle.trim();
    if (title.length < NEW_PROJECT_TITLE_MIN) {
      setError(t("newProjectTitleRequired"));
      return;
    }
    setBusyKey("new");
    setError(null);
    try {
      const draft = { ...emptyProjectCertDraft, title };
      const certResult = await createRecord(CERT_COLLECTION, buildCertRecord(draft), undefined, repoOptions);
      let projectResult: { uri: string; cid: string };
      try {
        const projectRecord = buildProjectRecord(draft, {
          certRef: { uri: certResult.uri, cid: certResult.cid },
        });
        projectResult = await createRecord(PROJECT_COLLECTION, projectRecord, undefined, repoOptions);
      } catch (projectError) {
        await deleteRecord(CERT_COLLECTION, extractRkey(certResult.uri), repoOptions).catch(() => {});
        throw projectError;
      }
      notifyProjectsChanged();
      const project: PickerProject = {
        rkey: extractRkey(projectResult.uri),
        did: mutationRepo ?? did,
        atUri: projectResult.uri,
        cid: projectResult.cid,
        title,
        imageUrl: null,
      };
      await attachTo(project);
      setAddedTo(project);
    } catch {
      setError(t("failed"));
    } finally {
      setBusyKey(null);
    }
  }, [attachTo, did, mutationRepo, newTitle, repoOptions, t]);

  if (addedTo) {
    return (
      <ModalContent className="w-full">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <CheckCircle2Icon className="size-5 text-primary" />
            {t("addedTitle")}
          </ModalTitle>
          <ModalDescription>{t("addedBody", { name: folderName, project: addedTo.title })}</ModalDescription>
        </ModalHeader>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => void close()}>
            {t("close")}
          </Button>
          <Button asChild>
            <Link href={localProjectHref(addedTo.did, addedTo.rkey)}>{t("viewProject")}</Link>
          </Button>
        </div>
      </ModalContent>
    );
  }

  const busy = busyKey !== null;

  return (
    <ModalContent dismissible={!busy} className="w-full">
      <ModalHeader>
        <ModalTitle className="break-words pe-8">{t("title", { name: folderName })}</ModalTitle>
        <ModalDescription>{t("body")}</ModalDescription>
      </ModalHeader>

      <div className="mt-4 flex flex-col gap-1.5">
        <Label htmlFor="deployment-project-note">{t("noteLabel")}</Label>
        <Input
          id="deployment-project-note"
          value={note}
          maxLength={NOTE_MAX}
          disabled={busy}
          placeholder={t("notePlaceholder")}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {projects === null ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> {t("loading")}
        </div>
      ) : loadError ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-muted/30 px-6 py-8 text-center">
          <TriangleAlertIcon className="size-7 text-muted-foreground opacity-70" />
          <p className="text-sm text-muted-foreground">{t("loadError")}</p>
        </div>
      ) : (
        <>
          {projects.length > 6 ? (
            <div className="relative mt-4">
              <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="w-full rounded-xl border border-border bg-background py-2 ps-9 pe-3 text-sm outline-none focus:border-primary/50"
              />
            </div>
          ) : null}

          {projects.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-muted/30 px-4 py-5 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <ul className="mt-3 max-h-60 space-y-1.5 overflow-y-auto">
              {filtered.map((project) => {
                const projectBusy = busyKey === project.atUri;
                return (
                  <li key={`${project.did}/${project.rkey}`}>
                    <button
                      type="button"
                      onClick={() => void addToExisting(project)}
                      disabled={busy}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-start transition-colors hover:bg-muted disabled:opacity-60",
                        projectBusy && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                        {project.imageUrl ? (
                          <Image
                            src={project.imageUrl}
                            alt=""
                            fill
                            // Only PDS blob URLs are safe to optimize; a project
                            // banner can point at an arbitrary external host.
                            unoptimized={!isPdsBlobUrl(project.imageUrl)}
                            sizes="36px"
                            className="object-cover"
                          />
                        ) : (
                          <FolderKanbanIcon className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {project.title}
                      </span>
                      {projectBusy ? (
                        <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
                      ) : (
                        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* A brand-new project, named right here — created with just its
              title, ready to be fleshed out later from Manage → Projects. */}
          {creatingNew ? (
            <div className="mt-3 flex flex-col gap-1.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
              <Label htmlFor="deployment-new-project-title">{t("newProjectTitleLabel")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="deployment-new-project-title"
                  value={newTitle}
                  autoFocus
                  maxLength={NEW_PROJECT_TITLE_MAX}
                  disabled={busy}
                  placeholder={t("newProjectTitlePlaceholder")}
                  onChange={(event) => setNewTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !busy) void createAndAdd();
                  }}
                />
                <Button
                  type="button"
                  className="shrink-0"
                  disabled={busy || newTitle.trim().length < NEW_PROJECT_TITLE_MIN}
                  onClick={() => void createAndAdd()}
                >
                  {busyKey === "new" ? <Loader2Icon className="size-4 animate-spin" /> : <FolderPlusIcon className="size-4" />}
                  {busyKey === "new" ? t("creating") : t("createAndAdd")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={busy}
              onClick={() => setCreatingNew(true)}
            >
              <FolderPlusIcon className="size-4" />
              {t("newProject")}
            </Button>
          )}
        </>
      )}

      {error ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-warn" /> {error}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <Button variant="outline" onClick={() => void close()} disabled={busy}>
          {t("cancel")}
        </Button>
      </div>
    </ModalContent>
  );
}
