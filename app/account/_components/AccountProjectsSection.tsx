import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FolderKanbanIcon } from "lucide-react";
import { formatCountry } from "@/app/_lib/format";
import { localProjectHref } from "@/app/_lib/urls";
import type { ProjectRecord } from "@/app/_lib/indexer";
import type { AccountRouteData } from "../_lib/account-route";
import { accountProjectsPath } from "../_lib/account-route";

/** How many projects the Overview shows before deferring to the Projects tab. */
const MAX_PROJECTS = 6;

/**
 * The work this account runs, right under its About text: the natural next
 * question after "who is this?" is "what are they doing?", so the projects sit
 * ahead of the record stream rather than in a side rail.
 */
export async function AccountProjectsSection({
  account,
  projects,
}: {
  account: AccountRouteData;
  projects: ProjectRecord[];
}) {
  const [tabsT, overviewT] = await Promise.all([
    getTranslations("common.accountTabs"),
    getTranslations("common.accountOverview"),
  ]);
  if (projects.length === 0) return null;

  const shown = projects.slice(0, MAX_PROJECTS);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-instrument text-2xl italic leading-none text-foreground">{tabsT("projects")}</h2>
        <Link
          href={accountProjectsPath(account.urlIdentifier)}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {projects.length > shown.length
            ? overviewT("seeAllCount", { count: projects.length })
            : overviewT("seeAll")}
        </Link>
      </div>

      {/* grid-cols-1 (not a bare `grid`) so the column can shrink past the
          truncated title's min-content width instead of overflowing on phones. */}
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((project) => (
          <li key={project.id}>
            <Link
              href={localProjectHref(account.urlIdentifier, project.rkey)}
              className="group flex gap-3 rounded-2xl border border-border/60 bg-card/40 p-3 transition-colors hover:bg-muted/50"
            >
              <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/50">
                {project.imageUrl ? (
                  <Image src={project.imageUrl} alt="" fill unoptimized sizes="64px" className="object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-muted-foreground/60">
                    <FolderKanbanIcon className="size-5" aria-hidden />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground group-hover:underline">
                  {project.title}
                </span>
                {project.country ? (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {formatCountry(project.country)}
                  </span>
                ) : null}
                {project.shortDescription ? (
                  // No `block` here: the line clamp needs its own display mode.
                  <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {project.shortDescription}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
