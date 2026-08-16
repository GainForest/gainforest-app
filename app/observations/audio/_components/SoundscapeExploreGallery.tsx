"use client";

/**
 * The Audio explore gallery: every soundscape published on GainForest, drawn
 * as playable 24-hour dials. Individual field recordings are raw material —
 * an unlabeled WAV filename means nothing to a browsing visitor — so the
 * explore surface shows the finished portraits instead, each one tappable to
 * hear a place at a time of day.
 *
 * Owner attribution resolves lazily client-side through the same batched
 * profile cache the feed uses (did-profile.ts), so the server payload stays
 * just the soundscape records themselves.
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { WavesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monogram, resolveDidProfile, type DidProfile } from "@/app/_lib/did-profile";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import { accountHref } from "@/app/_lib/urls";
import type { NetworkSoundscape } from "@/app/_lib/soundscape-explore";
import { SoundscapeCard } from "@/app/soundscape/_components/SoundscapeCard";
import { soundscapeHref } from "@/lib/soundscape/record";

function OwnerByline({ did }: { did: string }) {
  const t = useTranslations("common.soundscape.published");
  const [profile, setProfile] = useState<DidProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveDidProfile(did).then((resolved) => {
      if (!cancelled) setProfile(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [did]);

  const name = profile?.displayName ?? profile?.handle;
  if (!name) return null;
  const mono = monogram(profile?.handle ?? null, did);

  return (
    <Link
      href={accountHref(profile?.handle ?? did)}
      className="group flex min-w-0 items-center gap-2"
    >
      <span className="relative size-6 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
        {profile?.avatar ? (
          <Image
            src={profile.avatar}
            alt=""
            fill
            sizes="24px"
            unoptimized={!isPdsBlobUrl(profile.avatar)}
            className="object-cover"
          />
        ) : (
          <span
            className="grid h-full w-full place-items-center text-[11px] font-semibold text-white"
            style={{ backgroundColor: mono.bg }}
          >
            {mono.char}
          </span>
        )}
      </span>
      <span className="truncate text-[13px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        {t("byLine", { name })}
      </span>
    </Link>
  );
}

export function SoundscapeExploreGallery({ items }: { items: NetworkSoundscape[] }) {
  const t = useTranslations("common.audiomoth.audioHub");

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
        <WavesIcon className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h2 className="mt-4 text-lg font-medium text-foreground">{t("soundscapesEmptyTitle")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          {t("soundscapesEmptyBody")}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/observations/audio?tab=soundscape">{t("soundscapesEmptyCta")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {items.map((item) => (
        <section key={item.uri} className="flex min-w-0 flex-col gap-2.5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
            {item.soundscape.title ? (
              <h2 className="min-w-0 flex-1 basis-52 truncate text-[15px] font-medium text-foreground">
                {item.soundscape.title}
              </h2>
            ) : null}
            <OwnerByline did={item.did} />
          </div>
          <SoundscapeCard soundscape={item.soundscape} href={soundscapeHref(item.did, item.rkey)} />
        </section>
      ))}
    </div>
  );
}
