"use client";

/**
 * In-feed card for a recorder folder somebody uploaded: how many recordings
 * landed, which recorder they came off, and a way in to hear them.
 *
 * The same card the Audio explore page shows for an upload that has no
 * soundscape yet — everything it needs already travels on the feed row, so
 * unlike the soundscape card there is nothing to fetch.
 */

import Link from "next/link";
import { ArrowUpRightIcon, RadioIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { FeedAudioUpload } from "../_lib/feed";

export function FeedAudioUploadCard({ upload }: { upload: FeedAudioUpload }) {
  const t = useTranslations("common.feed.audioUpload");
  const recorder = upload.recorderName?.trim() || t("recorderFallback");

  return (
    <div className="mt-2 rounded-2xl border border-dashed border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-base font-medium text-foreground">
            {t("recordings", { count: upload.recordingCount })}
          </p>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <RadioIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{recorder}</span>
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 rounded-full">
          <Link href={upload.browseHref}>
            {t("browse")}
            <ArrowUpRightIcon className="size-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
