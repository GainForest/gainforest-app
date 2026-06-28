"use client";

import Image from "next/image";
import { useState } from "react";
import { FolderKanbanIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProjectScopeTags } from "./ProjectScopeTags";
import { ProjectEvidence } from "./ProjectEvidence";
import { isPdsBlobUrl } from "../_lib/pds";
import { countryName } from "../_lib/format";
import type { ProjectRecord } from "../_lib/indexer";

/**
 * Shared project row for list views — used by the projects explorer and the
 * account profile's Projects tab so both render an image thumbnail, title,
 * description, scope tags, place, and evidence consistently.
 */
export function ProjectListItem({
  record,
  onOpen,
  priority = false,
}: {
  record: ProjectRecord;
  onOpen: (record: ProjectRecord) => void;
  priority?: boolean;
}) {
  const t = useTranslations("marketplace.projects.card");
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;
  const place = countryName(record.country);

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="group flex w-full gap-3 rounded-2xl px-1 py-3 text-left outline-none transition-colors duration-300 hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-primary/60 sm:gap-4 sm:px-2 sm:py-4"
    >
      <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-36">
        {hasImage ? (
          <Image
            src={record.imageUrl!}
            alt={record.title}
            fill
            sizes="144px"
            priority={priority}
            fetchPriority={priority ? "high" : "auto"}
            unoptimized={!isPdsBlobUrl(record.imageUrl)}
            onError={() => setImgError(true)}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full place-items-center text-primary/50">
            <FolderKanbanIcon className="h-9 w-9" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <span className="min-w-0">
          <span className="block truncate font-instrument text-2xl italic leading-tight text-foreground">{record.title}</span>
          {record.shortDescription ? <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">{record.shortDescription}</span> : null}
        </span>
        <span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <ProjectScopeTags tags={record.scopeTags ?? []} variant="text" />
            {place ? <span>{place}</span> : null}
            <ProjectEvidence evidence={record.evidence} className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-5" />
          </span>
          <span className="shrink-0 text-xs font-medium text-foreground transition-colors group-hover:text-primary">{t("showDetails")}</span>
        </span>
      </span>
    </button>
  );
}
