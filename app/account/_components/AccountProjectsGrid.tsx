"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FolderKanbanIcon, MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { RecordDrawer } from "../../_components/RecordDrawer";
import { ProjectScopeTags } from "../../_components/ProjectScopeTags";
import { ProjectEvidence } from "../../_components/ProjectEvidence";
import { ProjectListItem, ProjectListHeader } from "../../_components/ProjectListItem";
import { useStableQueryView } from "../../_lib/use-stable-query-view";
import { isPdsBlobUrl } from "../../_lib/pds";
import type { ProjectRecord } from "../../_lib/indexer";
import { ManageCollectionViewToggle } from "@/app/(manage)/manage/projects/_components/ManageCollectionPrimitives";

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
  const reduceMotion = useReducedMotion();
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
        <FolderKanbanIcon className="mb-4 size-9 text-primary" aria-hidden />
        <h2 className="font-instrument text-2xl italic text-foreground">{t("emptyTitle")}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <section className="py-6">
      <div className="mb-5 flex justify-end">
        <ManageCollectionViewToggle
          value={view}
          onChange={(next) => void setView(next)}
          cardsLabel={viewT("cards")}
          listLabel={viewT("list")}
        />
      </div>

      {view === "list" ? (
        <div>
          <ProjectListHeader />
          <ul role="list" className="border-t border-border">
            {projects.map((project, index) => (
              <li
                key={project.id}
                className={reduceMotion ? "relative after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-border last:after:hidden sm:after:inset-x-3" : "relative animate-in after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-border last:after:hidden sm:after:inset-x-3"}
                style={reduceMotion ? undefined : { animationDelay: `${Math.min(index, 10) * 35}ms` }}
              >
                <ProjectListItem record={project} onOpen={setDrawer} priority={index < 8} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <motion.div
          variants={reduceMotion ? undefined : containerVariants}
          initial={reduceMotion ? false : "hidden"}
          animate={reduceMotion ? undefined : "visible"}
          className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-stretch gap-5"
        >
          {projects.map((project) => (
            <motion.div key={project.id} variants={reduceMotion ? undefined : cardVariants} className="h-full">
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
      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl bg-muted/65 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
            className="object-cover transition-transform duration-500 motion-reduce:transition-none group-hover:scale-105 motion-reduce:group-hover:scale-100"
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
