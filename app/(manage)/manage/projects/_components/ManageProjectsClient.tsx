"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs";
import {
  BadgeCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CirclePlusIcon,
  FolderKanbanIcon,
  ImageIcon,
  LeafIcon,
  Loader2Icon,
  RotateCcwIcon,
  SearchIcon,
  SparkleIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { manageApiHref, manageHref, type ManageTarget } from "@/lib/links";
import type { BumicertRecord } from "@/app/_lib/indexer";
import { canCreateRecord, canDeleteRecord, canUpdateRecord } from "../../_lib/cgs-permissions";
import { createRecord, deleteRecord, putRecord, uploadBlob } from "../../_lib/mutations";

const PROJECT_COLLECTION = "org.hypercerts.collection";
const PROJECT_MODES = ["list", "new", "edit"] as const;
const TITLE_MAX = 90;
const SUMMARY_MAX = 300;
const STORY_MIN = 80;
const FIELD =
  "w-full rounded-xl border border-border bg-background text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary/45 focus:bg-background focus:ring-2 focus:ring-primary/20";
const FIELD_ERROR = "!border-2 !border-destructive ring-2 ring-destructive/25 focus:!border-destructive focus:ring-2 focus:ring-destructive/30";
const ERROR_MESSAGE = "flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75";
const QUERY_STATE_OPTIONS = { history: "push", scroll: false, shallow: true } as const;
type ProjectMode = (typeof PROJECT_MODES)[number];

type ManagedProject = {
  kind: "project";
  id: string;
  did: string;
  rkey: string;
  atUri: string;
  cid: string | null;
  title: string;
  shortDescription: string | null;
  createdAt: string;
  type: string | null;
  imageUrl: string | null;
  imageRef: string | null;
  creatorName: string | null;
  creatorAvatarRef: string | null;
  bumicertUris: string[];
  bumicertCount: number;
  locationUri: string | null;
  rawRecord: Record<string, unknown> | null;
};

type ProjectDraft = {
  title: string;
  shortDescription: string;
  description: string;
  bumicertUris: string[];
};

type ProjectField = "title" | "shortDescription" | "description";
type ProjectIssue = { field: ProjectField; section: "basics" | "story"; message: string };

type EditorState =
  | { mode: "create"; project: null }
  | { mode: "edit"; project: ManagedProject };

const emptyDraft: ProjectDraft = {
  title: "",
  shortDescription: "",
  description: "",
  bumicertUris: [],
};

export function ManageProjectsClient({ target, bumicerts }: { target: ManageTarget; bumicerts: BumicertRecord[] }) {
  const [projects, setProjects] = useState<ManagedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [{ mode, project: projectParam }, setProjectState] = useQueryStates(
    {
      mode: parseAsStringEnum<ProjectMode>([...PROJECT_MODES]).withDefault("list"),
      project: parseAsString,
    },
    QUERY_STATE_OPTIONS,
  );
  const [query, setQuery] = useState("");
  const createPermission = canCreateRecord(target);
  const updatePermission = canUpdateRecord(target);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(manageApiHref("/api/manage/projects", target), { cache: "no-store" });
      const data = (await response.json()) as ManagedProject[] | { error: string };
      if (!response.ok || !Array.isArray(data)) {
        setError(!Array.isArray(data) ? data.error : "Failed to load projects.");
        setProjects([]);
        return;
      }
      setProjects(data);
    } catch {
      setError("Could not reach the server.");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) => {
      const haystack = `${project.title} ${project.shortDescription ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [projects, query]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.rkey === projectParam || project.atUri === projectParam) ?? null,
    [projectParam, projects],
  );

  const openNew = () => {
    if (!createPermission.allowed) {
      setError(createPermission.reason ?? "You cannot create projects for this organization.");
      return;
    }
    void setProjectState({ mode: "new", project: null });
  };

  const openEdit = (project: ManagedProject) => {
    if (!updatePermission.allowed) {
      setError(updatePermission.reason ?? "You cannot edit this project.");
      return;
    }
    void setProjectState({ mode: "edit", project: project.rkey });
  };

  const backToList = () => {
    void setProjectState({ mode: "list", project: null });
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="space-y-5">
        {mode === "list" ? <ProjectHero /> : null}

        {mode === "new" ? (
          <ProjectEditor
            key="new-project"
            state={{ mode: "create", project: null }}
            target={target}
            bumicerts={bumicerts}
            presentation="inline"
            onClose={backToList}
            onSaved={() => {
              backToList();
              void loadProjects();
            }}
          />
        ) : mode === "edit" ? (
          loading ? (
            <ProjectsSkeleton />
          ) : selectedProject ? (
            <ProjectEditor
              key={selectedProject.atUri}
              state={{ mode: "edit", project: selectedProject }}
              target={target}
              bumicerts={bumicerts}
              presentation="inline"
              onClose={backToList}
              onSaved={() => {
                backToList();
                void loadProjects();
              }}
              onDeleted={() => {
                backToList();
                void loadProjects();
              }}
            />
          ) : (
            <ErrorState message="Choose a project to edit from your project list." onRetry={backToList} />
          )
        ) : (
          <>
            <div className="flex flex-row items-center justify-between gap-3">
              <div className="group/input-group border-input relative flex h-10 min-w-0 flex-1 items-center rounded-full border bg-background/70 shadow-xs backdrop-blur transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 sm:max-w-md">
                <SearchIcon className="ml-3 h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search projects"
                  placeholder="Search projects"
                  className="min-w-0 flex-1 truncate border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Button type="button" onClick={openNew} disabled={!createPermission.allowed} title={createPermission.reason ?? undefined} className="shrink-0">
                <CirclePlusIcon />
                Add project
              </Button>
            </div>

            {loading ? (
              <ProjectsSkeleton />
            ) : error ? (
              <ErrorState message={error} onRetry={() => void loadProjects()} />
            ) : filteredProjects.length === 0 ? (
              <EmptyState hasQuery={query.trim().length > 0} onCreate={openNew} />
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {filteredProjects.map((project, index) => (
                    <ProjectCard
                      key={project.atUri}
                      project={project}
                      index={index}
                      onEdit={() => openEdit(project)}
                      disabledReason={updatePermission.reason}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProjectHero() {
  const t = useTranslations("marketplace.manageProjects.hero");

  return (
    <section className="-mx-4 px-4 py-1 sm:-mx-6 sm:px-6">
      <div className="max-w-2xl">
        <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {t("description")}
        </p>
      </div>
    </section>
  );
}

function ProjectCard({
  project,
  index,
  onEdit,
  disabledReason = null,
}: {
  project: ManagedProject;
  index: number;
  onEdit: () => void;
  disabledReason?: string | null;
}) {
  const hasImage = Boolean(project.imageUrl);
  const disabled = Boolean(disabledReason);

  return (
    <motion.article
      layout
      role="button"
      tabIndex={0}
      onClick={disabled ? undefined : onEdit}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, delay: Math.min(index, 10) * 0.025, ease: [0.25, 0.1, 0.25, 1] }}
      title={disabledReason ?? undefined}
      className={cn(
        "group flex gap-3 rounded-2xl bg-card/45 px-1 py-3 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 sm:gap-4 sm:px-2 sm:py-4",
        disabled ? "cursor-not-allowed opacity-75" : "cursor-pointer hover:bg-surface-sunken",
      )}
    >
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-36 sm:w-52">
        {hasImage ? (
          <Image
            src={project.imageUrl!}
            alt={project.title}
            fill
            sizes="208px"
            unoptimized
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center bg-primary/8 text-primary/45">
            <FolderKanbanIcon className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h2 className="line-clamp-2 font-instrument text-2xl italic leading-tight text-foreground sm:text-3xl">{project.title}</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={(event) => {
                event.stopPropagation();
                if (!disabled) onEdit();
              }}
              disabled={disabled}
              title={disabledReason ?? undefined}
              aria-label={`Edit ${project.title}`}
              className="shrink-0 text-muted-foreground/60 hover:text-foreground"
            >
              <ChevronRightIcon className="size-8" />
            </Button>
          </div>
          {project.shortDescription ? (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{project.shortDescription}</p>
          ) : (
            <p className="mt-2 text-sm italic text-muted-foreground">No summary yet.</p>
          )}
          <p className="mt-2 truncate text-xs text-muted-foreground/75">{project.atUri}</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{project.bumicertCount > 0 ? `${project.bumicertCount} linked stor${project.bumicertCount === 1 ? "y" : "ies"}` : "No linked stories"}</span>
            <span>Created {formatProjectDate(project.createdAt)}</span>
            {project.imageUrl || project.imageRef ? (
              <span className="inline-flex items-center gap-1">
                <ImageIcon className="h-3.5 w-3.5" />
                Photo
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function ProjectEditor({
  state,
  target,
  bumicerts,
  onClose,
  onSaved,
  onDeleted,
  presentation = "modal",
}: {
  state: EditorState;
  target: ManageTarget;
  bumicerts: BumicertRecord[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  presentation?: "modal" | "inline";
}) {
  const [draft, setDraft] = useState<ProjectDraft>(() => draftFromProject(state.project));
  const [changedFields, setChangedFields] = useState<Set<ProjectField>>(() => new Set());
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedProjectUri, setSavedProjectUri] = useState<string | null>(state.project?.atUri ?? null);
  const modal = useModal();
  const isEdit = state.mode === "edit";
  const isInline = presentation === "inline";
  const savePermission = isEdit ? canUpdateRecord(target) : canCreateRecord(target);
  const deletePermission = canDeleteRecord(target);
  const issues = getProjectIssues(draft);
  const visibleIssues = saveAttempted ? issues : issues.filter((issue) => changedFields.has(issue.field));
  const issuesByName = issuesByProjectField(visibleIssues);
  const coverUrl = coverPreview ?? state.project?.imageUrl ?? null;
  const shellClass = cn(
    "relative overflow-visible",
    isInline ? "w-full" : "max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[1.75rem] bg-background p-5 shadow-2xl sm:p-7",
  );

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const nextPreview = URL.createObjectURL(coverFile);
    setCoverPreview(nextPreview);
    return () => URL.revokeObjectURL(nextPreview);
  }, [coverFile]);

  const markChanged = (field: ProjectField) => {
    setChangedFields((current) => new Set(current).add(field));
  };

  const updateDraft = (field: keyof ProjectDraft, value: string) => {
    if (field === "title" || field === "shortDescription" || field === "description") markChanged(field);
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const resetDraft = () => {
    setDraft(draftFromProject(state.project));
    setChangedFields(new Set());
    setSaveAttempted(false);
    setCoverFile(null);
    setError(null);
  };

  const handleCoverChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setCoverFile(file);
  };

  const handleDeleteProject = async () => {
    if (!isEdit) return;
    if (!deletePermission.allowed) {
      setError(deletePermission.reason ?? "You cannot delete this project.");
      return;
    }
    modal.pushModal(
      {
        id: `delete-project-${state.project.rkey}`,
        dialogWidth: "max-w-md",
        content: (
          <DeleteProjectModal
            projectTitle={state.project.title}
            onConfirm={async () => {
              await deleteRecord(PROJECT_COLLECTION, state.project.rkey, target.kind === "group" ? { repo: target.did } : undefined);
              onDeleted?.();
            }}
          />
        ),
      },
      true,
    );
    await modal.show();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveAttempted(true);
    if (issues.length > 0) {
      setError(issues[0]?.message ?? "Check the highlighted fields.");
      return;
    }
    if (!savePermission.allowed) {
      setError(savePermission.reason ?? "You cannot save this project.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const writeOptions = target.kind === "group" ? { repo: target.did } : undefined;
      const cover = coverFile ? await uploadBlob(coverFile, writeOptions) : null;
      const record = buildProjectRecord(draft, state.project, cover?.ref);
      const result = isEdit
        ? await putRecord(PROJECT_COLLECTION, state.project.rkey, record, { ...(state.project.cid ? { swapRecord: state.project.cid } : {}), ...(writeOptions ?? {}) })
        : await createRecord(PROJECT_COLLECTION, record, undefined, writeOptions);
      setSavedProjectUri(result.uri);
      setShowSuccess(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Project could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <AnimatePresence mode="wait">
      {showSuccess ? (
        <ProjectSuccessPanel
          key="success"
          isInline={isInline}
          className={shellClass}
          onBack={onSaved}
          projectTitle={draft.title.trim()}
          target={target}
          projectUri={savedProjectUri}
          showAddBumicert={draft.bumicertUris.length === 0}
        />
      ) : (
    <motion.form
      key="form"
      initial={{ opacity: 0, y: isInline ? 8 : 18, scale: isInline ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: isInline ? 1 : 0.985, filter: "blur(6px)" }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      onSubmit={handleSubmit}
      className={shellClass}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-gradient-to-b from-primary/[0.07] via-primary/[0.02] to-transparent" />

      {isInline ? (
        <div className="mb-6 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="-ml-2 text-muted-foreground" disabled={saving}>
            <ChevronLeftIcon className="size-4" /> Back to My Projects
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={resetDraft} className="text-muted-foreground" disabled={saving}>
            <RotateCcwIcon className="size-4" /> Start over
          </Button>
        </div>
      ) : (
        <div className="mb-6 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={resetDraft} className="text-muted-foreground" disabled={saving}>
            <RotateCcwIcon className="size-4" /> Start over
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close project editor" disabled={saving}>
            <XIcon className="size-5" />
          </Button>
        </div>
      )}

      <div className="grid gap-x-14 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <section>
            <SectionHeader title={isEdit ? "Edit project" : "Create new project"} />
            <div className="space-y-8">
              <Field label="Project name" hint="use a name people will understand" htmlFor="project-title" error={issuesByName.title?.message}>
                <input
                  id="project-title"
                  value={draft.title}
                  maxLength={TITLE_MAX}
                  onChange={(event) => updateDraft("title", event.target.value)}
                  placeholder="Community forest restoration"
                  className={cn(FIELD, "px-4 py-3 font-instrument text-2xl italic tracking-[-0.01em]", issuesByName.title && FIELD_ERROR)}
                />
                <div className="mt-1.5 text-right text-xs text-muted-foreground">{draft.title.length} / {TITLE_MAX}</div>
              </Field>

              <Field label="Short summary" hint="one or two sentences" htmlFor="project-summary" error={issuesByName.shortDescription?.message}>
                <textarea
                  id="project-summary"
                  value={draft.shortDescription}
                  maxLength={SUMMARY_MAX}
                  onChange={(event) => updateDraft("shortDescription", event.target.value.slice(0, SUMMARY_MAX))}
                  placeholder="Local stewards are restoring forest plots, tracking tree growth, and sharing updates from the field."
                  className={cn(FIELD, "min-h-24 resize-none px-4 py-3 text-[15px] leading-7", issuesByName.shortDescription && FIELD_ERROR)}
                />
                <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>{draft.shortDescription.trim().length < 30 ? "At least 30 characters" : "Looks good"}</span>
                  <span>{draft.shortDescription.trim().length} / {SUMMARY_MAX}</span>
                </div>
              </Field>

              <Field label="Longer description" hint="add the details people need to understand the work" htmlFor="project-description" error={issuesByName.description?.message}>
                <textarea
                  id="project-description"
                  value={draft.description}
                  onChange={(event) => updateDraft("description", event.target.value)}
                  placeholder={"What is this project about?\n\nWho is doing the work?\n\nWhere is it happening?\n\nWhat progress has been made so far?"}
                  className={cn(FIELD, "min-h-64 resize-y px-4 py-3.5 text-[15px] leading-7", issuesByName.description && FIELD_ERROR)}
                />
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {draft.description.trim().length < STORY_MIN ? `${STORY_MIN - draft.description.trim().length} more characters helps this read like a real project page.` : "Story has enough detail."}
                </div>
              </Field>

              <BumicertPicker
                bumicerts={bumicerts}
                selectedUris={draft.bumicertUris}
                onChange={(bumicertUris) => setDraft((current) => ({ ...current, bumicertUris }))}
              />
            </div>
          </section>

          {error ? (
            <p className={cn(ERROR_MESSAGE, "mt-10")}>
              <TriangleAlertIcon className="size-3.5 text-warn" /> {error}
            </p>
          ) : null}

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            {isEdit ? (
              <Button type="button" variant="destructive" size="lg" onClick={() => void handleDeleteProject()} disabled={saving || !deletePermission.allowed} title={deletePermission.reason ?? undefined}>
                <Trash2Icon className="size-4" />
                Delete project
              </Button>
            ) : <span />}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={saving || !savePermission.allowed} title={savePermission.reason ?? undefined}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : <FolderKanbanIcon className="size-4" />}
                {saving ? "Saving…" : isEdit ? "Save changes" : "Save project"}
              </Button>
            </div>
          </div>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <PhotoPanel coverUrl={coverUrl} onChange={handleCoverChange} />
        </aside>
      </div>
    </motion.form>
      )}
    </AnimatePresence>
  );

  if (isInline) return body;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-background/70 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-editor-title"
    >
      {body}
    </div>
  );
}

function ProjectSuccessPanel({
  isInline,
  className,
  onBack,
  projectTitle,
  target,
  projectUri,
  showAddBumicert,
}: {
  isInline: boolean;
  className: string;
  onBack: () => void;
  projectTitle: string;
  target: ManageTarget;
  projectUri: string | null;
  showAddBumicert: boolean;
}) {
  const addBumicertHref = projectUri
    ? manageHref(target, "newBumicert", { forProject: projectIdentityFromUri(projectUri) ?? projectUri })
    : manageHref(target, "newBumicert");

  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, y: 18, scale: isInline ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.99 }}
      transition={{ duration: 0.32, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex min-h-[28rem] overflow-hidden rounded-[2rem] bg-primary/[0.04] px-6 py-12 sm:px-10">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="absolute left-4 top-4 z-20 text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon className="size-4" />
          Back to My Projects
        </Button>
        <div className="relative z-10 m-auto flex max-w-2xl flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.72, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 24, delay: 0.08 }}
            className="relative grid size-20 place-items-center text-primary"
          >
            <div aria-hidden className="absolute inset-1 rounded-full bg-primary/25 blur-2xl animate-pulse" />
            <BadgeCheckIcon className="relative z-10 size-14" />
          </motion.div>
          <motion.h3
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.16 }}
            className="mt-3 font-instrument text-4xl font-medium italic leading-tight tracking-[-0.04em] text-foreground sm:text-5xl"
          >
            Project saved successfully
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.22 }}
            className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground"
          >
            {showAddBumicert
              ? "Add a Cert next to apply for donations and attach field data."
              : "Your project changes have been saved."}
          </motion.p>

          {showAddBumicert ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="mt-9 w-full max-w-xl overflow-visible"
            >
              <Link
                href={addBumicertHref}
                className="group relative flex flex-col items-center gap-4 overflow-visible rounded-[2rem] border border-border bg-background p-5 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_22px_80px_color-mix(in_oklab,var(--primary)_16%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:block sm:p-6 sm:pl-40 sm:pr-24 sm:text-left"
              >
                <div aria-hidden className="pointer-events-none relative z-20 -mt-10 h-40 w-32 sm:absolute sm:-left-8 sm:-top-10 sm:mt-0 sm:h-44 sm:w-40">
                  <SparkleIcon
                    className="absolute right-0 top-8 size-5 rotate-12 text-primary/45 transition-transform duration-300 group-hover:scale-125"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                  <SparkleIcon
                    className="absolute left-2 top-4 size-3 -rotate-12 text-primary/55 transition-transform duration-300 group-hover:scale-125"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                  <div className="absolute left-16 top-16 z-0 h-24 w-[4.5rem] rotate-6 rounded-[0.9rem] border border-border bg-background/55 p-1 shadow-xl backdrop-blur-sm transition-transform duration-300 group-hover:translate-y-1 group-hover:rotate-12 sm:left-20 sm:top-[4.5rem] sm:h-28 sm:w-20">
                    <div className="h-12 rounded-[0.65rem] bg-foreground/8 sm:h-14" />
                    <div className="mt-2 h-1.5 w-8 rounded-full bg-muted" />
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted" />
                  </div>
                  <div className="absolute left-4 top-8 z-10 h-28 w-[5.5rem] -rotate-12 rounded-[1rem] border border-border bg-background/80 p-1.5 shadow-2xl backdrop-blur-md transition-transform duration-300 group-hover:-translate-y-1 group-hover:-rotate-[18deg] sm:h-[8.5rem] sm:w-[6.5rem]">
                    <div className="grid h-16 place-items-center rounded-[0.75rem] bg-primary/15 sm:h-20">
                      <LeafIcon className="size-8 text-primary/80 sm:size-10" />
                    </div>
                    <div className="mt-2 h-2 w-10 rounded-full bg-muted" />
                    <div className="mt-1.5 h-2 w-full rounded-full bg-muted" />
                  </div>
                </div>

                <div aria-hidden className="absolute -left-12 -top-12 size-40 rounded-full bg-primary/10 blur-3xl transition-opacity duration-300 group-hover:opacity-90" />
                <div className="relative z-10 w-full">
                  <div className="min-w-0">
                    <h4 className="font-instrument text-2xl font-medium italic leading-tight tracking-[-0.03em] text-foreground sm:text-3xl">
                      Add the first Cert
                    </h4>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground sm:mx-0">
                      Turn {projectTitle || "this project"} into a fundable story with proof of work, field data, photos, dates, and places.
                    </p>
                  </div>
                </div>
                <span className="absolute right-6 top-1/2 hidden size-14 -translate-y-1/2 place-items-center rounded-full bg-transparent text-muted-foreground transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1/2 group-hover:bg-muted group-hover:text-primary sm:grid">
                  <ChevronRightIcon className="size-7" />
                </span>
              </Link>
            </motion.div>
          ) : null}

        </div>
      </div>
    </motion.div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-8">
      <h3 id="project-editor-title" className="font-instrument text-[2.5rem] italic leading-[1.05] tracking-[-0.01em] text-foreground">{title}</h3>
    </div>
  );
}

function Field({ label, hint, htmlFor, error, children }: { label: string; hint?: string; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {hint ? <span className="ml-2 font-normal text-muted-foreground">{hint}</span> : null}
      </label>
      {children}
      {error ? <p className={ERROR_MESSAGE}><TriangleAlertIcon className="size-3.5 text-warn" /> {error}</p> : null}
    </div>
  );
}

function PhotoPanel({ coverUrl, onChange }: { coverUrl: string | null; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="rounded-3xl bg-background p-4">
      <label htmlFor="project-image" className="block text-sm font-medium text-foreground">
        Project photo <span className="font-normal text-muted-foreground">optional</span>
      </label>
      <label
        htmlFor="project-image"
        className="mt-3 block cursor-pointer overflow-hidden rounded-2xl border border-dashed border-border bg-muted/35 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
      >
        <div className="relative aspect-[4/3]">
          {coverUrl ? (
            <Image src={coverUrl} alt="Project photo" fill unoptimized sizes="320px" className="object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <ImageIcon className="mb-3 size-8 text-primary/70" />
              <span className="font-instrument text-2xl italic text-foreground">Choose a photo</span>
              <span className="mt-1 text-xs leading-5">JPG, PNG, WebP, HEIC, or HEIF.</span>
            </div>
          )}
        </div>
      </label>
      <input
        id="project-image"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={onChange}
        className="sr-only"
      />
    </div>
  );
}

function DeleteProjectModal({ projectTitle, onConfirm }: { projectTitle: string; onConfirm: () => Promise<void> }) {
  const modal = useModal();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = async () => {
    await modal.hide();
    modal.popModal();
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      await close();
    } catch (deleteProjectError) {
      setError(deleteProjectError instanceof Error ? deleteProjectError.message : "Project could not be deleted.");
      setPending(false);
    }
  };

  return (
    <ModalContent dismissible={!pending} className="space-y-4">
      <ModalHeader>
        <ModalTitle>Delete project?</ModalTitle>
        <ModalDescription>
          This will remove “{projectTitle}” from your account. This action cannot be undone.
        </ModalDescription>
      </ModalHeader>
      {error ? (
        <p className={ERROR_MESSAGE}>
          <TriangleAlertIcon className="size-3.5 text-warn" /> {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void close()}>Cancel</Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => void confirm()}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
          Delete project
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

function BumicertPicker({
  bumicerts,
  selectedUris,
  onChange,
}: {
  bumicerts: BumicertRecord[];
  selectedUris: string[];
  onChange: (uris: string[]) => void;
}) {
  const selectedSet = useMemo(() => new Set(selectedUris), [selectedUris]);
  const initialSelectedSetRef = useRef<Set<string> | null>(null);
  if (initialSelectedSetRef.current === null) {
    initialSelectedSetRef.current = new Set(selectedUris);
  }
  const orderedBumicerts = useMemo(() => {
    const initialSelectedSet = initialSelectedSetRef.current ?? new Set<string>();
    return [...bumicerts].sort((a, b) => Number(initialSelectedSet.has(b.atUri)) - Number(initialSelectedSet.has(a.atUri)));
  }, [bumicerts]);

  const toggleBumicert = (uri: string) => {
    if (selectedSet.has(uri)) {
      onChange(selectedUris.filter((selectedUri) => selectedUri !== uri));
    } else {
      onChange([...selectedUris, uri]);
    }
  };

  return (
    <section className="space-y-2.5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <label className="block text-sm font-medium text-foreground">
          Certs in this project
          <span className="ml-2 font-normal text-muted-foreground">pick from your published Certs</span>
        </label>
        <span className="text-xs text-muted-foreground">{selectedUris.length} selected</span>
      </div>

      {bumicerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
          <LeafIcon className="mx-auto mb-3 size-8 text-primary/70" />
          <p className="font-instrument text-xl italic text-foreground">No Certs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a Cert first, then add it to a project.</p>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-muted p-2">
          <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)] md:grid-cols-2">
            {orderedBumicerts.map((bumicert) => {
              const selected = selectedSet.has(bumicert.atUri);
              return (
                <button
                  key={bumicert.atUri}
                  type="button"
                  onClick={() => toggleBumicert(bumicert.atUri)}
                  aria-pressed={selected}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-xl bg-background/70 p-2 pr-10 text-left transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    selected && "bg-primary/[0.08] ring-1 ring-primary/25",
                  )}
                >
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {bumicert.imageUrl ? (
                      <Image src={bumicert.imageUrl} alt={bumicert.title} fill unoptimized sizes="56px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <span className="grid h-full place-items-center text-primary/55">
                        <LeafIcon className="size-5" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{bumicert.title}</span>
                  </span>
                  <span
                    className={cn(
                      "absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full border transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-transparent group-hover:text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    <CheckIcon className="size-4" />
                  </span>
                </button>
              );
            })}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-muted to-transparent" />
        </div>
      )}
    </section>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading projects">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex gap-3 rounded-2xl px-1 py-3 sm:gap-4 sm:px-2 sm:py-4">
          <Skeleton className="h-24 w-24 shrink-0 rounded-xl sm:h-28 sm:w-36" />
          <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
            <div className="space-y-3">
              <Skeleton className="h-6 w-3/4 rounded-full" />
              <Skeleton className="h-4 w-full rounded-full" />
              <Skeleton className="h-4 w-2/3 rounded-full" />
            </div>
            <div className="mt-3 flex justify-between border-t border-border/60 pt-2">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasQuery, onCreate }: { hasQuery: boolean; onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex min-h-[18rem] flex-col items-center justify-center rounded-[2rem] bg-muted/20 px-6 text-center"
    >
      <FolderKanbanIcon className="mb-4 h-10 w-10 text-primary" />
      <h2 className="font-instrument text-2xl font-medium italic tracking-[-0.02em]">
        {hasQuery ? "No matching projects" : "No projects yet"}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {hasQuery ? "Try another search term or clear the search field." : "Create your first project page with a name, summary, story, and optional photo."}
      </p>
      {!hasQuery ? (
        <Button type="button" variant="outline" size="sm" onClick={onCreate} className="mt-5">
          <CirclePlusIcon />
          Add project
        </Button>
      ) : null}
    </motion.div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-[2rem] bg-muted/30 px-6 text-center">
      <TriangleAlertIcon className="mb-4 h-9 w-9 text-muted-foreground opacity-70" />
      <h2 className="font-instrument text-2xl font-medium italic tracking-[-0.02em]">Could not load projects</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-5">
        Retry
      </Button>
    </div>
  );
}

function getProjectIssues(draft: ProjectDraft): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  if (draft.title.trim().length < 3) issues.push({ field: "title", section: "basics", message: "Add a project name with at least 3 characters." });
  if (draft.shortDescription.trim().length < 30) issues.push({ field: "shortDescription", section: "story", message: "Write at least 30 characters for the short summary." });
  if (draft.description.trim().length < STORY_MIN) issues.push({ field: "description", section: "story", message: `Write at least ${STORY_MIN} characters for the project story.` });
  return issues;
}

function issuesByProjectField(issues: ProjectIssue[]): Partial<Record<ProjectField, ProjectIssue>> {
  return Object.fromEntries(issues.map((issue) => [issue.field, issue])) as Partial<Record<ProjectField, ProjectIssue>>;
}

function draftFromProject(project: ManagedProject | null): ProjectDraft {
  if (!project) return emptyDraft;
  return {
    title: project.title,
    shortDescription: project.shortDescription ?? "",
    description: descriptionText(project.rawRecord?.description),
    bumicertUris: project.bumicertUris,
  };
}

function buildProjectRecord(
  draft: ProjectDraft,
  project: ManagedProject | null,
  uploadedImageRef?: unknown,
): Record<string, unknown> {
  const nextRecord: Record<string, unknown> = {
    ...(project?.rawRecord ?? {}),
    $type: PROJECT_COLLECTION,
    title: draft.title.trim(),
    type: "project",
    items: draft.bumicertUris.map((uri) => ({ itemIdentifier: { uri } })),
    createdAt: stringValue(project?.rawRecord?.createdAt) ?? project?.createdAt ?? new Date().toISOString(),
  };

  const summary = draft.shortDescription.trim();
  if (summary) nextRecord.shortDescription = summary;
  else delete nextRecord.shortDescription;

  const description = draft.description.trim();
  if (description) nextRecord.description = { $type: "org.hypercerts.defs#descriptionString", value: description };
  else delete nextRecord.description;

  if (uploadedImageRef) {
    nextRecord.banner = { $type: "org.hypercerts.defs#largeImage", image: uploadedImageRef };
  }

  return nextRecord;
}

function descriptionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "value" in value && typeof value.value === "string") return value.value;
  return "";
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function formatProjectDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function projectIdentityFromUri(uri: string): string | null {
  const match = uri.match(/^at:\/\/([^/]+)\/org\.hypercerts\.collection\/([^/]+)$/);
  return match?.[1] && match[2] ? `${match[1]}/${match[2]}` : null;
}
