"use client";

/**
 * A recorder folder that has no soundscape yet.
 *
 * There is nothing to draw for it, so it stays a compact line rather than a
 * tall card holding an empty dial: what was uploaded, when it was recorded,
 * and a way to go listen.
 */

import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { accountAudioPath } from "@/app/account/_lib/account-route";
import type { AudioProjectUpload } from "@/app/_lib/audio-projects";
import { formatCardDateRange } from "@/lib/soundscape/card";
import { slotDateKeys } from "./audio-row";

export function AudioRecordingSlot({ upload }: { upload: AudioProjectUpload }) {
  const t = useTranslations("common.audiomoth.audioHub");
  const locale = useLocale();
  const dates = slotDateKeys(upload);

  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        <span>{t("recordingsSlot")}</span>
        <span className="shrink-0 normal-case tracking-normal">
          {dates.length > 0 ? formatCardDateRange(dates, locale) : t("dateUnavailable")}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 text-base font-medium text-foreground">
          {t("recordingsUploaded", { count: upload.recordingCount })}
        </p>
        <Button asChild variant="outline" size="sm" className="shrink-0 rounded-full">
          <Link href={accountAudioPath(upload.did)}>
            {t("browseRecordings")}
            <ArrowUpRightIcon className="size-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
