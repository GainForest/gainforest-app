"use client";

/**
 * The Soundscapes view of a profile's Audio tab: every 24-hour soundscape the
 * account has published, drawn with the same playable dial the audio explore
 * page uses — same slot header, same shared voice-group key — so a soundscape
 * looks identical whether you meet it on the network gallery or on its
 * owner's profile.
 *
 * Read straight from the owner's PDS, exactly like the recordings view next
 * door: public, CORS-open, nothing gated behind a session. Deliberately no
 * forms at all — soundscapes are published from the workbench, so the only
 * action this page offers is the empty state's pointer there, and only to
 * someone who can manage this profile.
 */

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { RadioIcon, WavesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Container from "@/components/ui/container";
import { listLatestPdsRecords, parseAtUri } from "@/app/_lib/pds";
import { displaySoundscapeTitle } from "@/app/observations/audio/_components/audio-row";
import { CARD_BAND_COLORS, SoundscapeCard } from "@/app/soundscape/_components/SoundscapeCard";
import { FREQUENCY_BANDS, formatBandRange } from "@/lib/soundscape/analysis";
import { formatCardDateRange } from "@/lib/soundscape/card";
import {
  parseSoundscapeRecord,
  SOUNDSCAPE_COLLECTION,
  soundscapeDates,
  soundscapeHref,
  type PublishedSoundscape,
} from "@/lib/soundscape/record";

type AccountSoundscape = {
  uri: string;
  rkey: string;
  soundscape: PublishedSoundscape;
};

/**
 * How many soundscapes the profile lists. A record can run to a few hundred
 * kilobytes of band values, so the page shows the newest couple of dozen
 * rather than an unbounded history (the same ceiling the network gallery
 * keeps for the whole network).
 */
const MAX_ACCOUNT_SOUNDSCAPES = 24;

function publishedAt(item: AccountSoundscape): number {
  const time = Date.parse(item.soundscape.createdAt ?? "");
  return Number.isNaN(time) ? 0 : time;
}

export function AccountSoundscapesViewer({
  did,
  showBuildCta,
}: {
  did: string;
  /** Whether the empty state points at the soundscape workbench — only for
   *  viewers who can manage this profile's recordings. */
  showBuildCta: boolean;
}) {
  const t = useTranslations("common.accountAudio");
  const tHub = useTranslations("common.audiomoth.audioHub");
  const soundscapeT = useTranslations("common.soundscape");
  const locale = useLocale();

  const [items, setItems] = useState<AccountSoundscape[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const records = await listLatestPdsRecords(did, SOUNDSCAPE_COLLECTION, MAX_ACCOUNT_SOUNDSCAPES, ctrl.signal);
        if (ctrl.signal.aborted) return;
        const parsed = records.flatMap((record): AccountSoundscape[] => {
          const soundscape = parseSoundscapeRecord(record.value);
          const parts = parseAtUri(record.uri);
          if (!soundscape || !parts) return [];
          return [{ uri: record.uri, rkey: parts.rkey, soundscape }];
        });
        parsed.sort((a, b) => publishedAt(b) - publishedAt(a));
        setItems(parsed);
      } catch {
        if (!ctrl.signal.aborted) {
          setItems([]);
          setLoadError(true);
        }
      }
    })();
    return () => ctrl.abort();
  }, [did]);

  /** The ceiling most of the dials share, for the one shared voice-group key
   *  (mirrors the explore gallery's reasoning). */
  const keyCeilingHz = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of items ?? []) {
      counts.set(item.soundscape.ceilingHz, (counts.get(item.soundscape.ceilingHz) ?? 0) + 1);
    }
    let best = 24_000;
    let bestCount = 0;
    for (const [hz, count] of counts) {
      if (count > bestCount) {
        best = hz;
        bestCount = count;
      }
    }
    return best;
  }, [items]);

  const loading = items === null;
  const total = items?.length ?? 0;

  return (
    <Container className="pt-4 pb-10">
      <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">
        {t("soundscapes")}
        {total > 0 ? (
          <span className="ms-2.5 align-middle font-sans text-sm font-normal not-italic tracking-normal text-muted-foreground">
            {t("soundscapesCount", { count: total })}
          </span>
        ) : null}
      </h1>

      {loading ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-[390px] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : loadError ? (
        <p className="mt-6 rounded-2xl border border-border bg-card/90 px-5 py-8 text-center text-sm text-muted-foreground">
          {t("soundscapesLoadError")}
        </p>
      ) : total === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <WavesIcon className="size-6" />
          </span>
          <h2 className="mt-4 text-base font-medium text-foreground">{t("soundscapesEmptyTitle")}</h2>
          <p className="mx-auto mt-1.5 max-w-[440px] text-sm text-muted-foreground">{t("soundscapesEmptyBody")}</p>
          {showBuildCta ? (
            <Button asChild size="sm" variant="outline" className="mt-5">
              <Link href="/observations/audio?tab=soundscape">{t("soundscapesBuildCta")}</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
            {items!.map((item) => {
              const title = displaySoundscapeTitle(item.soundscape.title, tHub("soundscapeFallback"));
              const dates = soundscapeDates(item.soundscape.sources);
              const href = soundscapeHref(did, item.rkey);
              return (
                <article
                  key={item.uri}
                  className="flex min-h-[390px] min-w-0 flex-col overflow-hidden rounded-xl border-2 border-foreground bg-background p-3 sm:p-4"
                >
                  <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    <span>{tHub("soundscapeSlot")}</span>
                    <span className="shrink-0 normal-case tracking-normal">
                      {dates.length > 0 ? formatCardDateRange(dates, locale) : tHub("dateUnavailable")}
                    </span>
                  </div>

                  <h2 className="mt-3 min-w-0 truncate text-base font-medium text-foreground">
                    <Link href={href} className="hover:underline">
                      {title}
                    </Link>
                  </h2>
                  <p className="mt-2 flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <RadioIcon className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">
                      {tHub("slotRecordings", { count: item.soundscape.sources.length })}
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
            })}
          </div>

          {/* One shared voice-group key for the whole page, so a grid of dials
              doesn't repeat the same five lines beside every card. */}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-border/60 pt-5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {tHub("voiceKeyTitle")}
            </span>
            {FREQUENCY_BANDS.map((band, index) => (
              <span key={band.id} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span
                  aria-hidden
                  className="inline-block h-[2.5px] w-5 rounded-full"
                  style={{ backgroundColor: CARD_BAND_COLORS[index] }}
                />
                <span className="text-foreground/80">{soundscapeT(`bands.${band.labelKey}`)}</span>
                <span className="font-mono text-[11.5px]">{formatBandRange(band, keyCeilingHz)}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </Container>
  );
}
