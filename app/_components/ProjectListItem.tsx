"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronRightIcon, FolderKanbanIcon, HeartIcon, MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProjectScopeTags } from "./ProjectScopeTags";
import { isPdsBlobUrl } from "../_lib/pds";
import { countryName, formatCompactUsd } from "../_lib/format";
import type { ProjectRecord } from "../_lib/indexer";

/**
 * Shared grid template for the compact list. The header and every row use the
 * same track definition so columns line up like a table. Columns that are
 * `hidden` at a breakpoint must be matched by the number of tracks at that
 * breakpoint, or the remaining cells will misalign — keep the visibility
 * classes below in sync with these templates.
 *
 *   base : thumb | project | chevron
 *   sm   : thumb | project | steward | place | chevron
 *   lg   : thumb | project | steward | place | focus | chevron
 */
const LIST_GRID =
  "grid-cols-[2.5rem_minmax(0,1fr)_1rem] " +
  "sm:grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,8.5rem)_minmax(0,7.5rem)_1rem] " +
  "lg:grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,8.5rem)_minmax(0,7rem)_minmax(0,9rem)_1rem]";

/**
 * Column-label header for the compact project list. Hidden on mobile (where the
 * rows collapse to a stacked layout). Mirrors `LIST_GRID` so labels sit above
 * their columns.
 */
export function ProjectListHeader() {
  const t = useTranslations("marketplace.projects.list");
  return (
    <div
      className={`hidden items-center gap-3 px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:grid sm:gap-4 sm:px-3 ${LIST_GRID}`}
    >
      <span aria-hidden />
      <span>{t("colProject")}</span>
      <span>{t("colSteward")}</span>
      <span>{t("colPlace")}</span>
      <span className="hidden lg:block">{t("colFocus")}</span>
      <span aria-hidden />
    </div>
  );
}

/**
 * Compact, table-style project row — used by the projects explorer and the
 * account profile's Projects tab. Renders a small thumbnail, title, steward,
 * place, focus tags, and evidence counts as aligned columns on wide screens,
 * collapsing to a stacked title + meta layout on mobile.
 */
export function ProjectListItem({
  record,
  onOpen,
  priority = false,
  donationSummary,
}: {
  record: ProjectRecord;
  onOpen: (record: ProjectRecord) => void;
  priority?: boolean;
  donationSummary?: {
    acceptsDonations: boolean;
    totalUsd: number;
    donorCount: number;
    maEarth: { rounds: number[] } | null;
  };
}) {
  const t = useTranslations("marketplace.projects.card");
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;
  const place = countryName(record.country);
  const steward = record.creatorName ?? t("projectSteward");
  const acceptsDonations = donationSummary?.acceptsDonations || record.acceptsDonations === true;
  const donationLabel = donationSummary && donationSummary.totalUsd > 0
    ? t("donationSummaryShort", { amount: formatCompactUsd(donationSummary.totalUsd), donors: donationSummary.donorCount })
    : acceptsDonations
      ? t("acceptsDonations")
      : null;
  const round = donationSummary?.maEarth?.rounds.at(-1);

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      aria-label={t("open", { title: record.title })}
      className={`group grid w-full items-center gap-3 px-2 py-2 text-left outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 sm:gap-4 sm:px-3 ${LIST_GRID}`}
    >
      {/* Thumbnail */}
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
        {hasImage ? (
          <Image
            src={record.imageUrl!}
            alt=""
            fill
            sizes="44px"
            priority={priority}
            fetchPriority={priority ? "high" : "auto"}
            unoptimized={!isPdsBlobUrl(record.imageUrl)}
            onError={() => setImgError(true)}
            className="object-cover"
          />
        ) : (
          <span className="grid h-full place-items-center text-primary/45">
            <FolderKanbanIcon className="h-4 w-4" />
          </span>
        )}
      </span>

      {/* Project: title + secondary meta */}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium leading-snug text-foreground group-hover:underline">
          {record.title}
        </span>
        {/* Mobile: steward · place. Desktop: short description. */}
        <span className="mt-0.5 truncate text-xs leading-snug text-muted-foreground sm:hidden">
          {[steward, place, donationLabel].filter(Boolean).join(" · ")}
        </span>
        {record.shortDescription ? (
          <span className="mt-0.5 hidden truncate text-xs leading-snug text-muted-foreground sm:block">
            {record.shortDescription}
          </span>
        ) : null}
        {donationLabel ? (
          <span className="mt-1 hidden items-center gap-1.5 truncate text-xs font-medium text-primary sm:flex">
            <HeartIcon className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{donationLabel}</span>
            {round ? <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] text-background">{t("round", { round })}</span> : null}
          </span>
        ) : null}
      </span>

      {/* Steward */}
      <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">{steward}</span>

      {/* Place */}
      <span className="hidden min-w-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
        {place ? (
          <>
            <MapPinIcon className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
            <span className="truncate">{place}</span>
          </>
        ) : (
          <span className="text-muted-foreground/45">—</span>
        )}
      </span>

      {/* Focus tags */}
      <span className="hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 overflow-hidden text-xs text-muted-foreground lg:flex">
        {(record.scopeTags?.length ?? 0) > 0 ? (
          <ProjectScopeTags tags={record.scopeTags ?? []} variant="text" max={2} />
        ) : (
          <span className="text-muted-foreground/45">—</span>
        )}
      </span>

      {/* Affordance */}
      <ChevronRightIcon
        className="h-4 w-4 shrink-0 justify-self-end text-muted-foreground/50 transition-colors group-hover:text-foreground"
        aria-hidden
      />
    </button>
  );
}
