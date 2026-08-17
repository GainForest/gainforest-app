"use client";

/**
 * The one shared project-row schema for the public audio explore page.
 *
 * The row header owns project identity and the project's totals. Each slot
 * owns exactly one folder: its kind, the days it covers, how many files it
 * holds and one way in. Nothing is stated at both levels.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon, RadioIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AudioProjectUpload } from "@/app/_lib/audio-projects";
import { monogram } from "@/app/_lib/did-profile";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import { accountHref, localProjectHref } from "@/app/_lib/urls";
import type { ProjectRecord } from "@/app/_lib/indexer";
import type { NetworkSoundscape } from "@/app/_lib/soundscape-explore";
import { SoundscapeCard } from "@/app/soundscape/_components/SoundscapeCard";
import { formatCardDateRange } from "@/lib/soundscape/card";
import { soundscapeDates, soundscapeHref } from "@/lib/soundscape/record";
import { AudioRecordingSlot } from "./AudioRecordingSlot";
import { countForSoundscape, displaySoundscapeTitle, type SoundscapeSlot as SoundscapeSlotData } from "./audio-row";

/** One project's audio, as the explore page reads it. */
export type AudioRow = {
  key: string;
  project: ProjectRecord | null;
  /** Stands in for the project name when a soundscape has no project record. */
  fallbackTitle: string | null;
  ownerDid: string;
  ownerName: string | null;
  ownerAvatar: string | null;
  projectImage: string | null;
  recorderCount: number;
  recordingCount: number;
  uploads: AudioProjectUpload[];
  soundscapes: NetworkSoundscape[];
};

function SoundscapeSlot({
  item,
  upload,
}: {
  item: NetworkSoundscape;
  upload: AudioProjectUpload | null;
}) {
  const t = useTranslations("common.audiomoth.audioHub");
  const locale = useLocale();
  const title = displaySoundscapeTitle(item.soundscape.title, t("soundscapeFallback"));
  const dates = soundscapeDates(item.soundscape.sources);
  const href = soundscapeHref(item.did, item.rkey);

  return (
    <article className="flex min-h-[390px] min-w-0 flex-col overflow-hidden rounded-xl border-2 border-foreground bg-background p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        <span>{t("soundscapeSlot")}</span>
        <span className="shrink-0 normal-case tracking-normal">
          {dates.length > 0 ? formatCardDateRange(dates, locale) : t("dateUnavailable")}
        </span>
      </div>

      <h3 className="mt-3 min-w-0 truncate text-base font-medium text-foreground">
        <Link href={href} className="hover:underline">
          {title}
        </Link>
      </h3>
      <p className="mt-2 flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <RadioIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          {t("slotRecordings", { count: countForSoundscape(item, upload) })}
        </span>
      </p>

      <SoundscapeCard
        soundscape={item.soundscape}
        href={href}
        legend={false}
        showHeader={false}
        showFooter={false}
        compact
        className="mt-1 flex-1"
      />
    </article>
  );
}

export function AudioProjectRow({
  row,
  soundscapes,
  recordings,
  hiddenCount,
  expanded,
  onToggle,
}: {
  row: AudioRow;
  soundscapes: SoundscapeSlotData[];
  recordings: AudioProjectUpload[];
  hiddenCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("common.audiomoth.audioHub");
  const organization = row.ownerName ?? t("unknownOrganization");
  // A row without a project record says so — a soundscape's own title is not
  // a project name, so it never stands in for one here.
  const projectTitle = row.project?.title ?? t("noProject");
  const organizationHref = accountHref(row.ownerDid);
  const projectHref = row.project
    ? localProjectHref(row.project.did, row.project.rkey)
    : organizationHref;
  const logo = row.ownerAvatar ?? row.projectImage;
  const mono = monogram(organization, row.ownerDid);

  return (
    <section className="flex flex-col gap-4 border-t border-border/60 pt-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link
          href={organizationHref}
          aria-label={organization}
          className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-border bg-muted"
        >
          {logo ? (
            <Image
              src={logo}
              alt=""
              fill
              sizes="44px"
              unoptimized={!isPdsBlobUrl(logo)}
              className="object-cover"
            />
          ) : (
            <span
              className="grid h-full w-full place-items-center text-sm font-semibold text-white"
              style={{ backgroundColor: mono.bg }}
            >
              {mono.char}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="min-w-0 truncate text-lg font-medium text-foreground">
            <Link href={organizationHref} className="hover:underline">
              {organization}
            </Link>
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {t("projectMeta", {
              project: projectTitle,
              recorders: row.recorderCount,
              recordings: row.recordingCount,
            })}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href={projectHref}>
            {row.project ? t("openProject") : t("openAccount")}
            <ArrowUpRightIcon className="size-3.5" aria-hidden />
          </Link>
        </Button>
      </div>

      {soundscapes.length > 0 ? (
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          {soundscapes.map((slot) => (
            <SoundscapeSlot key={slot.item.uri} item={slot.item} upload={slot.upload} />
          ))}
        </div>
      ) : null}

      {/* Folders still waiting for a soundscape stay compact lines. */}
      {recordings.length > 0 ? (
        <div className="flex flex-col gap-2">
          {recordings.map((upload) => (
            <AudioRecordingSlot key={upload.id} upload={upload} />
          ))}
        </div>
      ) : null}

      {hiddenCount > 0 || expanded ? (
        <button
          type="button"
          onClick={onToggle}
          className="self-center rounded-full border border-border bg-background px-5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? t("showFewer") : t("showMoreFromProject", { count: hiddenCount })}
        </button>
      ) : null}
    </section>
  );
}
