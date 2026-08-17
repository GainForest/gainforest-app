"use client";

/** One raw recorder folder in a project row. */

import Link from "next/link";
import { ArrowUpRightIcon, RadioIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { accountAudioPath } from "@/app/account/_lib/account-route";
import type { AudioProjectUpload } from "@/app/_lib/audio-projects";
import { formatCardDateRange } from "@/lib/soundscape/card";

function fallbackDateKeys(upload: AudioProjectUpload): string[] {
  if (upload.recordedDates.length > 0) return upload.recordedDates;
  const key = upload.createdAt?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  return key ? [key] : [];
}

export function AudioRecordingSlot({ upload }: { upload: AudioProjectUpload }) {
  const t = useTranslations("common.audiomoth.audioHub");
  const locale = useLocale();
  const dateLabel = formatCardDateRange(fallbackDateKeys(upload), locale);
  const recorder = upload.recorderName?.trim() || t("recorderFallback");

  return (
    <article className="flex min-h-[390px] min-w-0 flex-col rounded-xl border border-dashed border-border bg-background p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        <span>{t("recordingsSlot")}</span>
        <span className="shrink-0 normal-case tracking-normal">{dateLabel || t("dateUnavailable")}</span>
      </div>

      <div className="flex flex-1 flex-col justify-between pt-5">
        <div>
          <h3 className="text-base font-medium text-foreground">{t("noSoundscapeYet")}</h3>
          <p className="mt-2 flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <RadioIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{t("slotMeta", { recorder, count: upload.recordingCount })}</span>
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center">
          <div className="grid size-32 place-items-center rounded-full border border-dashed border-border text-center font-mono text-[10px] font-semibold uppercase leading-[1.15] tracking-[0.12em] text-muted-foreground">
            {t("awaitingFullDay")}
          </div>
          <Button asChild variant="outline" size="sm" className="mt-6 w-full rounded-lg">
            <Link href={accountAudioPath(upload.did)}>
              {t("browseRecordings")}
              <ArrowUpRightIcon className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
