"use client";

/**
 * The Audio explore gallery: every soundscape published on GainForest,
 * organised the way a visitor thinks about them — by the project that
 * recorded them. Each publisher gets a section: avatar, name, what they have
 * published and when, an "Open project" link to their account, and their
 * dials in a grid. Recency changes the order, never the structure: projects
 * sort by their latest publication, cards sort newest-first inside each
 * group, and a "N new" count sits on the project header. Card chrome says
 * when a soundscape was *published* up top; the *recorded* dates stay on the
 * dial itself.
 *
 * Individual field recordings are raw material — an unlabeled WAV filename
 * means nothing to a browsing visitor — so the explore surface shows the
 * finished portraits instead, each one tappable to hear a place at a time of
 * day. One shared voice-group key sits at the foot of the page rather than
 * repeating beside every dial.
 *
 * Projects that have uploaded recordings without publishing a soundscape yet
 * take their place in the very same list, in the same chronological order —
 * a project is not a lesser entry for having raw material instead of a
 * finished dial, and a visitor scanning the page should meet both.
 *
 * Owner attribution resolves lazily client-side through the same batched
 * profile cache the feed uses (did-profile.ts), so the server payload stays
 * just the soundscape records themselves.
 */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRightIcon, ChevronDownIcon, SearchIcon, WavesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monogram, resolveDidProfile, type DidProfile } from "@/app/_lib/did-profile";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import { accountHref } from "@/app/_lib/urls";
import type { AudioProject } from "@/app/_lib/audio-projects";
import type { NetworkSoundscape } from "@/app/_lib/soundscape-explore";
import { CARD_BAND_COLORS, SoundscapeCard } from "@/app/soundscape/_components/SoundscapeCard";
import { FREQUENCY_BANDS, formatBandRange } from "@/lib/soundscape/analysis";
import { soundscapeDates, soundscapeHref } from "@/lib/soundscape/record";
import { cn } from "@/lib/utils";
import { AudioUploadGroup } from "./AudioUploadGroup";

/** Cards shown per project before "Show N more from this project". */
const INITIAL_VISIBLE = 4;

/** How recent a publication must be to wear the "new" pill and count toward
 *  the project header's badge. */
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type SortKey = "added" | "recorded";

function publishedMs(item: NetworkSoundscape): number {
  const time = Date.parse(item.soundscape.createdAt ?? "");
  return Number.isNaN(time) ? 0 : time;
}

/** Newest recorded day, as ms. Dates are local `YYYY-MM-DD`; midday keeps the
 *  day from sliding when the viewer sits west of the recorder. */
function recordedMs(item: NetworkSoundscape): number {
  const dates = soundscapeDates(item.soundscape.sources);
  const last = dates[dates.length - 1];
  const time = last ? Date.parse(`${last}T12:00:00`) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

/** "2 hours ago" / "yesterday" for the recent past, a plain date beyond a
 *  month — card chrome, not a diary. */
function formatWhen(ms: number, locale: string): string | null {
  if (ms <= 0) return null;
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs >= 30 * day) {
    return new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  }
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  return rtf.format(Math.round(diff / day), "day");
}

/** When a project last added recordings. Uploads carry no recorded date of
 *  their own, so both sort keys read the same moment for them. */
function uploadedMs(item: AudioProject): number {
  return Math.max(
    0,
    ...item.uploads.map((upload) => {
      const time = upload.createdAt ? Date.parse(upload.createdAt) : Number.NaN;
      return Number.isNaN(time) ? 0 : time;
    }),
  );
}

type ProjectGroup = {
  did: string;
  /** This project's soundscapes, newest first by the active sort key. */
  items: NetworkSoundscape[];
  newCount: number;
  recordings: number;
  lastPublished: number;
  /** The group's newest moment under the active sort key — orders sections. */
  latest: number;
};

/** One entry in the flow: a project's published soundscapes, or a project's
 *  uploaded recordings. Both are ordered by the same clock. */
type GalleryEntry =
  | { kind: "soundscapes"; key: string; latest: number; group: ProjectGroup }
  | { kind: "uploads"; key: string; latest: number; audio: AudioProject };

function SelectPill({
  value,
  onChange,
  ariaLabel,
  className,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("relative inline-flex h-10 max-w-full shrink-0 items-center", className)}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="h-full max-w-full appearance-none truncate rounded-full border border-border bg-background/50 pl-4 pr-9 text-sm font-medium text-foreground shadow-xs backdrop-blur outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
      >
        {children}
      </select>
      <ChevronDownIcon aria-hidden className="pointer-events-none absolute right-3 size-4 text-muted-foreground" />
    </span>
  );
}

export function SoundscapeExploreGallery({
  items,
  audioProjects = [],
}: {
  items: NetworkSoundscape[];
  /** Projects with recordings but no soundscape yet, listed alongside. */
  audioProjects?: AudioProject[];
}) {
  const t = useTranslations("common.audiomoth.audioHub");
  const soundscapeT = useTranslations("common.soundscape");
  const locale = useLocale();

  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("added");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // One clock reading per mount, so "new" doesn't flicker across re-renders.
  const [now] = useState(() => Date.now());

  const dids = useMemo(() => [...new Set(items.map((item) => item.did))], [items]);
  const [profiles, setProfiles] = useState<Record<string, DidProfile>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(dids.map((did) => resolveDidProfile(did))).then((resolved) => {
      if (cancelled) return;
      setProfiles(Object.fromEntries(resolved.map((profile) => [profile.did, profile])));
    });
    return () => {
      cancelled = true;
    };
  }, [dids]);

  const projectOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const did of dids) {
      const profile = profiles[did];
      names.set(did, profile?.displayName ?? profile?.handle ?? `…${did.slice(-6)}`);
    }
    // Projects that have only uploaded recordings belong in the filter too;
    // their name came resolved from the server.
    for (const item of audioProjects) {
      const did = item.project.did;
      if (!names.has(did)) names.set(did, item.organizationName ?? `…${did.slice(-6)}`);
    }
    return [...names.entries()]
      .map(([did, name]) => ({ did, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [audioProjects, dids, profiles]);

  const groups = useMemo<ProjectGroup[]>(() => {
    const needle = query.trim().toLowerCase();
    const keyOf = sort === "added" ? publishedMs : recordedMs;
    const byDid = new Map<string, NetworkSoundscape[]>();
    for (const item of items) {
      if (projectFilter !== "all" && item.did !== projectFilter) continue;
      if (needle) {
        const profile = profiles[item.did];
        const haystack = [item.soundscape.title, item.soundscape.note, profile?.displayName, profile?.handle]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      const group = byDid.get(item.did);
      if (group) group.push(item);
      else byDid.set(item.did, [item]);
    }
    return [...byDid.entries()]
      .map(([did, groupItems]) => {
        const sorted = [...groupItems].sort(
          (a, b) => keyOf(b) - keyOf(a) || publishedMs(b) - publishedMs(a),
        );
        return {
          did,
          items: sorted,
          newCount: sorted.filter((item) => {
            const published = publishedMs(item);
            return published > 0 && now - published < NEW_WINDOW_MS;
          }).length,
          recordings: sorted.reduce((sum, item) => sum + item.soundscape.sources.length, 0),
          lastPublished: Math.max(0, ...sorted.map(publishedMs)),
          latest: Math.max(0, ...sorted.map(keyOf)),
        };
      })
      .sort((a, b) => b.latest - a.latest);
  }, [items, now, profiles, projectFilter, query, sort]);

  /** Soundscape groups and upload groups, interleaved newest-first. */
  const entries = useMemo<GalleryEntry[]>(() => {
    const needle = query.trim().toLowerCase();
    const uploadEntries: GalleryEntry[] = audioProjects.flatMap((audio) => {
      if (projectFilter !== "all" && audio.project.did !== projectFilter) return [];
      if (needle) {
        const haystack = [audio.project.title, audio.project.shortDescription, audio.organizationName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return [];
      }
      return [{ kind: "uploads", key: audio.project.atUri, latest: uploadedMs(audio), audio }];
    });

    return [
      ...groups.map((group): GalleryEntry => ({ kind: "soundscapes", key: group.did, latest: group.latest, group })),
      ...uploadEntries,
    ].sort((a, b) => b.latest - a.latest);
  }, [audioProjects, groups, projectFilter, query]);

  /** The shared key can only quote one frequency ceiling; use the one most of
   *  the gallery was published with (AudioMoth's usual 48 kHz sampling gives
   *  24 kHz). A card with a different ceiling still tells its exact story on
   *  its permalink. */
  const keyCeilingHz = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of items) {
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

  const toggleExpanded = useCallback((did: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(did)) next.delete(did);
      else next.add(did);
      return next;
    });
  }, []);

  if (items.length === 0 && audioProjects.length === 0) {
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
    <div className="mt-5 flex flex-col gap-6">
      {/* Search · project filter · sort */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex h-10 min-w-52 flex-1 basis-64 items-center rounded-full border border-input bg-background/50 shadow-xs backdrop-blur transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <SearchIcon className="ml-3 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="min-w-0 flex-1 truncate border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <SelectPill value={projectFilter} onChange={setProjectFilter} ariaLabel={t("filterByProject")}>
          <option value="all">{t("allProjects")}</option>
          {projectOptions.map((option) => (
            <option key={option.did} value={option.did}>
              {option.name}
            </option>
          ))}
        </SelectPill>
        <SelectPill
          value={sort}
          onChange={(value) => setSort(value as SortKey)}
          ariaLabel={t("sortBy")}
          className="sm:ml-auto"
        >
          <option value="added">{t("sortRecentlyAdded")}</option>
          <option value="recorded">{t("sortRecentlyRecorded")}</option>
        </SelectPill>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t("noMatches")}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setQuery("");
              setProjectFilter("all");
            }}
          >
            {t("clearFilters")}
          </Button>
        </div>
      ) : (
        entries.map((entry) => {
          if (entry.kind === "uploads") {
            return <AudioUploadGroup key={entry.key} item={entry.audio} />;
          }

          const group = entry.group;
          const profile = profiles[group.did];
          const name = profile?.displayName ?? profile?.handle ?? null;
          const href = accountHref(profile?.handle ?? group.did);
          const mono = monogram(profile?.handle ?? null, group.did);
          const isExpanded = expanded.has(group.did);
          const visible = isExpanded ? group.items : group.items.slice(0, INITIAL_VISIBLE);
          const hiddenCount = group.items.length - visible.length;
          const lastPublishedLabel = formatWhen(group.lastPublished, locale);

          return (
            <section key={entry.key} className="flex flex-col gap-4 border-t border-border/60 pt-6">
              {/* Project header: who recorded these, and where to hear more */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <Link
                  href={href}
                  className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-border bg-muted"
                >
                  {profile?.avatar ? (
                    <Image
                      src={profile.avatar}
                      alt=""
                      fill
                      sizes="44px"
                      unoptimized={!isPdsBlobUrl(profile.avatar)}
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
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="min-w-0 truncate text-lg font-medium text-foreground">
                      <Link href={href} className="hover:underline">
                        {name ?? "…"}
                      </Link>
                    </h2>
                    {group.newCount > 0 ? (
                      <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {t("newCount", { count: group.newCount })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    {t("groupMeta", { soundscapes: group.items.length, recordings: group.recordings })}
                    {lastPublishedLabel ? <> · {t("lastPublished", { when: lastPublishedLabel })}</> : null}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={href}>
                    {t("openProject")}
                    <ArrowUpRightIcon className="size-3.5" />
                  </Link>
                </Button>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {visible.map((item) => {
                  const published = publishedMs(item);
                  const isNew = published > 0 && now - published < NEW_WINDOW_MS;
                  const whenLabel = formatWhen(published, locale);
                  return (
                    <article key={item.uri} className="flex min-w-0 flex-col gap-1.5">
                      {/* Published time up top; the recorded dates live on the dial. */}
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 px-1">
                        {isNew ? (
                          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-px text-[11px] font-medium text-primary">
                            {t("newPill")}
                          </span>
                        ) : null}
                        {whenLabel ? (
                          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            {whenLabel}
                          </span>
                        ) : null}
                        {item.soundscape.title ? (
                          <h3 className="w-full truncate text-[15px] font-medium text-foreground">
                            {item.soundscape.title}
                          </h3>
                        ) : null}
                      </div>
                      <SoundscapeCard
                        soundscape={item.soundscape}
                        href={soundscapeHref(item.did, item.rkey)}
                        legend={false}
                        className="flex-1"
                      />
                    </article>
                  );
                })}
              </div>

              {hiddenCount > 0 || isExpanded ? (
                <button
                  type="button"
                  onClick={() => toggleExpanded(group.did)}
                  className="self-center rounded-full border border-border bg-background px-5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {isExpanded ? t("showFewer") : t("showMoreFromProject", { count: hiddenCount })}
                </button>
              ) : null}
            </section>
          );
        })
      )}

      {/* One voice-group key for the whole page, instead of one per dial */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-border/60 pt-5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t("voiceKeyTitle")}
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
    </div>
  );
}
