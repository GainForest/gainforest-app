"use client";

/**
 * Evidence timeline preview for a published soundscape: the 24-hour clock,
 * drawn and playable inside the timeline itself.
 *
 * The tile stores only the soundscape's permalink; the record behind it is
 * read from its owner's PDS when the tile is opened, so a project page costs
 * nothing extra until a reader actually looks at the soundscape.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRightIcon, Loader2Icon, WavesIcon } from "lucide-react";
import { fetchPublishedSoundscape } from "@/app/_lib/soundscape-record";
import { PublishedSoundscapeView } from "@/app/soundscape/_components/PublishedSoundscapeView";
import { parseSoundscapeHref, type PublishedSoundscape } from "@/lib/soundscape/record";
import type { TimelinePreviewPayload } from "../../../shared/timelineFeedViewModel";

export function SoundscapePreviewRenderer({ preview }: { preview: TimelinePreviewPayload }) {
  const t = useTranslations("common.soundscape.published");
  const target = parseSoundscapeHref(preview.href);
  const [soundscape, setSoundscape] = useState<PublishedSoundscape | null | undefined>(undefined);

  useEffect(() => {
    if (!target) {
      setSoundscape(null);
      return;
    }
    const controller = new AbortController();
    setSoundscape(undefined);
    fetchPublishedSoundscape(target.did, target.rkey, controller.signal)
      .then((next) => setSoundscape(next))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setSoundscape(null);
      });
    return () => controller.abort();
  }, [target?.did, target?.rkey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (soundscape === undefined) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-border/60 bg-muted/30">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (soundscape === null) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-6 text-center">
        <WavesIcon className="size-7 text-muted-foreground opacity-70" />
        <p className="text-sm font-medium text-foreground">{t("notFoundTitle")}</p>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">{t("notFoundBody")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          <WavesIcon className="size-4 shrink-0 text-primary" />
          <span className="truncate">{soundscape.title || preview.title}</span>
        </p>
        <Link
          href={preview.href}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t("openFull")}
          <ArrowUpRightIcon className="size-3" />
        </Link>
      </div>
      {soundscape.note ? (
        <p className="mb-3 text-sm leading-6 text-muted-foreground">{soundscape.note}</p>
      ) : null}
      <PublishedSoundscapeView soundscape={soundscape} />
    </div>
  );
}
