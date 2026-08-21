"use client";

/**
 * Public audio explore. Every result is rendered as a project row with the
 * same header and the same slot schema, whether the project has a published
 * soundscape, raw recordings, or both. The row owns project identity and its
 * totals; a slot owns one folder's kind, date, size and action.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, SearchIcon, WavesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AudioProject, UnattachedAudioAccount } from "@/app/_lib/audio-projects";
import { resolveDidProfile, type DidProfile } from "@/app/_lib/did-profile";
import type { NetworkSoundscape } from "@/app/_lib/soundscape-explore";
import { AudioProjectRow, type AudioRow } from "./AudioProjectRow";
import {
  dateKeysMs,
  displaySoundscapeTitle,
  publishedMs,
  recordedMs,
  rowSlots,
  rowTotals,
  sharesFolder,
  uploadedMs,
} from "./audio-row";
import { CARD_BAND_COLORS } from "@/app/soundscape/_components/SoundscapeCard";
import { FREQUENCY_BANDS, formatBandRange } from "@/lib/soundscape/analysis";
import { cn } from "@/lib/utils";

type SortKey = "added" | "recorded";

/** Dials shown per project before "Show N more from this project". */
const VISIBLE_SOUNDSCAPES = 4;

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
        className="h-full max-w-full appearance-none truncate rounded-full border border-border bg-background/50 ps-4 pe-9 text-sm font-medium text-foreground shadow-xs backdrop-blur outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
      >
        {children}
      </select>
      <ChevronDownIcon aria-hidden className="pointer-events-none absolute end-3 size-4 text-muted-foreground" />
    </span>
  );
}

type SortableProjectRow = AudioRow & {
  latestAdded: number;
  latestRecorded: number;
};

function createProjectRow(
  key: string,
  audio: AudioProject | null,
  profile: DidProfile | undefined,
): SortableProjectRow {
  return {
    key,
    project: audio?.project ?? null,
    fallbackTitle: null,
    ownerDid: audio?.project.did ?? profile?.did ?? "",
    ownerName: audio?.organizationName ?? audio?.project.creatorName ?? profile?.displayName ?? profile?.handle ?? null,
    ownerAvatar: audio?.organizationAvatarUrl ?? profile?.avatar ?? null,
    projectImage: audio?.project.imageUrl ?? null,
    recorderCount: audio?.recorderCount ?? 0,
    recordingCount: audio?.recordingCount ?? 0,
    uploads: audio?.uploads ?? [],
    soundscapes: [],
    latestAdded: 0,
    latestRecorded: 0,
  };
}

export function SoundscapeExploreGallery({
  items,
  audioProjects = [],
  unattachedAccounts = [],
}: {
  items: NetworkSoundscape[];
  /** Projects with public audio evidence, including projects that also have a soundscape. */
  audioProjects?: AudioProject[];
  /** Accounts with uploaded folders that no project points at — "(no project)" rows. */
  unattachedAccounts?: UnattachedAudioAccount[];
}) {
  const t = useTranslations("common.audiomoth.audioHub");
  const soundscapeT = useTranslations("common.soundscape");

  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("added");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const dids = useMemo(
    () => [
      ...new Set([
        ...items.map((item) => item.did),
        ...audioProjects.map((item) => item.project.did),
        ...unattachedAccounts.map((account) => account.did),
      ]),
    ],
    [audioProjects, items, unattachedAccounts],
  );
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

  const allRows = useMemo<SortableProjectRow[]>(() => {
    const byProject = new Map<string, SortableProjectRow>();
    const soundscapeProjects = new Map<string, AudioProject[]>();

    for (const audio of audioProjects) {
      const row = createProjectRow(audio.project.atUri, audio, profiles[audio.project.did]);
      byProject.set(row.key, row);
      for (const uri of audio.soundscapeUris) {
        const linked = soundscapeProjects.get(uri) ?? [];
        linked.push(audio);
        soundscapeProjects.set(uri, linked);
      }
    }

    const addSoundscape = (row: SortableProjectRow, item: NetworkSoundscape) => {
      if (row.soundscapes.some((existing) => existing.uri === item.uri)) return;
      row.soundscapes.push(item);
      row.latestAdded = Math.max(row.latestAdded, publishedMs(item));
      row.latestRecorded = Math.max(row.latestRecorded, recordedMs(item));
      if (!row.fallbackTitle) {
        row.fallbackTitle = displaySoundscapeTitle(item.soundscape.title, "") || null;
      }
    };

    for (const item of items) {
      let linked = soundscapeProjects.get(item.uri) ?? [];

      // Older soundscape attachments may not be present in the same indexer
      // page as the project. The source URI still lets us place the slot in
      // the right project when the raw upload attachment is available.
      if (linked.length === 0) {
        linked = audioProjects.filter((audio) =>
          audio.project.did === item.did &&
          audio.uploads.some((upload) => sharesFolder(item, upload)),
        );
      }

      if (linked.length === 0) {
        const profile = profiles[item.did];
        const key = `account:${item.did}`;
        const row = byProject.get(key) ?? createProjectRow(key, null, profile);
        byProject.set(key, row);
        addSoundscape(row, item);
      } else {
        for (const audio of linked) {
          const key = audio.project.atUri;
          const row = byProject.get(key) ?? createProjectRow(key, audio, profiles[audio.project.did]);
          byProject.set(key, row);
          addSoundscape(row, item);
        }
      }
    }

    // Folders nobody attached to a project join their owner's account row —
    // the same row a project-less soundscape lives in, so a dial published
    // from such a folder pairs with it instead of standing beside a twin.
    // A folder whose dial hangs in a project row is already represented
    // there; giving it a second, "(no project)" slot would double it.
    const projectLinkedRefs = new Set(
      items.flatMap((item) =>
        item.deploymentRef && (soundscapeProjects.get(item.uri) ?? []).length > 0
          ? [item.deploymentRef]
          : [],
      ),
    );
    for (const account of unattachedAccounts) {
      const uploads = account.uploads.filter(
        (upload) => !upload.deploymentRef || !projectLinkedRefs.has(upload.deploymentRef),
      );
      if (uploads.length === 0) continue;
      const key = `account:${account.did}`;
      const existing = byProject.get(key);
      const row = existing ?? createProjectRow(key, null, profiles[account.did]);
      if (!existing) byProject.set(key, row);
      row.ownerDid = row.ownerDid || account.did;
      row.ownerName = row.ownerName ?? account.organizationName;
      row.ownerAvatar = row.ownerAvatar ?? account.organizationAvatarUrl;
      row.uploads = [...row.uploads, ...uploads];
    }

    for (const row of byProject.values()) {
      row.latestAdded = Math.max(row.latestAdded, ...row.uploads.map(uploadedMs));
      row.latestRecorded = Math.max(
        row.latestRecorded,
        ...row.uploads.map((upload) => dateKeysMs(upload.recordedDates)),
      );
      // Totals are recomputed per folder rather than trusted from the upload
      // side alone, so a recorder visible only as a published soundscape is
      // still counted.
      const totals = rowTotals(row.soundscapes, row.uploads);
      row.recorderCount = totals.recorderCount;
      row.recordingCount = totals.recordingCount;
    }

    return [...byProject.values()];
  }, [audioProjects, items, profiles, unattachedAccounts]);

  const projectOptions = useMemo(
    () =>
      allRows
        .map((row) => ({
          key: row.key,
          // Rows are titled by organization, so the filter reads the same way.
          name: row.ownerName ?? row.project?.title ?? row.fallbackTitle ?? t("unknownOrganization"),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allRows, t],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...allRows]
      .filter((row) => {
        if (projectFilter !== "all" && row.key !== projectFilter) return false;
        if (!needle) return true;
        const haystack = [
          row.project?.title,
          row.project?.shortDescription,
          row.ownerName,
          row.fallbackTitle,
          ...row.soundscapes.flatMap((item) => [item.soundscape.title, item.soundscape.note]),
          ...row.uploads.flatMap((upload) => [upload.recorderName, upload.siteName, upload.title]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => {
        const left = sort === "added" ? a.latestAdded : a.latestRecorded;
        const right = sort === "added" ? b.latestAdded : b.latestRecorded;
        return right - left || (a.ownerName ?? "").localeCompare(b.ownerName ?? "");
      });
  }, [allRows, projectFilter, query, sort]);

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

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (items.length === 0 && audioProjects.length === 0 && unattachedAccounts.length === 0) {
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex h-10 min-w-52 flex-1 basis-64 items-center rounded-full border border-input bg-background/50 shadow-xs backdrop-blur transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <SearchIcon className="ms-3 size-4 shrink-0 text-muted-foreground" aria-hidden />
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
            <option key={option.key} value={option.key}>
              {option.name}
            </option>
          ))}
        </SelectPill>
        <SelectPill
          value={sort}
          onChange={(value) => setSort(value as SortKey)}
          ariaLabel={t("sortBy")}
          className="sm:ms-auto"
        >
          <option value="added">{t("sortRecentlyAdded")}</option>
          <option value="recorded">{t("sortRecentlyRecorded")}</option>
        </SelectPill>
      </div>

      {rows.length === 0 ? (
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
        rows.map((row) => {
          const slots = rowSlots(row.soundscapes, row.uploads);
          const isExpanded = expanded.has(row.key);
          // Only the dials are capped; a folder without one is a single line.
          const visible = isExpanded ? slots.soundscapes : slots.soundscapes.slice(0, VISIBLE_SOUNDSCAPES);
          return (
            <AudioProjectRow
              key={row.key}
              row={row}
              soundscapes={visible}
              recordings={slots.recordings}
              hiddenCount={slots.soundscapes.length - visible.length}
              expanded={isExpanded}
              onToggle={() => toggleExpanded(row.key)}
            />
          );
        })
      )}

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
