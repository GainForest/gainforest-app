"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import { FolderKanbanIcon, LayoutGridIcon, ListIcon, MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { RecordDrawer } from "../../_components/RecordDrawer";
import { ProjectScopeTags } from "../../_components/ProjectScopeTags";
import { ProjectEvidence } from "../../_components/ProjectEvidence";
import { ProjectListItem, ProjectListHeader } from "../../_components/ProjectListItem";
import { useStableQueryView } from "../../_lib/use-stable-query-view";
import { isPdsBlobUrl } from "../../_lib/pds";
import type { ProjectRecord } from "../../_lib/indexer";

type ProjectsView = "cards" | "list";
const PROJECTS_VIEWS: ProjectsView[] = ["cards", "list"];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export function AccountProjectsGrid({ projects }: { projects: ProjectRecord[] }) {
  const t = useTranslations("common.accountProjects");
  const viewT = useTranslations("marketplace.projects.view");
  const [drawer, setDrawer] = useState<ProjectRecord | null>(null);
  const [queryView, setQueryView] = useQueryState(
    "view",
    parseAsStringEnum<ProjectsView>(PROJECTS_VIEWS).withDefault("cards").withOptions({ history: "replace", scroll: false, shallow: true }),
  );
  const [view, setView] = useStableQueryView({
    queryValue: queryView,
    setQueryValue: setQueryView,
    values: PROJECTS_VIEWS,
    defaultValue: "cards",
  });

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span
          className="mb-4 block text-7xl font-light tracking-tight text-primary/[0.12]"
          style={{ fontFamily: "var(--font-garamond-var)" }}
        >
          0
        </span>
        <div className="mb-3 flex items-center gap-2">
          <FolderKanbanIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">{t("emptyEyebrow")}</span>
        </div>
        <p
          className="max-w-sm text-lg text-foreground/60"
          style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
        >
          {t("empty")}
        </p>
      </div>
    );
  }

  const viewOptions: Array<{ id: ProjectsView; label: string; Icon: typeof LayoutGridIcon }> = [
    { id: "cards", label: viewT("cards"), Icon: LayoutGridIcon },
    { id: "list", label: viewT("list"), Icon: ListIcon },
  ];

  return (
    <section className="py-6">
      <div className="mb-5 flex justify-end">
        <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background/50 p-0.5">
          {viewOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => void setView(option.id)}
              aria-pressed={view === option.id}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors ${
                view === option.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <option.Icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {view === "list" ? (
        <div>
          <ProjectListHeader />
          <ul role="list" className="border-t border-border">
            {projects.map((project, index) => (
              <li
                key={project.id}
                className="relative animate-in after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-border last:after:hidden sm:after:inset-x-3"
                style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
              >
                <ProjectListItem record={project} onOpen={setDrawer} priority={index < 8} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-stretch gap-5"
        >
          {projects.map((project) => (
            <motion.div key={project.id} variants={cardVariants} className="h-full">
              <ProjectCard project={project} onOpen={() => setDrawer(project)} />
            </motion.div>
          ))}
        </motion.div>
      )}
      <RecordDrawer record={drawer} onClose={() => setDrawer(null)} />
    </section>
  );
}

function ProjectCard({ project, onOpen }: { project: ProjectRecord; onOpen: () => void }) {
  const t = useTranslations("marketplace.projects.card");
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(project.imageUrl) && !imgError;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border bg-card text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {hasImage ? (
          <Image
            src={project.imageUrl!}
            alt={project.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
            unoptimized={!isPdsBlobUrl(project.imageUrl)}
            onError={() => setImgError(true)}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center bg-primary/8 text-primary/50">
            <FolderKanbanIcon className="h-12 w-12" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex-1">
          <h2 className="line-clamp-2 font-instrument text-2xl italic leading-tight text-foreground">{project.title}</h2>
          {project.shortDescription ? (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{project.shortDescription}</p>
          ) : null}
        </div>

        {(project.scopeTags?.length ?? 0) > 0 || project.locationUri || project.evidence ? (
          <div className="mt-4 space-y-2 border-t border-border/70 pt-3">
            {(project.scopeTags?.length ?? 0) > 0 || project.locationUri ? (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <ProjectScopeTags tags={project.scopeTags ?? []} />
                {project.locationUri ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                    <MapPinIcon className="h-3.5 w-3.5" />
                    {t("projectPlace")}
                  </span>
                ) : null}
              </div>
            ) : null}
            <ProjectEvidence evidence={project.evidence} />
          </div>
        ) : null}
      </div>
    </button>
  );
}
