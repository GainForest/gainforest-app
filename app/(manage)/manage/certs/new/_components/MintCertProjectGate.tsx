"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronRightIcon,
  CirclePlusIcon,
  FolderKanbanIcon,
  Loader2Icon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { manageApiHref, manageHref, type ManageTarget } from "@/lib/links";

type GateProject = {
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

function toGateProject(raw: ApiProject): GateProject | null {
  if (typeof raw.rkey !== "string" || typeof raw.did !== "string") return null;
  return {
    rkey: raw.rkey,
    did: raw.did,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Untitled project",
    shortDescription: typeof raw.shortDescription === "string" ? raw.shortDescription : null,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
  };
}

export function MintCertProjectGate({ target }: { target: ManageTarget }) {
  const t = useTranslations("marketplace.newCert.gate");
  const [projects, setProjects] = useState<GateProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setProjects(null);
    try {
      const response = await fetch(manageApiHref("/api/manage/projects", target), { cache: "no-store" });
      const data = (await response.json()) as ApiProject[] | { error?: string };
      if (!response.ok || !Array.isArray(data)) {
        setError(!Array.isArray(data) && data.error ? data.error : t("errorTitle"));
        setProjects([]);
        return;
      }
      setProjects(data.map(toGateProject).filter((project): project is GateProject => Boolean(project)));
    } catch {
      setError(t("errorTitle"));
      setProjects([]);
    }
  }, [target, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const createProjectHref = manageHref(target, "projects", { mode: "new" });
  const skipHref = manageHref(target, "newBumicert", { noProject: "1" });

  const filtered = useMemo(() => {
    if (!projects) return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) => `${project.title} ${project.shortDescription ?? ""}`.toLowerCase().includes(normalized));
  }, [projects, query]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="max-w-2xl">
        <h1 className="font-instrument text-3xl font-light italic tracking-[-0.02em] text-foreground sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {projects === null ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> {t("loading")}
        </div>
      ) : error ? (
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-3xl bg-muted/30 px-6 py-12 text-center">
          <TriangleAlertIcon className="size-8 text-muted-foreground opacity-70" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <FolderKanbanIcon className="mb-4 size-10 text-primary" />
          <h2 className="font-instrument text-2xl font-light italic tracking-[-0.02em] text-foreground">{t("noProjectsTitle")}</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("noProjectsDescription")}</p>
          <Button asChild size="sm" className="mt-5">
            <Link href={createProjectHref}>
              <CirclePlusIcon className="size-4" />
              {t("createProject")}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="group/input-group border-input mt-7 flex h-10 items-center rounded-full border bg-background/70 shadow-xs backdrop-blur transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 sm:max-w-md">
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
            <p className="mt-6 rounded-2xl bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
          ) : (
            <ul className="mt-4 space-y-2" role="list">
              {filtered.map((project) => (
                <li key={`${project.did}/${project.rkey}`}>
                  <Link
                    href={manageHref(target, "newBumicert", { forProject: `${project.did}/${project.rkey}` })}
                    aria-label={t("mintFrom")}
                    className="group flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 transition-colors hover:border-primary/40 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 sm:gap-4 sm:px-4"
                  >
                    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-20 sm:w-20">
                      {project.imageUrl ? (
                        <Image src={project.imageUrl} alt={project.title} fill unoptimized sizes="80px" className="object-cover" />
                      ) : (
                        <span className="grid h-full place-items-center text-primary/45">
                          <FolderKanbanIcon className="size-7" />
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="line-clamp-1 font-instrument text-xl italic leading-tight text-foreground sm:text-2xl">{project.title}</span>
                      {project.shortDescription ? (
                        <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{project.shortDescription}</span>
                      ) : null}
                    </span>
                    <ChevronRightIcon className="size-6 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-8 border-t border-border/60 pt-4">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href={skipHref}>{t("skip")}</Link>
        </Button>
      </div>
    </div>
  );
}
