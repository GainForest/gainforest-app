"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { CheckIcon, FolderKanbanIcon, Link2OffIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalContent, ModalDescription, ModalFooter, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";
import { manageApiHref, type ManageTarget } from "@/lib/links";
import { setDatasetProject, type SetDatasetProjectResult } from "./observation-dataset-mutations";
import type { ObservationDatasetGroup } from "./GroupObservationsDatasetModal";

type AttachProject = { atUri: string; title: string; imageUrl: string | null };

export type AttachDatasetDoneSummary = {
  projectUri: string;
  projectName: string;
  result: SetDatasetProjectResult;
};

export function AttachDatasetToProjectModal({
  target,
  dataset,
  onDone,
}: {
  target: ManageTarget;
  dataset: ObservationDatasetGroup;
  onDone: (summary: AttachDatasetDoneSummary) => void;
}) {
  const t = useTranslations("upload.observations.attachProject");
  const { hide, popModal, stack } = useModal();

  const currentProjectUri = dataset.projectUri ?? null;
  const [projects, setProjects] = useState<AttachProject[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedUri, setSelectedUri] = useState<string>(currentProjectUri ?? "");
  const [search, setSearch] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repoOptions = target.kind === "group" ? { repo: target.did } : undefined;

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    (async () => {
      try {
        const response = await fetch(manageApiHref("/api/manage/projects", target), { cache: "no-store" });
        const data = (await response.json()) as Array<Record<string, unknown>> | { error?: string };
        if (cancelled) return;
        if (!response.ok || !Array.isArray(data)) {
          setLoadState("error");
          return;
        }
        const mapped = data
          .map((raw): AttachProject | null => {
            const atUri = typeof raw.atUri === "string" ? raw.atUri : null;
            if (!atUri) return null;
            return {
              atUri,
              title: typeof raw.title === "string" && raw.title.trim() ? raw.title : t("untitledProject"),
              imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
            };
          })
          .filter((project): project is AttachProject => Boolean(project));
        setProjects(mapped);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, t]);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => project.title.toLowerCase().includes(query));
  }, [search, projects]);

  const currentProjectName =
    projects.find((project) => project.atUri === currentProjectUri)?.title ?? dataset.projectName ?? null;
  const selectedProject = projects.find((project) => project.atUri === selectedUri) ?? null;
  const isUnchanged = (selectedUri || "") === (currentProjectUri || "");

  const closeModal = async () => {
    if (stack.length === 1) {
      await hide();
      popModal();
      return;
    }
    popModal();
  };

  const runSet = async (projectUri: string, projectName: string) => {
    setIsPending(true);
    setError(null);
    try {
      const result = await setDatasetProject(
        {
          datasetUri: dataset.datasetUri,
          projectUri,
          currentParentRkeys: dataset.parentRkeys,
        },
        repoOptions,
      );
      if (projectUri && !result.nested) {
        setError(result.nestError ?? t("attachFailed"));
        setIsPending(false);
        return;
      }
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) activeElement.blur();
      onDone({ projectUri, projectName, result });
      await closeModal();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("attachFailed"));
      setIsPending(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedProject) {
      setError(t("pickProject"));
      return;
    }
    await runSet(selectedProject.atUri, selectedProject.title);
  };

  const handleDetach = async () => {
    await runSet("", "");
  };

  return (
    <ModalContent dismissible={!isPending}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <ModalTitle>{t("title", { name: dataset.name })}</ModalTitle>
          <ModalDescription>{t("description", { count: dataset.count })}</ModalDescription>
        </div>

        {currentProjectUri ? (
          <p className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            <FolderKanbanIcon className="size-3.5 shrink-0 text-primary" />
            {t("currentlyIn", { project: currentProjectName ?? t("untitledProject") })}
          </p>
        ) : null}

        {loadState === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {t("loading")}
          </div>
        ) : loadState === "error" ? (
          <p className="py-8 text-center text-sm text-destructive">{t("loadError")}</p>
        ) : projects.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("noProjects")}</p>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <label htmlFor="attach-dataset-project-search" className="sr-only">
                {t("searchLabel")}
              </label>
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="attach-dataset-project-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                disabled={isPending}
                className="pl-9"
              />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
              {filteredProjects.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("noMatches")}</div>
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
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35 disabled:cursor-not-allowed disabled:opacity-60",
                          isSelected ? "bg-primary/5" : "bg-background",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-full border",
                            isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                          )}
                          aria-hidden="true"
                        >
                          {isSelected ? <CheckIcon className="size-3" /> : null}
                        </span>
                        <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {project.imageUrl ? (
                            <Image src={project.imageUrl} alt="" fill sizes="36px" unoptimized className="object-cover" />
                          ) : (
                            <span className="grid h-full place-items-center text-primary/45">
                              <FolderKanbanIcon className="size-4" />
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{project.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <ModalFooter className="mt-5 sm:justify-between">
        {currentProjectUri ? (
          <Button
            variant="ghost"
            onClick={() => void handleDetach()}
            disabled={isPending}
            className="text-muted-foreground hover:text-destructive"
          >
            <Link2OffIcon className="size-4" />
            {t("removeFromProject")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void closeModal()} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={isPending || loadState !== "ready" || projects.length === 0 || !selectedProject || isUnchanged}
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : <FolderKanbanIcon className="size-4" />}
            {currentProjectUri ? t("confirmMove") : t("confirmAttach")}
          </Button>
        </div>
      </ModalFooter>
    </ModalContent>
  );
}

export default AttachDatasetToProjectModal;
