"use client";

/**
 * The one shared project-row schema for the public audio explore page.
 * Project identity lives in the row header; each slot owns one kind of audio,
 * its date, its recorder/count and its one action.
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
import { AudioRecordingSlot } from "./AudioUploadGroup";

export type AudioProjectRow = {
  key: string;
  project: ProjectRecord | null;
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

export type AudioProjectSlot =
  | { kind: "soundscape"; item: NetworkSoundscape; upload: AudioProjectUpload | null }
  | { kind: "recordings"; upload: AudioProjectUpload };

function recorderName(
  upload: AudioProjectUpload | null,
  soundscape: NetworkSoundscape | null,
  fallback: string,
): string {
  return upload?.recorderName?.trim() || soundscape?.recorderName?.trim() || fallback;
}

function countForSoundscape(item: NetworkSoundscape, upload: AudioProjectUpload | null): number {
  return upload?.recordingCount || item.soundscape.sources.length;
}

/** Older publish defaults put the recorder name and ISO date in the title.
 * Those facts now have dedicated fields in the slot, so keep only the title
 * when displaying a generated title. Custom titles without a date are left
 * untouched. */
function displaySoundscapeTitle(value: string, fallback: string): string {
  const title = value.trim();
  if (!title) return fallback;
  const withoutDate = title.replace(
    /\s*[·•]\s*\d{4}-\d{2}-\d{2}(?:\s*[–-]\s*\d{4}-\d{2}-\d{2})?\s*$/,
    "",
  );
  if (withoutDate === title) return title;
  const parts = withoutDate.split(/\s*[·•]\s*/).map((part) => part.trim()).filter(Boolean);
  return parts[0] ?? fallback;
}

function dateLabel(dates: string[], locale: string, fallback: string): string {
  return dates.length > 0 ? formatCardDateRange(dates, locale) : fallback;
}

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
  const recorder = recorderName(upload, item, t("recorderFallback"));
  const count = countForSoundscape(item, upload);
  const dates = soundscapeDates(item.soundscape.sources);

  return (
    <article className="flex min-h-[390px] min-w-0 flex-col overflow-hidden rounded-xl border-2 border-foreground bg-background p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        <span>{t("soundscapeSlot")}</span>
        <span className="shrink-0 normal-case tracking-normal">
          {dateLabel(dates, locale, t("dateUnavailable"))}
        </span>
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 truncate text-base font-medium text-foreground">
          <Link href={soundscapeHref(item.did, item.rkey)} className="hover:underline">
            {title}
          </Link>
        </h3>
      </div>
      <p className="mt-2 flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <RadioIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{t("slotMeta", { recorder, count })}</span>
      </p>

      <SoundscapeCard
        soundscape={item.soundscape}
        href={soundscapeHref(item.did, item.rkey)}
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
  slots,
  hiddenCount,
  expanded,
  onToggle,
}: {
  row: AudioProjectRow;
  slots: AudioProjectSlot[];
  hiddenCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("common.audiomoth.audioHub");
  const organization = row.ownerName ?? t("unknownOrganization");
  const projectTitle = row.project?.title ?? row.fallbackTitle ?? t("soundscapeFallback");
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
          href={projectHref}
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
            {t("openProject")}
            <ArrowUpRightIcon className="size-3.5" aria-hidden />
          </Link>
        </Button>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        {slots.map((slot) =>
          slot.kind === "soundscape" ? (
            <SoundscapeSlot key={slot.item.uri} item={slot.item} upload={slot.upload} />
          ) : (
            <AudioRecordingSlot key={slot.upload.id} upload={slot.upload} />
          ),
        )}
      </div>

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
