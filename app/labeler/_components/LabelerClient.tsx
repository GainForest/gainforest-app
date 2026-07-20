"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowUpRightIcon,
  AudioLinesIcon,
  CheckCircle2Icon,
  FilterIcon,
  LeafIcon,
  Loader2Icon,
  LockIcon,
  MapPinIcon,
  MicroscopeIcon,
  SearchIcon,
} from "lucide-react";
import { AuthModal } from "@/app/_components/AuthFlow";
import { createFeedComment } from "@/app/(manage)/manage/_lib/mutations";
import { formatDate } from "@/app/_lib/format";
import {
  walkOccurrences,
  type OccurrenceRecord,
  type OccurrenceWalkResult,
} from "@/app/_lib/indexer";
import { isPdsBlobUrl, resolveBlobUrl } from "@/app/_lib/pds";
import { formatSpeciesSuggestion } from "@/app/_lib/species-suggestions";
import { localObservationHref } from "@/app/_lib/urls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";

type QueueMode = "unidentified" | "recent";
type MediaMode = "all" | "image" | "audio";

function isUnidentified(record: OccurrenceRecord): boolean {
  return !record.scientificName &&
    (!record.vernacularName || record.vernacularName === "Nature sound recording");
}

function observationName(record: OccurrenceRecord, unidentified: string): string {
  return record.vernacularName === "Nature sound recording" && !record.scientificName
    ? unidentified
    : record.vernacularName || record.scientificName || unidentified;
}

export function LabelerClient({
  initialPage,
  viewerDid,
}: {
  initialPage: OccurrenceWalkResult;
  viewerDid: string | null;
}) {
  const t = useTranslations("marketplace.labeler");
  const [records, setRecords] = useState(initialPage.records);
  const [cursor, setCursor] = useState(initialPage.cursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [mode, setMode] = useState<QueueMode>("unidentified");
  const [media, setMedia] = useState<MediaMode>("all");
  const [taxon, setTaxon] = useState("all");
  const [genus, setGenus] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedUri, setSelectedUri] = useState(initialPage.records[0]?.atUri ?? null);
  const [loadingMore, setLoadingMore] = useState(false);

  const taxa = useMemo(
    () => [...new Set(records.map((record) => record.kingdom).filter((value): value is string => Boolean(value)))].sort(),
    [records],
  );
  const genera = useMemo(
    () => [...new Set(records.map((record) => record.genus).filter((value): value is string => Boolean(value)))].sort(),
    [records],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (mode === "unidentified" && !isUnidentified(record)) return false;
      if (media !== "all" && !record.media.includes(media)) return false;
      if (taxon !== "all" && record.kingdom !== taxon) return false;
      if (genus !== "all" && record.genus !== genus) return false;
      if (!needle) return true;
      return [
        record.scientificName,
        record.vernacularName,
        record.kingdom,
        record.family,
        record.genus,
        record.locality,
        record.country,
        record.habitat,
      ].some((value) => value?.toLocaleLowerCase().includes(needle));
    });
  }, [records, mode, media, taxon, genus, query]);

  useEffect(() => {
    if (!filtered.some((record) => record.atUri === selectedUri)) {
      setSelectedUri(filtered[0]?.atUri ?? null);
    }
  }, [filtered, selectedUri]);

  const selected = filtered.find((record) => record.atUri === selectedUri) ?? null;

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await walkOccurrences({
        media: "all",
        target: 72,
        after: cursor,
        resolveMedia: false,
      });
      setRecords((current) => {
        const seen = new Map(current.map((record) => [record.atUri, record]));
        for (const record of page.records) seen.set(record.atUri, record);
        return [...seen.values()];
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="min-h-full bg-background pb-16">
      <section className="border-b border-border-soft bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_48%)]">
        <div className="mx-auto max-w-[1480px] px-5 py-9 sm:px-7 lg:px-10">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <MicroscopeIcon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">{t("eyebrow")}</p>
              <h1 className="mt-1 font-instrument text-4xl italic tracking-tight text-foreground sm:text-5xl">{t("title")}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{t("description")}</p>
            </div>
          </div>

          <div className="mt-7 grid gap-3 rounded-2xl border border-border-soft bg-background/80 p-3 shadow-sm backdrop-blur md:grid-cols-[1fr_170px_170px_150px]">
            <label className="relative">
              <span className="sr-only">{t("filters.searchLabel")}</span>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("filters.searchPlaceholder")}
                className="pl-9"
              />
            </label>
            <FilterSelect label={t("filters.taxonLabel")} value={taxon} onChange={setTaxon}>
              <option value="all">{t("filters.allTaxa")}</option>
              {taxa.map((value) => <option key={value} value={value}>{value}</option>)}
            </FilterSelect>
            <FilterSelect label={t("filters.genusLabel")} value={genus} onChange={setGenus}>
              <option value="all">{t("filters.allGenera")}</option>
              {genera.map((value) => <option key={value} value={value}>{value}</option>)}
            </FilterSelect>
            <FilterSelect label={t("filters.mediaLabel")} value={media} onChange={(value) => setMedia(value as MediaMode)}>
              <option value="all">{t("filters.allMedia")}</option>
              <option value="image">{t("filters.photos")}</option>
              <option value="audio">{t("filters.audio")}</option>
            </FilterSelect>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1480px] px-5 py-6 sm:px-7 lg:px-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-border bg-muted/50 p-1">
            <QueueButton active={mode === "unidentified"} onClick={() => setMode("unidentified")}>
              {t("queue.unidentified")}
            </QueueButton>
            <QueueButton active={mode === "recent"} onClick={() => setMode("recent")}>
              {t("queue.recent")}
            </QueueButton>
          </div>
          <p className="text-sm text-muted-foreground">{t("queue.count", { count: filtered.length })}</p>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section aria-label={t("queue.ariaLabel")}>
            {filtered.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {filtered.map((record) => (
                  <ObservationQueueCard
                    key={record.atUri}
                    record={record}
                    selected={record.atUri === selectedUri}
                    unidentifiedLabel={t("unidentified")}
                    onSelect={() => setSelectedUri(record.atUri)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-border bg-muted/20 px-6 text-center">
                <div>
                  <LeafIcon className="mx-auto size-7 text-primary/60" aria-hidden />
                  <p className="mt-3 font-medium text-foreground">{t("empty.title")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("empty.description")}</p>
                </div>
              </div>
            )}
            {hasMore ? (
              <Button type="button" variant="outline" className="mt-5 w-full" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
                {loadingMore ? t("queue.loading") : t("queue.loadMore")}
              </Button>
            ) : null}
          </section>

          <aside className="xl:sticky xl:top-5">
            {selected ? (
              <ObservationReviewPanel record={selected} viewerDid={viewerDid} />
            ) : (
              <div className="rounded-3xl border border-border-soft bg-card p-8 text-center text-sm text-muted-foreground">
                {t("review.selectPrompt")}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
      >
        {children}
      </select>
      <FilterIcon className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </label>
  );
}

function QueueButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function useObservationMedia(record: OccurrenceRecord) {
  const [imageUrl, setImageUrl] = useState(record.imageUrl);
  const [audioUrl, setAudioUrl] = useState(record.audioUrl);

  useEffect(() => {
    setImageUrl(record.imageUrl);
    if (record.imageUrl || !record.imageRef) return;
    const controller = new AbortController();
    resolveBlobUrl(record.did, record.imageRef, controller.signal).then(setImageUrl).catch(() => {});
    return () => controller.abort();
  }, [record.did, record.imageRef, record.imageUrl]);

  useEffect(() => {
    setAudioUrl(record.audioUrl);
    if (record.audioUrl || !record.audioRef) return;
    const controller = new AbortController();
    resolveBlobUrl(record.did, record.audioRef, controller.signal).then(setAudioUrl).catch(() => {});
    return () => controller.abort();
  }, [record.did, record.audioRef, record.audioUrl]);

  return { imageUrl, audioUrl };
}

function ObservationQueueCard({
  record,
  selected,
  unidentifiedLabel,
  onSelect,
}: {
  record: OccurrenceRecord;
  selected: boolean;
  unidentifiedLabel: string;
  onSelect: () => void;
}) {
  const { imageUrl } = useObservationMedia(record);
  const name = observationName(record, unidentifiedLabel);
  const place = record.locality || record.country;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group overflow-hidden rounded-2xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected ? "border-primary shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_18%,transparent)]" : "border-border-soft",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(max-width:640px) 50vw, (max-width:1280px) 25vw, 180px"
            unoptimized={!isPdsBlobUrl(imageUrl)}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center bg-primary/[0.06] text-primary/45">
            <AudioLinesIcon className="size-8" aria-hidden />
          </div>
        )}
        {isUnidentified(record) ? (
          <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-1 text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
            {unidentifiedLabel}
          </span>
        ) : null}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{place || formatDate(record.createdAt)}</p>
      </div>
    </button>
  );
}

function ObservationReviewPanel({ record, viewerDid }: { record: OccurrenceRecord; viewerDid: string | null }) {
  const t = useTranslations("marketplace.labeler");
  const { imageUrl, audioUrl } = useObservationMedia(record);
  const name = observationName(record, t("unidentified"));
  const place = [record.locality, record.stateProvince, record.country].filter(Boolean).join(", ");

  return (
    <div className="overflow-hidden rounded-3xl border border-border-soft bg-card shadow-sm">
      <div className="relative aspect-[16/11] bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="440px"
            unoptimized={!isPdsBlobUrl(imageUrl)}
            className="object-contain"
          />
        ) : (
          <div className="grid h-full place-items-center bg-primary/[0.06] text-primary/45">
            <AudioLinesIcon className="size-12" aria-hidden />
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">{t("review.currentIdentification")}</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">{name}</h2>
            {record.scientificName && record.vernacularName ? (
              <p className="mt-0.5 italic text-muted-foreground">{record.scientificName}</p>
            ) : null}
          </div>
          <Link
            href={localObservationHref(record.did, record.rkey)}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            aria-label={t("review.openObservation")}
          >
            <ArrowUpRightIcon className="size-4" aria-hidden />
          </Link>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-y border-border-soft py-4 text-sm">
          <Fact label={t("review.family")} value={record.family} />
          <Fact label={t("review.genus")} value={record.genus} />
          <Fact label={t("review.observer")} value={record.creatorName || t("review.communityObserver")} />
          <Fact label={t("review.observed")} value={formatDate(record.eventDate || record.createdAt)} />
        </dl>

        {place ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {place}
          </p>
        ) : null}
        {record.habitat || record.remarks ? (
          <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">{record.habitat || record.remarks}</p>
        ) : null}
        {audioUrl ? <audio controls src={audioUrl} className="mt-4 w-full" /> : null}

        <IdentificationForm key={record.atUri} record={record} viewerDid={viewerDid} />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-foreground/45">{label}</dt>
      <dd className="mt-0.5 truncate text-foreground">{value || "—"}</dd>
    </div>
  );
}

function IdentificationForm({ record, viewerDid }: { record: OccurrenceRecord; viewerDid: string | null }) {
  const t = useTranslations("marketplace.labeler.proposal");
  const { pushModal, show } = useModal();
  const [scientificName, setScientificName] = useState("");
  const [commonName, setCommonName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openSignIn() {
    pushModal({ id: "auth-modal", content: <AuthModal /> });
    show();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const scientific = scientificName.trim();
    if (!viewerDid || !scientific || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const text = formatSpeciesSuggestion(
        {
          scientificName: scientific,
          vernacularName: commonName.trim() || null,
          note: note.trim() || null,
        },
        {
          suggestion: t("recordSuggestion"),
          commonName: t("commonName"),
          note: t("noteLabel"),
        },
      );
      await createFeedComment({ text, subjectUri: record.atUri });
      setSubmitted(scientific);
      setScientificName("");
      setCommonName("");
      setNote("");
    } catch {
      setError(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl bg-primary/[0.06] p-4">
      <div className="flex items-center gap-2">
        <MicroscopeIcon className="size-4 text-primary" aria-hidden />
        <h3 className="font-semibold text-foreground">{t("title")}</h3>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("description")}</p>

      {viewerDid ? (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <Label htmlFor={`scientific-${record.rkey}`}>{t("scientificName")}</Label>
            <Input
              id={`scientific-${record.rkey}`}
              value={scientificName}
              onChange={(event) => setScientificName(event.target.value)}
              placeholder={t("scientificPlaceholder")}
              required
              maxLength={160}
              className="mt-1 bg-background"
            />
          </div>
          <div>
            <Label htmlFor={`common-${record.rkey}`}>{t("commonNameOptional")}</Label>
            <Input
              id={`common-${record.rkey}`}
              value={commonName}
              onChange={(event) => setCommonName(event.target.value)}
              placeholder={t("commonPlaceholder")}
              maxLength={160}
              className="mt-1 bg-background"
            />
          </div>
          <div>
            <Label htmlFor={`note-${record.rkey}`}>{t("noteOptional")}</Label>
            <Textarea
              id={`note-${record.rkey}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("notePlaceholder")}
              maxLength={800}
              rows={3}
              className="mt-1 resize-none bg-background"
            />
          </div>
          {submitted ? (
            <p className="flex items-start gap-2 rounded-xl bg-primary/10 px-3 py-2 text-xs leading-5 text-primary-dark">
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("success", { name: submitted })}
            </p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={!scientificName.trim() || submitting}>
            {submitting ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </form>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-background p-3">
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <LockIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {t("signInDescription")}
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={openSignIn}>
            {t("signIn")}
          </Button>
        </div>
      )}
    </section>
  );
}
