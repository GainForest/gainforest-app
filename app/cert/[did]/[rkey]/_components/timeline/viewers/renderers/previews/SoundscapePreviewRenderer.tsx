"use client";

/**
 * Evidence timeline preview for a published soundscape: the 24-hour clock,
 * drawn and playable inside the timeline itself.
 *
 * The tile stores only the soundscape's permalink; the record behind it is
 * read from its owner's PDS when the tile is opened, so a project page costs
 * nothing extra until a reader actually looks at the soundscape.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, WavesIcon } from "lucide-react";
import { fetchPublishedSoundscape } from "@/app/_lib/soundscape-record";
import { SoundscapeCard } from "@/app/soundscape/_components/SoundscapeCard";
import { parseSoundscapeHref, type PublishedSoundscape } from "@/lib/soundscape/record";
import type { TimelinePreviewPayload } from "../../../shared/timelineFeedViewModel";

// Published soundscapes are immutable, so a record fetched once is good for the
// whole session. This module-level cache makes switching between an entry's
// soundscape tiles instant; paired with the stable renderer key, the previous
// dial stays on screen while an uncached one loads instead of flashing a spinner.
const soundscapeCache = new Map<string, PublishedSoundscape>();

export function SoundscapePreviewRenderer({ preview }: { preview: TimelinePreviewPayload }) {
  const t = useTranslations("common.soundscape.published");
  const target = parseSoundscapeHref(preview.href);
  const cacheKey = target ? `${target.did}/${target.rkey}` : null;
  const [soundscape, setSoundscape] = useState<PublishedSoundscape | null | undefined>(
    () => (cacheKey ? soundscapeCache.get(cacheKey) ?? undefined : null),
  );

  useEffect(() => {
    if (!target) {
      setSoundscape(null);
      return;
    }
    const key = `${target.did}/${target.rkey}`;
    const cached = soundscapeCache.get(key);
    if (cached) {
      // Already loaded this session — swap in instantly, no fetch, no flash.
      setSoundscape(cached);
      return;
    }
    // Leave whatever is on screen (the previous dial, or the first-load spinner)
    // in place while the new record loads, so switching tiles never blanks.
    const controller = new AbortController();
    fetchPublishedSoundscape(target.did, target.rkey, controller.signal)
      .then((next) => {
        if (next) soundscapeCache.set(key, next);
        setSoundscape(next);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setSoundscape((current) => current ?? null);
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
    <div className="mx-auto max-w-2xl">
      {soundscape.note ? (
        <p className="mb-2 text-sm leading-6 text-muted-foreground">{soundscape.note}</p>
      ) : null}
      <SoundscapeCard soundscape={soundscape} href={preview.href} />
    </div>
  );
}
