"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, FolderKanbanIcon, Layers2Icon, Loader2Icon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalContent, ModalDescription, ModalFooter, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";
import { manageApiHref, type ManageTarget } from "@/lib/links";
import {
  attachDatasetToProject,
  attachObservationsToProject,
  type AttachToProjectResult,
  type ProjectAttachInput,
} from "./observation-project-mutations";

export type AddToProjectTarget =
  /** Loose sightings picked in the list. */
  | { kind: "observations"; occurrences: ProjectAttachInput[] }
  /** A whole dataset, listed on the project as a record too. */
  | {
      kind: "dataset";
      datasetUri: string;
      datasetCid: string | null;
      name: string;
      /** Projects currently listing the dataset, so it can move rather than multiply. */
      parentRkeys: string[];
      occurrences: ProjectAttachInput[];
    };

type ProjectOption = {
  atUri: string;
  title: string;
  /** The project's mapped site, filled in on sightings that have none. */
  locationUri: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toProjectOption(raw: unknown): ProjectOption | null {
  if (!isRecord(raw)) return null;
  const atUri = typeof raw.atUri === "string" ? raw.atUri : null;
  if (!atUri) return null;
  return {
    atUri,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Untitled project",
    locationUri: typeof raw.locationUri === "string" ? raw.locationUri : null,
  };
}

/**
 * Files already-published sightings — or a whole dataset of them — under a
 * project. The counterpart to picking a project while adding: stewards collect
 * first and sort later, and until now nothing could be filed after the fact.
 */
export function AddToProjectModal({
  target,
  subject,
  preselectedProjectUri = null,
  onDone,
}: {
  target: ManageTarget;
  subject: AddToProjectTarget;
  /** Project to preselect, e.g. when arriving from that project's own page. */
  preselectedProjectUri?: string | null;
  onDone: (summary: { projectUri: string; projectTitle: string; result: AttachToProjectResult }) => void;
}) {
  const t = useTranslations("upload.observations.addToProject");
  const { hide, popModal, stack } = useModal();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedUri, setSelectedUri] = useState(preselectedProjectUri ?? "");
  const [search, setSearch] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const occurrences = subject.occurrences;
  const repoOptions = target.kind === "group" ? { repo: target.did } : undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(manageApiHref("/api/manage/projects", target), { cache: "no-store" });
        const data = (await response.json()) as unknown;
        if (cancelled || !response.ok || !Array.isArray(data)) return;
        setProjects(data.map(toProjectOption).filter((project): project is ProjectOption => Boolean(project)));
      } catch {
        // Handled by the empty state below.
      } finally {
        if (!cancelled) setProjectsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => project.title.toLowerCase().includes(query));
  }, [projects, search]);
  const selectedProject = projects.find((project) => project.atUri === selectedUri) ?? null;

  // Sightings already filed under the chosen project stay put; showing the
  // number keeps the button's count honest.
  const alreadyThere = selectedProject
    ? occurrences.filter((occurrence) => occurrence.projectRef === selectedProject.atUri).length
    : 0;
  const movable = occurrences.length - alreadyThere;

  const closeModal = async () => {
    if (stack.length === 1) {
      await hide();
      popModal();
      return;
    }
    popModal();
  };

  const handleConfirm = async () => {
    if (!selectedProject) {
      setError(t("pickProject"));
      return;
    }
    setIsPending(true);
    setError(null);
    try {
      const result =
        subject.kind === "dataset"
          ? await attachDatasetToProject(
              {
                projectUri: selectedProject.atUri,
                siteUri: selectedProject.locationUri,
                datasetUri: subject.datasetUri,
                datasetCid: subject.datasetCid,
                parentRkeys: subject.parentRkeys,
                occurrences,
              },
              repoOptions,
            )
          : await attachObservationsToProject(
              { projectUri: selectedProject.atUri, siteUri: selectedProject.locationUri, occurrences },
              repoOptions,
            );

      if (result.attached.length === 0 && result.errors.length > 0) {
        setError(result.errors[0]?.error ?? t("attachFailed"));
        setIsPending(false);
        return;
      }
      onDone({ projectUri: selectedProject.atUri, projectTitle: selectedProject.title, result });
      await closeModal();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("attachFailed"));
      setIsPending(false);
    }
  };

  return (
    <ModalContent dismissible={!isPending}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <ModalTitle>
            {subject.kind === "dataset" ? t("datasetTitle", { name: subject.name }) : t("title", { count: occurrences.length })}
          </ModalTitle>
          <ModalDescription>
            {subject.kind === "dataset" ? t("datasetDescription", { count: occurrences.length }) : t("description")}
          </ModalDescription>
        </div>

        <div className="relative">
          <label htmlFor="add-to-project-search" className="sr-only">
            {t("searchLabel")}
          </label>
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="add-to-project-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            disabled={isPending}
            className="pl-9"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
          {!projectsLoaded ? (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {projects.length === 0 ? t("noProjects") : t("noMatches")}
            </div>
          ) : (
            <div role="radiogroup" aria-label={t("projectsLabel")} className="divide-y divide-border">
              {filteredProjects.map((project) => {
                const isSelected = selectedUri === project.atUri;
                return (
                  <button
                    key={project.atUri}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      setSelectedUri(project.atUri);
                      setError(null);
                    }}
                    disabled={isPending}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35 disabled:cursor-not-allowed disabled:opacity-60",
                      isSelected ? "bg-primary/5" : "bg-background",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                      )}
                      aria-hidden="true"
                    >
                      {isSelected ? <CheckIcon className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{project.title}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {subject.kind === "dataset" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Layers2Icon className="size-3 shrink-0" />
            {t("datasetNote")}
          </p>
        ) : null}
        {alreadyThere > 0 ? <p className="text-xs text-muted-foreground">{t("someAlreadyThere", { count: alreadyThere })}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <ModalFooter className="mt-5">
        <Button variant="outline" onClick={() => void closeModal()} disabled={isPending}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void handleConfirm()} disabled={isPending || !selectedProject || movable === 0}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <FolderKanbanIcon className="size-4" />}
          {t("confirm", { count: movable })}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
