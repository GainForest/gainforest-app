import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, ArrowUpRightIcon, WavesIcon } from "lucide-react";
import { fetchPublishedSoundscape } from "@/app/_lib/soundscape-record";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import { formatDate } from "@/app/_lib/format";
import { accountHref } from "@/app/_lib/urls";
import { getAccountRouteData, readAccountRouteParams } from "@/app/account/_lib/account-route";
import { formatSoundscapeDateRange } from "@/lib/soundscape/record";
import { PublishedSoundscapeView } from "../../_components/PublishedSoundscapeView";

/**
 * A published soundscape on its own page — the permalink a shared post links
 * to, and the page a project's evidence timeline opens in full. Everything is
 * read from the owner's PDS, so it works for signed-out readers too.
 */

export const revalidate = 60;

type SoundscapePageParams = Promise<{ did: string; rkey: string }>;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function loadSoundscape(params: SoundscapePageParams) {
  const [{ rkey: encodedRkey }, { did, urlIdentifier }] = await Promise.all([
    params,
    readAccountRouteParams(params),
  ]);
  const rkey = safeDecode(encodedRkey);
  const soundscape = await fetchPublishedSoundscape(did, rkey).catch(() => null);
  return { soundscape, did, rkey, urlIdentifier };
}

export async function generateMetadata({ params }: { params: SoundscapePageParams }): Promise<Metadata> {
  const [{ soundscape }, t] = await Promise.all([
    loadSoundscape(params),
    getTranslations("common.soundscape.published"),
  ]);
  if (!soundscape) return { title: t("metaTitle") };
  return {
    title: soundscape.title || t("metaTitle"),
    description: soundscape.note ?? t("metaDescription"),
  };
}

export default async function PublishedSoundscapePage({ params }: { params: SoundscapePageParams }) {
  const { soundscape, did, urlIdentifier } = await loadSoundscape(params);
  const t = await getTranslations("common.soundscape.published");

  if (!soundscape) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
        <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
          <WavesIcon className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-medium text-foreground">{t("notFoundTitle")}</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("notFoundBody")}</p>
        </div>
      </main>
    );
  }

  const owner = await getAccountRouteData(did, urlIdentifier).catch(() => null);
  const dateRange = formatSoundscapeDateRange(soundscape.sources);

  return (
    <main className="min-h-screen bg-background pb-20">
      <div className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
        <Link
          href="/observations/audio?tab=soundscape"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
          {t("openWorkbench")}
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary">
            <WavesIcon className="h-3.5 w-3.5" aria-hidden />
            {t("metaTitle")}
          </span>
          {soundscape.createdAt ? (
            <span className="text-[12.5px] text-muted-foreground">{formatDate(soundscape.createdAt)}</span>
          ) : null}
        </div>

        <h1 className="mt-3 font-instrument text-4xl italic leading-tight tracking-[-0.01em] text-foreground md:text-5xl">
          {soundscape.title || dateRange}
        </h1>
        {soundscape.note ? (
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted-foreground">{soundscape.note}</p>
        ) : null}

        {owner ? (
          <Link href={accountHref(owner.urlIdentifier)} className="group mt-5 inline-flex items-center gap-3">
            <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
              {owner.avatarUrl ? (
                <Image
                  src={owner.avatarUrl}
                  alt=""
                  fill
                  sizes="36px"
                  unoptimized={!isPdsBlobUrl(owner.avatarUrl)}
                  className="object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center text-sm font-semibold text-muted-foreground">
                  {owner.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                {t("byLine", { name: owner.displayName })}
              </span>
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                {owner.handle ?? ""}
                <ArrowUpRightIcon className="h-3 w-3" aria-hidden />
              </span>
            </span>
          </Link>
        ) : null}

        <section className="mt-8 rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
          <PublishedSoundscapeView soundscape={soundscape} />
        </section>
      </div>
    </main>
  );
}
