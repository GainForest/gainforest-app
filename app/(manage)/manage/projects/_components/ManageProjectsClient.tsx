"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs";
import {
  BadgeCheckIcon,
  BinocularsIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CirclePlusIcon,
  FolderKanbanIcon,
  ImageIcon,
  Loader2Icon,
  MapPinIcon,
  MapPinPlusIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  SquarePenIcon,
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
import { manageApiHref, manageHref, profileBasePath, type ManageTarget } from "@/lib/links";
import { localProjectHref } from "@/app/_lib/urls";
import { notifyProjectsChanged } from "@/app/_lib/projects-events";
import { WORK_SCOPE_MESSAGE_KEYS, type KnownWorkScopeKey } from "@/app/_lib/work-scope-labels";
import { canCreateRecord, canDeleteRecord, canUpdateRecord } from "../../_lib/cgs-permissions";
import { createRecord, deleteRecord, getRecord, putRecord, uploadBlob } from "../../_lib/mutations";
import { SiteEditorModal, SiteEditorModalId } from "../../_modals/SiteEditorModal";
import {
  CERT_COLLECTION,
  PROJECT_COLLECTION,
  PROJECT_WORK_SCOPE_KEYS,
  buildCertRecord,
  buildProjectRecord,
  certToDraftFields,
  clampSummary,
  contributorList,
  descriptionText,
  emptyProjectCertDraft,
  extractLocationRefs,
  extractRkey,
  resolveSiteRefs,
  scopeList,
  type ProjectCertDraft,
  type StrongRef,
} from "../../_lib/project-cert";

const PROJECT_MODES = ["list", "new", "edit"] as const;
const TITLE_MAX = 90;
const FIELD =
  "w-full rounded-xl border border-border bg-background text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary/45 focus:bg-background focus:ring-2 focus:ring-primary/20";
const FIELD_ERROR = "!border-2 !border-destructive ring-2 ring-destructive/25 focus:!border-destructive focus:ring-2 focus:ring-destructive/30";
const ERROR_MESSAGE = "flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75";
const QUERY_STATE_OPTIONS = { history: "push", scroll: false, shallow: true } as const;
type ProjectMode = (typeof PROJECT_MODES)[number];

const WORK_SCOPE_KEYS: KnownWorkScopeKey[] = [...PROJECT_WORK_SCOPE_KEYS];

// Ma Earth-style progressive-disclosure flow: one focused question per screen,
// a single progress bar, ending in review → success. Rendered in bumicerts'
// own editorial styling.
const WIZARD_STEPS = ["intro", "basics", "focus", "timeline", "story", "network", "photo", "review"] as const;
type WizardStepId = (typeof WIZARD_STEPS)[number];

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

type ManagedLocation = {
  metadata: { did: string; uri: string; rkey: string; cid: string; createdAt: string | null };
  record: { name: string | null; description: string | null; locationType: string | null; location: unknown };
};

type ActorResult = { did: string; handle: string | null; displayName: string | null; avatar: string | null };

type SitesStatus = "idle" | "loading" | "ready" | "error";

type UploadedBlobLike = { ref?: unknown; mimeType?: unknown; size?: unknown; blob?: unknown };

type ProjectField = "title" | "shortDescription" | "description";
type ProjectIssue = { field: ProjectField; message: string };

type EditorState =
  | { mode: "create"; project: null }
  | { mode: "edit"; project: ManagedProject };

/** The cert (org.hypercerts.claim.activity) bound 1:1 to a project. */
type LinkedCert = { rkey: string; cid: string | null; record: Record<string, unknown> } | null;

export function ManageProjectsClient({ target }: { target: ManageTarget }) {
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
  const modal = useModal();

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
      // Keep the sidebar's "Create a project" card in sync after creates/deletes.
      notifyProjectsChanged();
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

  // Project creation opens as a popup over the list rather than replacing the
  // page, so the steward keeps their projects in view.
  const openCreateModal = useCallback(() => {
    const close = (didChange: boolean) => {
      void modal.hide().then(() => modal.clear());
      if (didChange) void loadProjects();
    };
    modal.pushModal(
      {
        id: "create-project",
        // Inset the width so the forced dialog isn't edge-to-edge on phones.
        dialogWidth: "max-w-3xl w-[calc(100%-2rem)]",
        forceDialog: true,
        content: (
          <CreateProjectModal
            target={target}
            onClose={() => close(false)}
            onSaved={() => close(true)}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [modal, target, loadProjects]);

  // Open the create popup whenever the URL asks for it. The sidebar "Create a
  // project" link and the /cert/create redirect both navigate to ?mode=new; we
  // open the modal and immediately clear the param so the list shows behind it
  // and a later click can re-trigger it.
  useEffect(() => {
    if (mode !== "new") return;
    if (createPermission.allowed) openCreateModal();
    void setProjectState({ mode: "list", project: null });
  }, [mode, createPermission.allowed, openCreateModal, setProjectState]);

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
    openCreateModal();
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
        {mode !== "edit" ? <ProjectHero /> : null}

        {mode === "edit" ? (
          loading ? (
            <ProjectsSkeleton />
          ) : selectedProject ? (
            <ProjectEditor
              key={selectedProject.atUri}
              state={{ mode: "edit", project: selectedProject }}
              target={target}
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
            {/* The search + Add row is only useful once projects exist. With
                none, it just crowds the empty-state hero card (which has its
                own "Create a project" CTA), so hide it until there's a project
                to search. The "no matching search" case still has projects, so
                the row stays visible there. */}
            {projects.length > 0 ? (
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
            ) : null}

            {loading ? (
              <ProjectsSkeleton />
            ) : error ? (
              <ErrorState message={error} onRetry={() => void loadProjects()} />
            ) : filteredProjects.length === 0 ? (
              query.trim().length > 0 ? (
                <EmptyState hasQuery onCreate={openNew} />
              ) : (
                <ProjectCreateHeroCard
                  onCreate={openNew}
                  disabled={!createPermission.allowed}
                  disabledReason={createPermission.reason}
                />
              )
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {filteredProjects.map((project, index) => (
                    <ProjectCard
                      key={project.atUri}
                      project={project}
                      index={index}
                      galleryHref={`${profileBasePath(target)}/projects/${encodeURIComponent(project.rkey)}/gallery`}
                      observationsHref={manageHref(target, "observations", { project: project.atUri })}
                      sitesHref={`${profileBasePath(target)}/projects/${encodeURIComponent(project.rkey)}/sites`}
                      timelineHref={`${profileBasePath(target)}/projects/${encodeURIComponent(project.rkey)}/timeline`}
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
  galleryHref,
  observationsHref,
  sitesHref,
  timelineHref,
  onEdit,
  disabledReason = null,
}: {
  project: ManagedProject;
  index: number;
  galleryHref: string;
  observationsHref: string;
  sitesHref: string;
  timelineHref: string;
  onEdit: () => void;
  disabledReason?: string | null;
}) {
  const t = useTranslations("marketplace.manageProjects.actions");
  const router = useRouter();
  const hasImage = Boolean(project.imageUrl);
  const disabled = Boolean(disabledReason);
  // Clicking the card now opens the public project page (better UX). Editing
  // moved to an explicit "Edit project" button below.
  const projectHref = localProjectHref(project.did, project.rkey);

  return (
    <motion.article
      layout
      role="link"
      tabIndex={0}
      onClick={() => router.push(projectHref)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(projectHref);
        }
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, delay: Math.min(index, 10) * 0.025, ease: [0.25, 0.1, 0.25, 1] }}
      aria-label={t("viewProjectFor", { title: project.title })}
      className={cn(
        "group flex cursor-pointer gap-3 rounded-2xl bg-card/45 px-1 py-3 transition-colors duration-300 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 sm:gap-4 sm:px-2 sm:py-4",
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
            <span aria-hidden className="shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground/70">
              <ChevronRightIcon className="size-8" />
            </span>
          </div>
          {project.shortDescription ? (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{project.shortDescription}</p>
          ) : (
            <p className="mt-2 text-sm italic text-muted-foreground">No summary yet.</p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8"
            onClick={(event) => {
              event.stopPropagation();
              if (!disabled) onEdit();
            }}
            disabled={disabled}
            title={disabledReason ?? undefined}
            aria-label={t("editProjectFor", { title: project.title })}
          >
            <SquarePenIcon className="size-3.5" />
            {t("editProject")}
          </Button>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild type="button" variant="outline" size="sm" className="h-8" onClick={(event) => event.stopPropagation()}>
              <Link href={observationsHref} aria-label={t("manageObservationsFor", { title: project.title })}>
                <BinocularsIcon className="size-3.5" />
                {t("manageObservations")}
              </Link>
            </Button>
            <Button asChild type="button" variant="outline" size="sm" className="h-8" onClick={(event) => event.stopPropagation()}>
              <Link href={galleryHref} aria-label={t("manageGalleryFor", { title: project.title })}>
                <ImageIcon className="size-3.5" />
                {t("manageGallery")}
              </Link>
            </Button>
            <Button asChild type="button" variant="outline" size="sm" className="h-8" onClick={(event) => event.stopPropagation()}>
              <Link href={sitesHref} aria-label={t("manageSitesFor", { title: project.title })}>
                <MapPinIcon className="size-3.5" />
                {t("manageSites")}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function ProjectCreateHero() {
  const t = useTranslations("marketplace.manageProjects.editor");
  return (
    <section className="relative mb-8 overflow-hidden rounded-[1.8rem] border border-border bg-card shadow-sm">
      <div className="relative min-h-[15rem] overflow-hidden rounded-[1.72rem] sm:min-h-[17rem]">
        <Image
          src="/assets/media/images/create-bumicert/hero-light@2x.webp"
          alt=""
          fill
          priority
          quality={95}
          sizes="(min-width: 1024px) 1100px, 100vw"
          className="object-cover object-center dark:hidden"
        />
        <Image
          src="/assets/media/images/create-bumicert/hero-dark@2x.webp"
          alt=""
          fill
          priority
          quality={95}
          sizes="(min-width: 1024px) 1100px, 100vw"
          className="hidden object-cover object-center dark:block"
        />
        <div className="absolute inset-0 bg-linear-to-r from-background/96 via-background/75 to-background/5 dark:from-background/93 dark:via-background/62 dark:to-background/10" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-foreground/15 via-foreground/5 to-transparent dark:from-black/65" />

        <div className="relative z-10 flex min-h-[15rem] max-w-[30rem] flex-col justify-center px-6 py-9 sm:min-h-[17rem] sm:px-9">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <SparklesIcon className="size-3.5" />
            {t("hero.eyebrow")}
          </div>
          <h2 className="font-instrument text-4xl font-medium italic leading-[0.95] tracking-[-0.03em] text-foreground sm:text-5xl">
            {t("hero.title")}
          </h2>
          <p className="mt-4 max-w-[24rem] text-base leading-7 text-muted-foreground">
            {t("hero.subtitle")}
          </p>
        </div>
      </div>
      <Image
        src="/assets/media/images/create-bumicert/plant-light.png"
        alt=""
        width={1002}
        height={1146}
        priority
        className="pointer-events-none absolute bottom-0 right-[3%] z-20 hidden h-[24rem] w-auto max-w-[48%] object-contain dark:hidden md:block"
      />
      <Image
        src="/assets/media/images/create-bumicert/plant-dark.png"
        alt=""
        width={964}
        height={1129}
        priority
        className="pointer-events-none absolute bottom-0 right-[3%] z-20 hidden h-[24rem] w-auto max-w-[48%] object-contain dark:md:block"
      />
    </section>
  );
}

export function CreateProjectModal({
  target,
  onClose,
  onSaved,
}: {
  target: ManageTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Non-dismissible: the wizard owns its own exits ("Back to My Projects",
  // success panel) so closing always routes through onClose/onSaved and the
  // list refreshes. The scroll container keeps the multi-step flow inside the
  // dialog on shorter viewports.
  return (
    <ModalContent dismissible={false} className="w-full">
      <div className="max-h-[82vh] overflow-y-auto px-0.5 pb-1">
        <ProjectEditor
          state={{ mode: "create", project: null }}
          target={target}
          onClose={onClose}
          onSaved={onSaved}
        />
      </div>
    </ModalContent>
  );
}

function ProjectEditor({
  state,
  target,
  onClose,
  onSaved,
  onDeleted,
}: {
  state: EditorState;
  target: ManageTarget;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("marketplace.manageProjects.editor");
  const workScopeT = useTranslations("common.workScopes");
  const workScopes = WORK_SCOPE_KEYS.map((key) => workScopeT(WORK_SCOPE_MESSAGE_KEYS[key]));

  const [draft, setDraft] = useState<ProjectCertDraft>(() => draftFromProject(state.project));
  const [contributorProfiles, setContributorProfiles] = useState<Record<string, ActorResult>>({});
  const [changedFields, setChangedFields] = useState<Set<ProjectField>>(() => new Set());
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedProjectUri, setSavedProjectUri] = useState<string | null>(state.project?.atUri ?? null);
  const [stepIndex, setStepIndex] = useState(0);

  // The cert (org.hypercerts.claim.activity) bound 1:1 to this project. Loaded
  // on edit so its rich fields can hydrate the form and be kept in sync.
  const [linkedCert, setLinkedCert] = useState<LinkedCert>(null);

  const [sites, setSites] = useState<ManagedLocation[]>([]);
  const [sitesStatus, setSitesStatus] = useState<SitesStatus>("idle");

  const modal = useModal();
  const isEdit = state.mode === "edit";
  const savePermission = isEdit ? canUpdateRecord(target) : canCreateRecord(target);
  const deletePermission = canDeleteRecord(target);
  const repoOptions = target.kind === "group" ? { repo: target.did } : undefined;
  const issues = getProjectIssues(draft);
  const visibleIssues = saveAttempted ? issues : issues.filter((issue) => changedFields.has(issue.field));
  const issuesByName = issuesByProjectField(visibleIssues);
  const coverUrl = coverRemoved ? null : (coverPreview ?? state.project?.imageUrl ?? null);
  const sitesHref = `${profileBasePath(target)}/sites`;

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const nextPreview = URL.createObjectURL(coverFile);
    setCoverPreview(nextPreview);
    return () => URL.revokeObjectURL(nextPreview);
  }, [coverFile]);

  // Load the steward's certified sites so they can be attached to the project.
  useEffect(() => {
    let active = true;
    setSitesStatus("loading");
    fetch(manageApiHref("/api/manage/sites", target), { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error("sites");
        if (!active) return;
        setSites(Array.isArray(json) ? json : []);
        setSitesStatus("ready");
      })
      .catch(() => {
        if (active) setSitesStatus("error");
      });
    return () => {
      active = false;
    };
  }, [target]);

  // On edit, fetch the linked cert and hydrate the rich fields (scope, dates,
  // contributors, places) that the project list endpoint doesn't carry.
  useEffect(() => {
    if (!isEdit) return;
    const firstCertUri = state.project.bumicertUris[0];
    if (!firstCertUri) return;
    let active = true;
    const certRkey = extractRkey(firstCertUri);
    getRecord(CERT_COLLECTION, certRkey, repoOptions)
      .then((result) => {
        if (!active) return;
        setLinkedCert({ rkey: result.rkey || certRkey, cid: result.cid ?? null, record: result.record });
        const hydrated = certToDraftFields(result.record);
        setDraft((current) => ({
          ...current,
          ...hydrated,
          // Prefer the cert's story when the project record didn't carry one.
          description: current.description || descriptionText(result.record.description),
        }));
      })
      .catch(() => {
        /* A project without a resolvable cert still edits fine; one is created on save. */
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, state.project?.atUri]);

  const markChanged = (field: ProjectField) => {
    setChangedFields((current) => new Set(current).add(field));
  };

  const updateDraft = (field: ProjectField, value: string) => {
    markChanged(field);
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const setContributorProfile = useCallback((identity: string, actor: ActorResult | null) => {
    setContributorProfiles((current) => {
      const next = { ...current };
      if (identity) delete next[identity];
      if (actor) {
        next[actor.did] = actor;
        if (actor.handle) next[actor.handle] = actor;
      }
      return next;
    });
  }, []);

  const resetDraft = () => {
    setDraft(draftFromProject(state.project));
    setChangedFields(new Set());
    setSaveAttempted(false);
    setCoverFile(null);
    setCoverRemoved(false);
    setError(null);
  };

  const resetWizard = () => {
    resetDraft();
    setStepIndex(0);
  };

  const handleCoverChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setCoverFile(file);
    setCoverRemoved(false);
    event.currentTarget.value = "";
  };

  const handleCoverRemove = () => {
    setCoverFile(null);
    setCoverRemoved(true);
  };

  // Create a place inline (draw a boundary), then attach it to this project —
  // mirrors Ma Earth's in-wizard location creation, using the free draw map.
  const openAddPlace = () => {
    modal.pushModal(
      {
        id: SiteEditorModalId,
        dialogWidth: "max-w-2xl",
        content: (
          <SiteEditorModal
            did={target.did}
            target={target}
            requireBoundary
            onSaved={(site) => {
              setSites((current) =>
                current.some((entry) => entry.metadata.uri === site.uri)
                  ? current
                  : [
                      {
                        metadata: { did: target.did, uri: site.uri, rkey: site.rkey, cid: site.cid, createdAt: new Date().toISOString() },
                        record: { name: site.name, description: null, locationType: null, location: null },
                      },
                      ...current,
                    ],
              );
              setDraft((current) =>
                current.selectedLocationUris.includes(site.uri)
                  ? current
                  : { ...current, selectedLocationUris: [...current.selectedLocationUris, site.uri] },
              );
            }}
          />
        ),
      },
      // No replaceAll: stack the place editor on top of the create wizard so
      // closing it returns to the wizard instead of dismissing everything.
    );
    void modal.show();
  };

  const handleDeleteProject = async () => {
    if (!isEdit) return;
    if (!deletePermission.allowed) {
      setError(deletePermission.reason ?? "You cannot delete this project.");
      return;
    }
    const project = state.project;
    const certRkey = linkedCert?.rkey ?? null;
    modal.pushModal(
      {
        id: `delete-project-${project.rkey}`,
        dialogWidth: "max-w-md",
        content: (
          <DeleteProjectModal
            projectTitle={project.title}
            onConfirm={async () => {
              await deleteRecord(PROJECT_COLLECTION, project.rkey, repoOptions);
              // Best-effort: remove the 1:1 cert alongside its project.
              if (certRkey) {
                await deleteRecord(CERT_COLLECTION, certRkey, repoOptions).catch(() => {});
              }
              onDeleted?.();
            }}
          />
        ),
      },
      true,
    );
    await modal.show();
  };

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setSaveAttempted(true);
    if (issues.length > 0) {
      setError(issues[0]?.message ?? t("errors.checkFields"));
      return;
    }
    if (!savePermission.allowed) {
      setError(savePermission.reason ?? t("errors.cannotSave"));
      return;
    }

    setSaving(true);
    setError(null);

    const siteRefs = resolveSiteRefs(
      draft.selectedLocationUris,
      sites.map((site) => ({ uri: site.metadata.uri, cid: site.metadata.cid })),
      extractLocationRefs(linkedCert?.record),
    );

    try {
      const cover = coverFile
        ? toLexImageBlob(await uploadBlob(coverFile, repoOptions), coverFile)
        : coverRemoved
          ? null
          : undefined;

      if (isEdit) {
        const project = state.project;
        // 1) Update (or create) the bound cert so it mirrors the project.
        let certRef: StrongRef | undefined;
        if (linkedCert) {
          const certRecord = buildCertRecord(draft, { existing: linkedCert.record, image: cover, siteRefs });
          const certResult = await putRecord(CERT_COLLECTION, linkedCert.rkey, certRecord, {
            ...(linkedCert.cid ? { swapRecord: linkedCert.cid } : {}),
            ...(repoOptions ?? {}),
          });
          certRef = { uri: certResult.uri, cid: certResult.cid };
        } else {
          const certRecord = buildCertRecord(draft, { image: cover, siteRefs });
          const certResult = await createRecord(CERT_COLLECTION, certRecord, undefined, repoOptions);
          certRef = { uri: certResult.uri, cid: certResult.cid };
        }
        // 2) Update the project, keeping the cert linked in items[].
        const projectRecord = buildProjectRecord(draft, {
          existing: project.rawRecord,
          banner: cover,
          certRef,
        });
        const result = await putRecord(PROJECT_COLLECTION, project.rkey, projectRecord, {
          ...(project.cid ? { swapRecord: project.cid } : {}),
          ...(repoOptions ?? {}),
        });
        setSavedProjectUri(result.uri);
      } else {
        // Create flow: cert first, then the project that links to it. If the
        // project write fails, roll the orphan cert back.
        const certRecord = buildCertRecord(draft, { image: cover, siteRefs });
        const certResult = await createRecord(CERT_COLLECTION, certRecord, undefined, repoOptions);
        const certRef: StrongRef = { uri: certResult.uri, cid: certResult.cid };
        try {
          const projectRecord = buildProjectRecord(draft, { banner: cover, certRef });
          const result = await createRecord(PROJECT_COLLECTION, projectRecord, undefined, repoOptions);
          setSavedProjectUri(result.uri);
        } catch (projectError) {
          await deleteRecord(CERT_COLLECTION, extractRkey(certResult.uri), repoOptions).catch(() => {});
          throw projectError;
        }
      }
      setShowSuccess(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (showSuccess) {
    return (
      <ProjectSuccessPanel
        onBack={onSaved}
        projectTitle={draft.title.trim()}
        projectUri={savedProjectUri}
        isEdit={isEdit}
      />
    );
  }

  // ── CREATE: Ma Earth-style step wizard, one focused screen at a time ──
  if (!isEdit) {
    const stepId: WizardStepId = WIZARD_STEPS[stepIndex];
    const lastIndex = WIZARD_STEPS.length - 1;
    const progress = (stepIndex / lastIndex) * 100;
    const basicsValid = draft.title.trim().length >= 3;
    const goNext = () => setStepIndex((index) => Math.min(index + 1, lastIndex));
    const goPrev = () => setStepIndex((index) => Math.max(index - 1, 0));

    return (
      <div className="relative w-full">
        <div className="mb-5 flex items-center justify-between gap-3">
          {stepIndex > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetWizard} className="-ml-2 text-muted-foreground" disabled={saving}>
              <RotateCcwIcon className="size-4" /> {t("startOver")}
            </Button>
          ) : <span />}
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("close")} className="text-muted-foreground" disabled={saving}>
            <XIcon className="size-5" />
          </Button>
        </div>

        <div className="mb-9 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          />
        </div>

        <div className="min-h-[24rem]">
          <AnimatePresence mode="wait">
            <motion.div
              key={stepId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {stepId === "intro" ? (
                <ProjectCreateHero />
              ) : stepId === "basics" ? (
                <div className="mx-auto max-w-2xl">
                  <WizardStepHeader title={t("steps.basics.title")} subtitle={t("steps.basics.subtitle")} />
                  <BasicsFields draft={draft} onChange={updateDraft} issuesByName={issuesByName} t={t} />
                </div>
              ) : stepId === "focus" ? (
                <div className="mx-auto max-w-2xl">
                  <WizardStepHeader title={t("steps.focus.title")} subtitle={t("steps.focus.subtitle")} />
                  <ScopeSection draft={draft} setDraft={setDraft} workScopes={workScopes} t={t} />
                </div>
              ) : stepId === "timeline" ? (
                <div className="mx-auto max-w-2xl">
                  <WizardStepHeader title={t("steps.timeline.title")} subtitle={t("steps.timeline.subtitle")} />
                  <DatesSection draft={draft} setDraft={setDraft} t={t} />
                </div>
              ) : stepId === "story" ? (
                <div className="mx-auto max-w-2xl">
                  <WizardStepHeader title={t("steps.story.title")} subtitle={t("steps.story.subtitle")} />
                  <StoryField draft={draft} onChange={updateDraft} t={t} />
                </div>
              ) : stepId === "network" ? (
                <div className="mx-auto max-w-2xl space-y-8">
                  <WizardStepHeader title={t("steps.network.title")} subtitle={t("steps.network.subtitle")} />
                  <ContributorsSection draft={draft} setDraft={setDraft} contributorProfiles={contributorProfiles} setContributorProfile={setContributorProfile} t={t} />
                  <SitesSection draft={draft} setDraft={setDraft} sites={sites} sitesStatus={sitesStatus} sitesHref={sitesHref} onAddPlace={openAddPlace} t={t} />
                </div>
              ) : stepId === "photo" ? (
                <div className="mx-auto max-w-md">
                  <WizardStepHeader title={t("steps.photo.title")} subtitle={t("steps.photo.subtitle")} />
                  <PhotoPanel coverUrl={coverUrl} onChange={handleCoverChange} onRemove={handleCoverRemove} t={t} />
                </div>
              ) : (
                <div className="mx-auto max-w-2xl">
                  <WizardStepHeader title={t("steps.review.title")} subtitle={t("steps.review.subtitle")} />
                  <ReviewList draft={draft} contributorProfiles={contributorProfiles} hasCover={Boolean(coverUrl)} t={t} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {error ? (
          <p className={cn(ERROR_MESSAGE, "mx-auto mt-8 max-w-2xl")}>
            <TriangleAlertIcon className="size-3.5 text-warn" /> {error}
          </p>
        ) : null}

        <div className="mt-10 flex items-center justify-between gap-3 border-t border-border/60 pt-6">
          {stepIndex > 0 ? (
            <Button type="button" variant="secondary" size="lg" onClick={goPrev} disabled={saving}>
              <ChevronLeftIcon className="size-4" /> {t("wizard.back")}
            </Button>
          ) : <span />}
          {stepId === "review" ? (
            <Button type="button" size="lg" onClick={() => void handleSubmit()} disabled={saving || !savePermission.allowed} title={savePermission.reason ?? undefined}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : <FolderKanbanIcon className="size-4" />}
              {saving ? t("saving") : t("wizard.create")}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={goNext} disabled={stepId === "basics" && !basicsValid}>
              {stepIndex === 0 ? t("wizard.start") : t("wizard.next")}
              <ChevronRightIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── EDIT: single-page form ──
  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      onSubmit={handleSubmit}
      className="relative w-full"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="-ml-2 text-muted-foreground" disabled={saving}>
          <ChevronLeftIcon className="size-4" /> {t("backToProjects")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={resetDraft} className="text-muted-foreground" disabled={saving}>
          <RotateCcwIcon className="size-4" /> {t("startOver")}
        </Button>
      </div>

      <div className="grid gap-x-14 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          <section>
            <SectionHeader title={t("editTitle")} />
            <div className="space-y-8">
              <BasicsFields draft={draft} onChange={updateDraft} issuesByName={issuesByName} t={t} />
              <StoryField draft={draft} onChange={updateDraft} t={t} />
            </div>
          </section>

          <section className="space-y-8">
            <ScopeSection draft={draft} setDraft={setDraft} workScopes={workScopes} t={t} />
            <DatesSection draft={draft} setDraft={setDraft} t={t} />
          </section>

          <ContributorsSection draft={draft} setDraft={setDraft} contributorProfiles={contributorProfiles} setContributorProfile={setContributorProfile} t={t} />

          <SitesSection
            draft={draft}
            setDraft={setDraft}
            sites={sites}
            sitesStatus={sitesStatus}
            sitesHref={sitesHref}
            onAddPlace={openAddPlace}
            t={t}
          />
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <PhotoPanel coverUrl={coverUrl} onChange={handleCoverChange} onRemove={handleCoverRemove} t={t} />
        </aside>
      </div>

      {error ? (
        <p className={cn(ERROR_MESSAGE, "mt-10")}>
          <TriangleAlertIcon className="size-3.5 text-warn" /> {error}
        </p>
      ) : null}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="destructive" size="lg" onClick={() => void handleDeleteProject()} disabled={saving || !deletePermission.allowed} title={deletePermission.reason ?? undefined}>
          <Trash2Icon className="size-4" />
          {t("delete")}
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button type="submit" size="lg" disabled={saving || !savePermission.allowed} title={savePermission.reason ?? undefined}>
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : <FolderKanbanIcon className="size-4" />}
            {saving ? t("saving") : t("saveChanges")}
          </Button>
        </div>
      </div>
    </motion.form>
  );
}

function ScopeSection({
  draft,
  setDraft,
  workScopes,
  t,
}: {
  draft: ProjectCertDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProjectCertDraft>>;
  workScopes: string[];
  t: ReturnType<typeof useTranslations>;
}) {
  const toggleScope = (scope: string) => {
    setDraft((current) => ({
      ...current,
      scopes: current.scopes.includes(scope) ? current.scopes.filter((item) => item !== scope) : [...current.scopes, scope],
    }));
  };

  return (
    <Field label={t("fields.scope.label")} hint={t("fields.scope.hint")}>
      <div className="flex flex-wrap gap-2">
        {workScopes.map((scope) => {
          const active = draft.scopes.includes(scope);
          return (
            <button
              key={scope}
              type="button"
              onClick={() => toggleScope(scope)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background/70 text-foreground/75 hover:border-primary/35 hover:text-foreground",
              )}
            >
              {scope}
            </button>
          );
        })}
      </div>
      <input
        value={draft.customScope}
        onChange={(event) => setDraft((current) => ({ ...current, customScope: event.target.value }))}
        placeholder={t("fields.scope.customPlaceholder")}
        className={cn(FIELD, "mt-3 px-4 py-2.5 text-sm")}
      />
    </Field>
  );
}

function DatesSection({
  draft,
  setDraft,
  t,
}: {
  draft: ProjectCertDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProjectCertDraft>>;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fields.startDate.label")} htmlFor="project-start">
          <div className="relative">
            <CalendarDaysIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="project-start"
              type="date"
              value={draft.startDate}
              onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
              className={cn(FIELD, "h-11 pl-9 pr-3")}
            />
          </div>
        </Field>
        <Field label={t("fields.endDate.label")} htmlFor="project-end">
          <div className="space-y-3">
            <div className="relative">
              <CalendarDaysIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="project-end"
                type="date"
                value={draft.endDate}
                disabled={draft.ongoing}
                onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
                className={cn(FIELD, "h-11 pl-9 pr-3 disabled:opacity-40")}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={draft.ongoing}
                onChange={(event) => setDraft((current) => ({ ...current, ongoing: event.target.checked, endDate: event.target.checked ? "" : current.endDate }))}
                className="size-4 rounded border-border accent-primary"
              />
              {t("fields.endDate.ongoing")}
            </label>
          </div>
        </Field>
    </div>
  );
}

function actorLabel(actor: ActorResult, fallback: string) {
  return actor.displayName ?? actor.handle ?? fallback;
}

function displayContributor(identity: string, profiles: Record<string, ActorResult>, fallback: string) {
  const actor = profiles[identity];
  if (actor) return actorLabel(actor, fallback);
  return identity.startsWith("did:") ? fallback : identity;
}

function ActorAvatar({ actor, fallback, size = "size-8" }: { actor: ActorResult; fallback: string; size?: string }) {
  return actor.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={actor.avatar} alt="" className={cn(size, "shrink-0 rounded-full object-cover")} />
  ) : (
    <span className={cn(size, "flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary")}>
      {actorLabel(actor, fallback).charAt(0).toUpperCase()}
    </span>
  );
}

function ContributorInput({
  value,
  actor,
  onChange,
  onActorChange,
  onRemove,
  canRemove,
  placeholder,
  t,
}: {
  value: string;
  actor: ActorResult | null;
  onChange: (value: string) => void;
  onActorChange: (actor: ActorResult | null) => void;
  onRemove: () => void;
  canRemove: boolean;
  placeholder: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [results, setResults] = useState<ActorResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const selectedProfileFallback = t("fields.people.selectedProfile");

  useEffect(() => {
    const query = value.trim();
    if (!focused || actor) return;
    setOpen(true);
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/actors/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data: { results?: ActorResult[] }) => {
          setResults(data.results ?? []);
          setHighlight(0);
          setOpen(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [actor, focused, value]);

  useEffect(() => {
    if (actor || !value.trim()) return;
    const query = value.trim();
    if (query.length < 3) return;
    const controller = new AbortController();
    fetch(`/api/actors/resolve?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { actor?: ActorResult | null }) => {
        if (data.actor) onActorChange(data.actor);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [actor, onActorChange, value]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const choose = (nextActor: ActorResult) => {
    onActorChange(nextActor);
    onChange(nextActor.did);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={boxRef} className="relative flex items-center gap-2">
      <div className="relative flex-1">
        {actor ? (
          <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <ActorAvatar actor={actor} fallback={selectedProfileFallback} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{actorLabel(actor, selectedProfileFallback)}</span>
              {actor.handle ? <span className="block truncate text-xs text-muted-foreground">@{actor.handle}</span> : null}
            </span>
            <button
              type="button"
              onClick={() => {
                onActorChange(null);
                onChange("");
              }}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("fields.people.change")}
            >
              <XIcon className="size-4" />
            </button>
          </div>
        ) : (
          <input
            value={value}
            onChange={(event) => {
              onActorChange(null);
              onChange(event.target.value);
            }}
            onFocus={() => {
              setFocused(true);
              setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (!open || results.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlight((current) => Math.min(current + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(results[highlight]);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            className={cn(FIELD, "px-4 py-2.5 text-sm")}
          />
        )}

        {loading && !actor ? <Loader2Icon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground/60" /> : null}

        <AnimatePresence>
          {open && !actor ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.14 }}
              className="absolute z-[1000] mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              {value.trim().length < 2 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">{t("fields.people.suggestionsStart")}</p>
              ) : loading ? (
                <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" /> {t("fields.people.suggestionsLoading")}</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">{t("fields.people.suggestionsEmpty")}</p>
              ) : (
                <ul>
                  {results.map((nextActor, index) => (
                    <li key={nextActor.did}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(nextActor)}
                        onMouseEnter={() => setHighlight(index)}
                        className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors", index === highlight ? "bg-muted" : "hover:bg-muted/60")}
                      >
                        <ActorAvatar actor={nextActor} fallback={selectedProfileFallback} size="size-7" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">{actorLabel(nextActor, selectedProfileFallback)}</span>
                          {nextActor.handle ? <span className="block truncate text-xs text-muted-foreground">@{nextActor.handle}</span> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <Button type="button" variant="ghost" size="icon-sm" disabled={!canRemove} onClick={onRemove} aria-label={t("fields.people.remove")} className="shrink-0 text-muted-foreground hover:text-destructive">
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}

function ContributorsSection({
  draft,
  setDraft,
  contributorProfiles,
  setContributorProfile,
  t,
}: {
  draft: ProjectCertDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProjectCertDraft>>;
  contributorProfiles: Record<string, ActorResult>;
  setContributorProfile: (identity: string, actor: ActorResult | null) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const updateContributor = (index: number, value: string) => {
    setDraft((current) => ({
      ...current,
      contributors: current.contributors.map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  };
  const removeContributor = (index: number) => {
    setDraft((current) => ({
      ...current,
      contributors: current.contributors.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  return (
    <section>
      <Field label={t("fields.people.label")} hint={t("fields.people.hint")}>
        <div className="space-y-2.5">
          {draft.contributors.map((contributor, index) => (
            <ContributorInput
              key={index}
              value={contributor}
              actor={contributorProfiles[contributor] ?? null}
              onChange={(value) => updateContributor(index, value)}
              onActorChange={(actor) => setContributorProfile(contributor, actor)}
              onRemove={() => removeContributor(index)}
              canRemove={draft.contributors.length > 1}
              placeholder={index === 0 ? t("fields.people.placeholderFirst") : t("fields.people.placeholder")}
              t={t}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDraft((current) => ({ ...current, contributors: [...current.contributors, ""] }))}
          className="mt-2 -ml-2 text-primary hover:text-primary"
        >
          <PlusIcon className="size-4" /> {t("fields.people.add")}
        </Button>
      </Field>
    </section>
  );
}

function SitesSection({
  draft,
  setDraft,
  sites,
  sitesStatus,
  sitesHref,
  onAddPlace,
  t,
}: {
  draft: ProjectCertDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProjectCertDraft>>;
  sites: ManagedLocation[];
  sitesStatus: SitesStatus;
  sitesHref: string;
  onAddPlace: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const toggleLocation = (uri: string) => {
    setDraft((current) => ({
      ...current,
      selectedLocationUris: current.selectedLocationUris.includes(uri)
        ? current.selectedLocationUris.filter((item) => item !== uri)
        : [...current.selectedLocationUris, uri],
    }));
  };

  return (
    <section>
      <Field label={t("fields.sites.label")} hint={t("fields.sites.hint")}>
        <div className="rounded-2xl border border-border bg-background/70 p-3">
          {sitesStatus === "loading" ? (
            <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> {t("fields.sites.loading")}
            </div>
          ) : sitesStatus === "error" ? (
            <div className="p-4 text-sm text-muted-foreground">{t("fields.sites.error")}</div>
          ) : sites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-5 text-sm leading-6 text-muted-foreground">
              {t("fields.sites.empty")}
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {sites.map((site) => {
                const active = draft.selectedLocationUris.includes(site.metadata.uri);
                return (
                  <button
                    type="button"
                    key={site.metadata.uri}
                    onClick={() => toggleLocation(site.metadata.uri)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                      active ? "border-primary/40 bg-primary/[0.08]" : "border-border bg-card hover:border-primary/25",
                    )}
                  >
                    <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <MapPinIcon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{site.record.name || t("fields.sites.unnamed")}</span>
                      <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {site.record.description || site.record.locationType || t("fields.sites.fallback")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="button" variant="outline" size="sm" onClick={onAddPlace}>
            <MapPinPlusIcon className="size-4" /> {t("fields.sites.add")}
          </Button>
          <Link href={sitesHref} className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline">
            {t("fields.sites.manage")}
          </Link>
        </div>
      </Field>
    </section>
  );
}

function ProjectSuccessPanel({
  onBack,
  projectTitle,
  projectUri,
  isEdit,
}: {
  onBack: () => void;
  projectTitle: string;
  projectUri: string | null;
  isEdit: boolean;
}) {
  const t = useTranslations("marketplace.manageProjects.editor.success");
  const projectHref = projectHrefFromUri(projectUri);
  const modal = useModal();

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative w-full"
      role="status"
      aria-live="polite"
    >
      <div className="relative flex min-h-[26rem] overflow-hidden rounded-[2rem] bg-primary/[0.04] px-6 py-12 sm:px-10">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="absolute left-4 top-4 z-20 text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon className="size-4" />
          {t("back")}
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
            {isEdit ? t("titleEdit") : t("titleCreate")}
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.22 }}
            className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground"
          >
            {projectTitle ? t("descriptionNamed", { title: projectTitle }) : t("description")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.3 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            {projectHref ? (
              <Button asChild size="lg">
                {/* Close the popup as we navigate so it doesn't linger over the
                    project page (no-op when the success panel is shown inline
                    for an edit). */}
                <Link href={projectHref} onClick={() => void modal.hide().then(() => modal.clear())}>
                  {t("view")}
                  <ChevronRightIcon className="size-4" />
                </Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="lg" onClick={onBack}>
              {t("back")}
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function BasicsFields({
  draft,
  onChange,
  issuesByName,
  t,
}: {
  draft: ProjectCertDraft;
  onChange: (field: ProjectField, value: string) => void;
  issuesByName: Partial<Record<ProjectField, ProjectIssue>>;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-8">
      <Field label={t("fields.name.label")} hint={t("fields.name.hint")} htmlFor="project-title" error={issuesByName.title?.message}>
        <input
          id="project-title"
          value={draft.title}
          maxLength={TITLE_MAX}
          onChange={(event) => onChange("title", event.target.value)}
          placeholder={t("fields.name.placeholder")}
          className={cn(FIELD, "px-4 py-3 font-instrument text-2xl italic tracking-[-0.01em]", issuesByName.title && FIELD_ERROR)}
        />
        <div className="mt-1.5 text-right text-xs text-muted-foreground">{draft.title.length} / {TITLE_MAX}</div>
      </Field>

      <Field label={t("fields.summary.label")} hint={t("fields.summary.hint")} htmlFor="project-summary" error={issuesByName.shortDescription?.message}>
        <textarea
          id="project-summary"
          value={draft.shortDescription}
          onChange={(event) => onChange("shortDescription", event.target.value.slice(0, 300))}
          placeholder={t("fields.summary.placeholder")}
          className={cn(FIELD, "min-h-24 resize-y px-4 py-3 text-[15px] leading-7", issuesByName.shortDescription && FIELD_ERROR)}
        />
        <div className="mt-1.5 text-right text-xs text-muted-foreground">{clampSummary(draft.shortDescription).length} / 300</div>
      </Field>
    </div>
  );
}

function StoryField({
  draft,
  onChange,
  t,
}: {
  draft: ProjectCertDraft;
  onChange: (field: ProjectField, value: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Field label={t("fields.story.label")} hint={t("fields.story.hint")} htmlFor="project-story">
      <textarea
        id="project-story"
        value={draft.description}
        onChange={(event) => onChange("description", event.target.value)}
        placeholder={t("fields.story.placeholder")}
        className={cn(FIELD, "min-h-48 resize-y px-4 py-3 text-[15px] leading-7")}
      />
    </Field>
  );
}

function WizardStepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h3 className="font-instrument text-3xl italic leading-[1.05] tracking-[-0.01em] text-foreground sm:text-4xl">{title}</h3>
      {subtitle ? <p className="mt-2.5 max-w-xl text-sm leading-6 text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function ReviewList({
  draft,
  contributorProfiles,
  hasCover,
  t,
}: {
  draft: ProjectCertDraft;
  contributorProfiles: Record<string, ActorResult>;
  hasCover: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const focus = scopeList(draft);
  const people = contributorList(draft).map((identity) => displayContributor(identity, contributorProfiles, t("fields.people.selectedProfile")));
  const placeCount = draft.selectedLocationUris.length;
  const timeline = draft.startDate
    ? `${draft.startDate} → ${draft.ongoing ? t("review.ongoing") : draft.endDate || "—"}`
    : t("review.none");
  const rows: Array<[string, string]> = [
    [t("review.name"), draft.title.trim() || "—"],
    [t("review.summary"), clampSummary(draft.shortDescription) || t("review.none")],
    [t("review.focus"), focus.length ? focus.join(", ") : t("review.none")],
    [t("review.timeline"), timeline],
    [t("review.people"), people.length ? people.join(", ") : t("review.none")],
    [t("review.places"), placeCount > 0 ? String(placeCount) : t("review.none")],
    [t("review.photo"), hasCover ? t("review.added") : t("review.notAdded")],
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
      {rows.map(([label, value], index) => (
        <div
          key={label}
          className={cn(
            "grid gap-1 px-4 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3",
            index !== rows.length - 1 && "border-b border-border/60",
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="text-sm leading-6 text-foreground">{value}</p>
        </div>
      ))}
    </div>
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

function PhotoPanel({
  coverUrl,
  onChange,
  onRemove,
  t,
}: {
  coverUrl: string | null;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="rounded-3xl bg-background p-4">
      <label htmlFor="project-image" className="block text-sm font-medium text-foreground">
        {t("fields.photo.label")} <span className="font-normal text-muted-foreground">{t("fields.photo.optional")}</span>
      </label>
      <label
        htmlFor="project-image"
        className="mt-3 block cursor-pointer overflow-hidden rounded-2xl border border-dashed border-border bg-muted/35 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
      >
        <div className="relative aspect-[4/3]">
          {coverUrl ? (
            <>
              <Image src={coverUrl} alt="" fill unoptimized sizes="320px" className="object-cover" />
              <span className="absolute inset-x-4 bottom-4 rounded-full bg-background/90 px-3 py-2 text-center text-sm font-medium text-foreground shadow-sm backdrop-blur">
                {t("fields.photo.change")}
              </span>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <ImageIcon className="mb-3 size-8 text-primary/70" />
              <span className="font-instrument text-2xl italic text-foreground">{t("fields.photo.cta")}</span>
              <span className="mt-1 text-xs leading-5">{t("fields.photo.formats")}</span>
            </div>
          )}
        </div>
      </label>
      {coverUrl ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <label htmlFor="project-image" className="cursor-pointer">{t("fields.photo.change")}</label>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <XIcon className="size-3.5" />
            {t("fields.photo.remove")}
          </Button>
        </div>
      ) : null}
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
  const t = useTranslations("marketplace.manageProjects.editor.deleteModal");
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
      setError(deleteProjectError instanceof Error ? deleteProjectError.message : t("error"));
      setPending(false);
    }
  };

  return (
    <ModalContent dismissible={!pending} className="space-y-4">
      <ModalHeader>
        <ModalTitle>{t("title")}</ModalTitle>
        <ModalDescription>{t("description", { title: projectTitle })}</ModalDescription>
      </ModalHeader>
      {error ? (
        <p className={ERROR_MESSAGE}>
          <TriangleAlertIcon className="size-3.5 text-warn" /> {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void close()}>{t("cancel")}</Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => void confirm()}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
          {t("confirm")}
        </Button>
      </ModalFooter>
    </ModalContent>
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

function ProjectCreateHeroCard({
  onCreate,
  disabled,
  disabledReason,
}: {
  onCreate: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const t = useTranslations("marketplace.manageProjects.emptyHero");
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative overflow-visible rounded-[1.6rem] border border-border/80 bg-card shadow-sm"
    >
      <div className="relative min-h-[6rem] overflow-hidden rounded-[1.55rem]">
        <Image
          src="/assets/media/images/create-bumicert/hero-light@2x.webp"
          alt=""
          fill
          priority
          quality={95}
          sizes="100vw"
          className="object-cover object-center dark:hidden"
        />
        <Image
          src="/assets/media/images/create-bumicert/hero-dark@2x.webp"
          alt=""
          fill
          priority
          quality={95}
          sizes="100vw"
          className="hidden object-cover object-center dark:block"
        />
        <div className="absolute inset-0 bg-linear-to-r from-background/95 via-background/72 to-background/5 dark:from-background/90 dark:via-background/58 dark:to-background/10" />
        <div className="absolute -top-8 right-[7%] h-28 w-52 rounded-full bg-background/50 blur-2xl dark:bg-primary/10" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-foreground/20 via-foreground/5 to-transparent dark:from-black/55" />

        <div className="relative z-30 flex min-h-[6rem] flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 lg:px-9">
          <p className="w-full text-sm leading-5 text-muted-foreground sm:max-w-[30rem]">
            {t("description")}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onCreate}
            disabled={disabled}
            title={disabledReason ?? undefined}
            className="shrink-0 self-start sm:self-auto"
          >
            <CirclePlusIcon />
            {t("cta")}
          </Button>
        </div>
      </div>
      <Image
        src="/assets/media/images/create-bumicert/plant-light.png"
        alt=""
        width={1002}
        height={1146}
        priority
        className="pointer-events-none absolute bottom-0 right-[4%] z-20 hidden h-[9rem] w-auto max-w-[50%] object-contain dark:hidden md:block"
      />
      <Image
        src="/assets/media/images/create-bumicert/plant-dark.png"
        alt=""
        width={964}
        height={1129}
        priority
        className="pointer-events-none absolute bottom-0 right-[4%] z-20 hidden h-[9rem] w-auto max-w-[50%] object-contain dark:md:block"
      />
    </motion.section>
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

function getProjectIssues(draft: ProjectCertDraft): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  if (draft.title.trim().length < 3) issues.push({ field: "title", message: "Add a project name with at least 3 characters." });
  return issues;
}

function issuesByProjectField(issues: ProjectIssue[]): Partial<Record<ProjectField, ProjectIssue>> {
  return Object.fromEntries(issues.map((issue) => [issue.field, issue])) as Partial<Record<ProjectField, ProjectIssue>>;
}

function draftFromProject(project: ManagedProject | null): ProjectCertDraft {
  if (!project) return { ...emptyProjectCertDraft };
  return {
    ...emptyProjectCertDraft,
    title: project.title,
    shortDescription: project.shortDescription ?? "",
    description: descriptionText(project.rawRecord?.description),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toLexImageBlob(uploaded: UploadedBlobLike, file: File): Record<string, unknown> {
  const raw = isRecord(uploaded.blob) && !("ref" in uploaded) ? uploaded.blob : uploaded;
  if (!isRecord(raw) || !("ref" in raw) || raw.ref === undefined || raw.ref === null) {
    throw new Error("We could not upload this photo. Please try again.");
  }
  return {
    $type: "blob",
    ref: raw.ref,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : (file.type || "application/octet-stream"),
    size: typeof raw.size === "number" ? raw.size : file.size,
  };
}

function projectHrefFromUri(uri: string | null): string | null {
  if (!uri) return null;
  const match = uri.match(/^at:\/\/([^/]+)\/org\.hypercerts\.collection\/([^/]+)$/);
  if (!match?.[1] || !match[2]) return null;
  return localProjectHref(match[1], match[2]);
}
