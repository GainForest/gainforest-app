"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowUpRightIcon,
  BinocularsIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CirclePlusIcon,
  DatabaseIcon,
  FolderKanbanIcon,
  Loader2Icon,
  MicIcon,
  SearchIcon,
  SproutIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { PictureHero } from "./PictureHero";
import { PdsVisual } from "./PdsVisual";
import { Confetti } from "./Confetti";
import { redirectToLogin } from "../_lib/auth-client";
import {
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
} from "../_lib/account-switcher";
import { createFeedPost } from "../(manage)/manage/_lib/mutations";
import { REWILDING_GRANT_TAG } from "../_lib/grants";
import { Button, buttonVariants } from "@/components/ui/button";
import { ModalContent, ModalDescription, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { groupManageBasePath, manageApiHref, manageHref } from "@/lib/links";
import { cn } from "@/lib/utils";

// Round 3 applications closed May 31, 2026; the round itself is live, so we
// point visitors at the participating projects instead of the apply page.
const MA_EARTH_ROUND_PROJECTS_URL = "https://maearth.com/projects";
const MA_EARTH_LOGO_SRC = "/assets/media/images/badges/ma-earth-logo.webp";
// Keep the application post comfortably under the feed post limit even when a
// project title is long.
const POST_PROJECT_TITLE_MAX = 160;

type GrantProject = {
  rkey: string;
  did: string;
  title: string;
  shortDescription: string | null;
  imageUrl: string | null;
};

type ApiProject = {
  rkey?: unknown;
  did?: unknown;
  title?: unknown;
  shortDescription?: unknown;
  imageUrl?: unknown;
};

/** The account the viewer is currently acting as (personal or a managed org).
 *  Applications are posted from this account and the project picker lists this
 *  account's projects. */
type ActingAccount = {
  /** Group DID when acting as an organization; undefined for the personal repo. */
  repo: string | undefined;
  /** Target for the manage projects API (null when signed out). */
  apiTarget: { kind: "personal" | "group"; did: string } | null;
  /** Base manage route for "create a project" links. */
  projectsBasePath: string;
};

function useActingAccount(sessionDid: string | null): ActingAccount {
  const { groups } = useAccountList(sessionDid);
  const [activeContext] = useActiveAccountContext(sessionDid ?? "");

  if (!sessionDid) {
    return { repo: undefined, apiTarget: null, projectsBasePath: "/manage" };
  }
  if (activeContext.type === "group" && activeContext.did) {
    const group = groups.find((entry) => entry.groupDid === activeContext.did) ?? null;
    const identifier = group
      ? switcherGroupIdentifier(group)
      : activeContext.identifier?.trim() || activeContext.did;
    return {
      repo: activeContext.did,
      apiTarget: { kind: "group", did: activeContext.did },
      projectsBasePath: groupManageBasePath(identifier),
    };
  }
  return {
    repo: undefined,
    apiTarget: { kind: "personal", did: sessionDid },
    projectsBasePath: "/manage",
  };
}

function toGrantProject(raw: ApiProject, fallbackTitle: string): GrantProject | null {
  if (typeof raw.rkey !== "string" || typeof raw.did !== "string") return null;
  return {
    rkey: raw.rkey,
    did: raw.did,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : fallbackTitle,
    shortDescription: typeof raw.shortDescription === "string" ? raw.shortDescription : null,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
  };
}

export function GrantsClient({ viewerDid, signedIn }: { viewerDid: string | null; signedIn: boolean }) {
  const heroT = useTranslations("marketplace.grants.hero");

  return (
    <section className="-mt-14 bg-background pb-20 md:pb-28">
      <PictureHero
        lightSrc="/assets/media/images/donations/donations-hero-light@2x.webp"
        darkSrc="/assets/media/images/donations/donations-hero-dark@2x.webp"
        imageAlt={heroT("imageAlt")}
        eyebrow={heroT("eyebrow")}
        icon={<SproutIcon />}
        title={heroT("title")}
        accent={heroT("accent")}
        lede={heroT("lede")}
      />

      <div className="relative z-10 mx-auto max-w-5xl space-y-8 px-6 pt-10">
        <RewildingSection viewerDid={viewerDid} signedIn={signedIn} />
        <InteroperableSection />
      </div>
    </section>
  );
}

// ── Rewilding the Web: apply with one of your projects ───────────────────────

function RewildingSection({ viewerDid, signedIn }: { viewerDid: string | null; signedIn: boolean }) {
  const t = useTranslations("marketplace.grants.rewilding");
  const acting = useActingAccount(viewerDid);
  const modal = useModal();
  const [appliedProjectTitle, setAppliedProjectTitle] = useState<string | null>(null);

  const closeModal = useCallback(() => {
    void modal.hide().then(() => modal.clear());
  }, [modal]);

  const openApply = useCallback(() => {
    if (!signedIn) {
      redirectToLogin();
      return;
    }
    modal.pushModal(
      {
        id: "rewilding-apply",
        dialogWidth: "max-w-lg w-[calc(100%-2rem)]",
        content: (
          <RewildingApplyModal
            acting={acting}
            onClose={closeModal}
            onApplied={(title) => {
              setAppliedProjectTitle(title);
              modal.pushModal(
                {
                  id: "rewilding-applied",
                  dialogWidth: "max-w-md w-[calc(100%-2rem)]",
                  content: <RewildingSuccessModal projectTitle={title} onClose={closeModal} />,
                },
                true,
              );
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [acting, closeModal, modal, signedIn]);

  const kits: { id: "audiomoths" | "tools"; Icon: typeof MicIcon }[] = [
    { id: "audiomoths", Icon: MicIcon },
    { id: "tools", Icon: BinocularsIcon },
  ];

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="border-b border-border/60 bg-primary/5 px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <SproutIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-instrument text-2xl font-light italic tracking-[-0.02em] text-foreground sm:text-3xl">
              {t("title")}
            </h2>
            <span className="mt-1 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {t("slots")}
              </span>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {t("amount")}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div className="min-w-0">
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground">{t("description")}</p>

            <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-muted/40 px-4 py-3">
              <DatabaseIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm leading-6 text-muted-foreground">{t("support")}</p>
            </div>

            {appliedProjectTitle ? (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-4">
                <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("appliedTitle")}</p>
                  <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                    {t("appliedNote", { project: appliedProjectTitle })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <Button type="button" size="lg" onClick={openApply}>
                  <SproutIcon />
                  {t("apply")}
                </Button>
              </div>
            )}
          </div>

          <PdsVisual
            className="mx-auto w-full max-w-md lg:max-w-none"
            labels={{
              aria: t("server.aria"),
              caption: t("server.caption"),
            }}
          />
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {kits.map((kit) => (
            <div key={kit.id} className="flex gap-3 rounded-2xl border border-border/70 bg-background/60 p-4">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <kit.Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t(`kits.${kit.id}.title`)}</p>
                <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{t(`kits.${kit.id}.description`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function RewildingApplyModal({
  acting,
  onApplied,
  onClose,
}: {
  acting: ActingAccount;
  onApplied: (projectTitle: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("marketplace.grants.applyModal");
  const rewildingT = useTranslations("marketplace.grants.rewilding");
  const [projects, setProjects] = useState<GrantProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submittingRkey, setSubmittingRkey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setProjects(null);
    try {
      const response = await fetch(manageApiHref("/api/manage/projects", acting.apiTarget), { cache: "no-store" });
      const data = (await response.json()) as ApiProject[] | { error?: string };
      if (!response.ok || !Array.isArray(data)) {
        setError(!Array.isArray(data) && data.error ? data.error : t("errorTitle"));
        setProjects([]);
        return;
      }
      setProjects(
        data
          .map((raw) => toGrantProject(raw, t("untitledProject")))
          .filter((project): project is GrantProject => Boolean(project)),
      );
    } catch {
      setError(t("errorTitle"));
      setProjects([]);
    }
  }, [acting.apiTarget, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const createProjectHref = manageHref({ basePath: acting.projectsBasePath }, "projects", { mode: "new" });

  const filtered = useMemo(() => {
    if (!projects) return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) =>
      `${project.title} ${project.shortDescription ?? ""}`.toLowerCase().includes(normalized),
    );
  }, [projects, query]);

  const apply = useCallback(
    async (project: GrantProject) => {
      setSubmittingRkey(project.rkey);
      setSubmitError(null);
      try {
        const title = project.title.length > POST_PROJECT_TITLE_MAX
          ? `${project.title.slice(0, POST_PROJECT_TITLE_MAX - 1).trimEnd()}…`
          : project.title;
        await createFeedPost(
          { text: rewildingT("postText", { project: title }), tags: [REWILDING_GRANT_TAG] },
          acting.repo ? { repo: acting.repo } : undefined,
        );
        onApplied(project.title);
      } catch {
        setSubmitError(t("submitError"));
        setSubmittingRkey(null);
      }
    },
    [acting.repo, onApplied, rewildingT, t],
  );

  return (
    <ModalContent className="w-full">
      <ModalTitle>{t("title")}</ModalTitle>
      <ModalDescription className="mt-1">{t("subtitle")}</ModalDescription>

      {projects === null ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> {t("loading")}
        </div>
      ) : error ? (
        <div className="mt-6 flex flex-col items-center justify-center gap-4 rounded-2xl bg-muted/30 px-6 py-10 text-center">
          <TriangleAlertIcon className="size-8 text-muted-foreground opacity-70" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <FolderKanbanIcon className="mb-3 size-9 text-primary" />
          <h3 className="font-instrument text-xl font-light italic tracking-[-0.02em] text-foreground">
            {t("noProjectsTitle")}
          </h3>
          <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{t("noProjectsDescription")}</p>
          <Button asChild size="sm" className="mt-4">
            <Link href={createProjectHref} onClick={onClose}>
              <CirclePlusIcon className="size-4" />
              {t("createProject")}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="group/input-group border-input mt-5 flex h-10 items-center rounded-full border bg-background/70 shadow-xs backdrop-blur transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
            <SearchIcon className="ml-3 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t("searchAria")}
              placeholder={t("searchPlaceholder")}
              className="min-w-0 flex-1 truncate border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
              {t("noMatch")}
            </p>
          ) : (
            <ul className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto pr-1" role="list">
              {filtered.map((project) => {
                const submitting = submittingRkey === project.rkey;
                const disabled = submittingRkey !== null;
                return (
                  <li key={`${project.did}/${project.rkey}`}>
                    <button
                      type="button"
                      onClick={() => void apply(project)}
                      disabled={disabled}
                      aria-label={t("applyWith", { project: project.title })}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                        {project.imageUrl ? (
                          <Image src={project.imageUrl} alt="" fill unoptimized sizes="56px" className="object-cover" />
                        ) : (
                          <span className="grid h-full place-items-center text-primary/45">
                            <FolderKanbanIcon className="size-6" />
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="line-clamp-1 font-medium text-foreground">{project.title}</span>
                        {project.shortDescription ? (
                          <span className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                            {project.shortDescription}
                          </span>
                        ) : null}
                      </span>
                      <span className="grid size-6 shrink-0 place-items-center text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary">
                        {submitting ? <Loader2Icon className="size-4 animate-spin" /> : <ChevronRightIcon className="size-5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {submitError ? <p className="mt-3 text-sm text-destructive">{submitError}</p> : null}
        </>
      )}
    </ModalContent>
  );
}

function RewildingSuccessModal({
  projectTitle,
  onClose,
}: {
  projectTitle: string;
  onClose: () => void;
}) {
  const t = useTranslations("marketplace.grants.applyModal");

  return (
    <ModalContent className="w-full">
      <Confetti />
      <div className="flex flex-col items-center py-2 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <CheckCircle2Icon className="size-7" />
        </span>
        <ModalTitle className="mt-4">{t("successTitle")}</ModalTitle>
        <ModalDescription className="mt-1.5 max-w-sm">
          {t("successBody", { project: projectTitle })}
        </ModalDescription>
        <Button type="button" className="mt-6" onClick={onClose}>
          {t("successClose")}
        </Button>
      </div>
    </ModalContent>
  );
}

// ── Interoperable Grants Program (category): Ma Earth Round 3 ─────────────────

function InteroperableSection() {
  const t = useTranslations("marketplace.grants.interoperable");

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="px-6 py-6 sm:px-8">
        <div className="flex items-start gap-4">
          <span className="relative size-14 shrink-0 overflow-hidden rounded-2xl border border-border">
            <Image src={MA_EARTH_LOGO_SRC} alt={t("logoAlt")} fill sizes="56px" className="object-cover" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t("category")}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <h2 className="font-instrument text-2xl font-light italic tracking-[-0.02em] text-foreground sm:text-3xl">
                {t("grantName")}
              </h2>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {t("fundingType")}
              </span>
            </div>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{t("description")}</p>

        <div className="mt-6">
          <a
            href={MA_EARTH_ROUND_PROJECTS_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            {t("browseProjects")}
            <ArrowUpRightIcon />
          </a>
        </div>
      </div>
    </article>
  );
}
