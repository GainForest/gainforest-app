"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Map as LeafletMap, Marker, TileLayer } from "leaflet";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRightIcon, AudioLinesIcon, CalendarRangeIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardCheckIcon, HeartIcon, ImageOffIcon, ImagesIcon, Layers3Icon, Loader2Icon, Maximize2Icon, MapPinIcon, PencilIcon, RulerIcon, Share2Icon, SparklesIcon, Trash2Icon, UsersIcon, XIcon } from "lucide-react";
import {
  fetchMeasurementsByOccurrence,
  fetchObservationMedia,
  fetchProjectImageGalleriesByDid,
  fetchRecordByUri,
  fetchRecordDetail,
  fetchTimelineAttachmentsByDid,
  summarizeObservationMeasurements,
  type BumicertRecord,
  type ExplorerRecord,
  type ObservationMeasurementFact,
  type ObservationMediaItem,
  type ProjectEvidenceCounts,
  type ProjectGalleryImage,
  type ProjectImageGallery,
  type RecordDetail,
  type DetailSection,
  type DetailBadge,
  type TimelineAttachmentItem,
} from "../_lib/indexer";
import { formatCompact, formatDate, formatNumber, formatRelative, countryFlag, formatCountry } from "../_lib/format";
import { AuthorChip } from "./AuthorChip";
import { TrustedByBadges } from "./TrustedByBadges";
import { usePreferredDidIdentifier } from "./PreferredLinks";
import { RecordLocationMap } from "./RecordLocationMap";
import { mapTileUrl } from "../_lib/coords";
import { RichText } from "./RichText";
import { SocialGlyph, socialLabel } from "./SocialIcon";
import { RecordDrawerStatsTile } from "./StatsTile";
import { ProjectEvidence } from "./ProjectEvidence";
import { RecordEngagement } from "./RecordEngagement";
import { isPdsBlobUrl, resolveBlobUrl } from "../_lib/pds";
import { pauseOtherAudio } from "../_lib/audio-coordinator";
import { formatWorkScopeTag, type WorkScopeLabels } from "../_lib/work-scope-labels";
import { cn } from "@/lib/utils";
import type { AuthSession } from "../_lib/auth";
import { fetchCgsGroups, type CgsGroupMembership } from "@/app/(manage)/manage/_lib/cgs";
import { deleteOccurrenceCascade, updateOccurrence } from "@/app/(manage)/manage/_lib/mutations";
import {
  INDEXER_URL,
  accountHref,
  localBumicertHref,
  localObservationHref,
  localProjectHref,
} from "../_lib/urls";

type RecordDrawerT = ReturnType<typeof useTranslations<"marketplace.recordDrawer">>;

// Right-side detail sheet for any explorer record. Slides in over a dimmed
// scrim; Escape or a scrim click closes it. A full-bleed hero image fades into
// the title (Instrument Serif italic, matching the explore cards), followed by
// the owner identity, structured field set for that record kind, and links to
// in-app Bumicerts pages plus external reference surfaces (Green Globe / the
// PDS sync endpoint / Bluesky).

export function RecordDrawer({
  record,
  onClose,
  onRecordUpdated,
  onRecordDeleted,
}: {
  record: ExplorerRecord | null;
  onClose: () => void;
  onRecordUpdated?: (record: ExplorerRecord) => void;
  onRecordDeleted?: (record: ExplorerRecord) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [resolvedOccurrenceImageUrl, setResolvedOccurrenceImageUrl] = useState<string | null>(null);
  // Which photo the occurrence hero carousel is showing (0-based).
  const [occurrenceImageIndex, setOccurrenceImageIndex] = useState(0);
  const [resolvedOccurrenceAudioUrl, setResolvedOccurrenceAudioUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [occurrenceMedia, setOccurrenceMedia] = useState<ObservationMediaItem[] | null>(null);
  const [occurrenceMeasurements, setOccurrenceMeasurements] = useState<ObservationMeasurementFact[]>([]);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [groupMemberships, setGroupMemberships] = useState<CgsGroupMembership[]>([]);
  const [isEditingOccurrence, setIsEditingOccurrence] = useState(false);
  const [occurrenceDraft, setOccurrenceDraft] = useState<ObservationDraft>(EMPTY_OBSERVATION_DRAFT);
  const [occurrenceFeedback, setOccurrenceFeedback] = useState<string | null>(null);
  const [savingOccurrence, setSavingOccurrence] = useState(false);
  const [reanalyzingOccurrence, setReanalyzingOccurrence] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingOccurrence, setDeletingOccurrence] = useState(false);
  const [projectBumicerts, setProjectBumicerts] = useState<BumicertRecord[] | null>(null);
  const [projectUpdates, setProjectUpdates] = useState<TimelineAttachmentItem[] | null>(null);
  const [projectGalleries, setProjectGalleries] = useState<ProjectImageGallery[] | null>(null);
  const t = useTranslations("marketplace.recordDrawer");
  const workScopeT = useTranslations("common.workScopes");
  const workScopeLabels: WorkScopeLabels = useMemo(() => ({
    reforestation: workScopeT("reforestation"),
    forest_protection: workScopeT("forestProtection"),
    biodiversity_monitoring: workScopeT("natureMonitoring"),
    community_stewardship: workScopeT("communityStewardship"),
    carbon_removal: workScopeT("carbonRemoval"),
    restoration_maintenance: workScopeT("restorationMaintenance"),
  }), [workScopeT]);
  // Whether this Bumicert is currently accepting donations — drives the Donate
  // button. `null` while we don't yet know (loading / non-bumicert).
  const [donatable, setDonatable] = useState<boolean | null>(null);
  const recordIdentity = record?.atUri ?? null;
  useEffect(() => {
    setImgError(false);
    setResolvedOccurrenceImageUrl(null);
    setOccurrenceImageIndex(0);
    if (!record || record.kind !== "occurrence" || record.imageUrl || !record.imageRef) return;

    const ctrl = new AbortController();
    resolveBlobUrl(record.did, record.imageRef, ctrl.signal)
      .then((url) => setResolvedOccurrenceImageUrl(url))
      .catch(() => {});
    return () => ctrl.abort();
  }, [record]);

  useEffect(() => {
    setResolvedOccurrenceAudioUrl(null);
    if (!record || record.kind !== "occurrence") return;
    if (record.audioUrl) {
      setResolvedOccurrenceAudioUrl(record.audioUrl);
      return;
    }
    if (!record.audioRef) return;

    const ctrl = new AbortController();
    resolveBlobUrl(record.did, record.audioRef, ctrl.signal)
      .then((url) => setResolvedOccurrenceAudioUrl(url))
      .catch(() => {});
    return () => ctrl.abort();
  }, [record]);

  useEffect(() => {
    setDonatable(null);
    if (!record || record.kind !== "bumicert") return;
    const ctrl = new AbortController();
    fetchDonationsOpen(record.did, record.rkey, ctrl.signal)
      .then((open) => setDonatable(open))
      .catch(() => {});
    return () => ctrl.abort();
  }, [record]);
  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (locationPickerOpen) {
        setLocationPickerOpen(false);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [record, onClose, locationPickerOpen]);

  // Fetch the full, drawer-ready detail for the opened record. The list query
  // stays lean (1000 records); the deep field set is pulled per record here.
  useEffect(() => {
    setDetail(null);
    if (!record) return;
    const ctrl = new AbortController();
    fetchRecordDetail(record.atUri, ctrl.signal)
      .then((d) => setDetail(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [record]);

  useEffect(() => {
    setOccurrenceMedia(null);
    if (!record || record.kind !== "occurrence") return;
    const ctrl = new AbortController();
    fetchObservationMedia(record.did, record.atUri, ctrl.signal)
      .then((items) => setOccurrenceMedia(items))
      .catch(() => setOccurrenceMedia([]));
    return () => ctrl.abort();
  }, [record]);

  useEffect(() => {
    setOccurrenceMeasurements([]);
    if (!record || record.kind !== "occurrence") return;
    const ctrl = new AbortController();
    fetchMeasurementsByOccurrence(record.atUri, ctrl.signal)
      .then((items) => setOccurrenceMeasurements(summarizeObservationMeasurements(items)))
      .catch(() => setOccurrenceMeasurements([]));
    return () => ctrl.abort();
  }, [record]);

  useEffect(() => {
    setProjectBumicerts(null);
    if (!record || record.kind !== "project") return;
    if (record.bumicertUris.length === 0) {
      setProjectBumicerts([]);
      return;
    }

    const ctrl = new AbortController();
    Promise.all(
      record.bumicertUris.slice(0, 50).map((uri) =>
        fetchRecordByUri(uri, ctrl.signal).catch(() => null),
      ),
    )
      .then((linkedRecords) => {
        if (ctrl.signal.aborted) return;
        setProjectBumicerts(
          linkedRecords.filter((linkedRecord): linkedRecord is BumicertRecord => linkedRecord?.kind === "bumicert"),
        );
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setProjectBumicerts([]);
      });
    return () => ctrl.abort();
  }, [record]);

  // Latest evidence/updates pinned to the project (collection) or its single
  // Cert — surfaced in the drawer the same way the project page's at-a-glance
  // sidebar shows them. Skip the (heavy) fetch when card metadata already tells
  // us the project has no timeline evidence.
  useEffect(() => {
    setProjectUpdates(null);
    if (!record || record.kind !== "project") return;
    if (record.evidence && record.evidence.timeline <= 0) {
      setProjectUpdates([]);
      return;
    }

    const ctrl = new AbortController();
    const matchUris = new Set([record.atUri, ...record.bumicertUris]);
    fetchTimelineAttachmentsByDid(record.did, ctrl.signal)
      .then((items) => {
        if (ctrl.signal.aborted) return;
        const entries = items
          .filter((item) => {
            const uri = item.record.subjects?.[0]?.uri;
            return Boolean(uri && matchUris.has(uri));
          })
          .sort((a, b) =>
            (b.record.createdAt ?? b.metadata.createdAt ?? "").localeCompare(
              a.record.createdAt ?? a.metadata.createdAt ?? "",
            ),
          )
          .slice(0, 3);
        setProjectUpdates(entries);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setProjectUpdates([]);
      });
    return () => ctrl.abort();
  }, [record]);

  // Gallery photos shared for this project — the headline visual the explorer
  // drawer was missing. Filtered to galleries pinned to this exact project.
  useEffect(() => {
    setProjectGalleries(null);
    if (!record || record.kind !== "project") return;

    const ctrl = new AbortController();
    fetchProjectImageGalleriesByDid(record.did, ctrl.signal)
      .then((galleries) => {
        if (ctrl.signal.aborted) return;
        setProjectGalleries(galleries.filter((gallery) => gallery.projectUri === record.atUri));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setProjectGalleries([]);
      });
    return () => ctrl.abort();
  }, [record]);

  useEffect(() => {
    setIsEditingOccurrence(false);
    setOccurrenceFeedback(null);
    setDeleteConfirmOpen(false);
    setSavingOccurrence(false);
    setDeletingOccurrence(false);
    setLocationPickerOpen(false);
    setOccurrenceDraft(record?.kind === "occurrence" ? observationDraftFromRecord(record) : EMPTY_OBSERVATION_DRAFT);
  }, [recordIdentity]);

  useEffect(() => {
    setAuthSession(null);
    setGroupMemberships([]);
    if (!record || !isEditableObservationRecord(record)) return;

    let cancelled = false;
    fetch("/api/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { session?: AuthSession } | null) => {
        if (!cancelled) setAuthSession(payload?.session ?? { isLoggedIn: false });
      })
      .catch(() => {
        if (!cancelled) setAuthSession({ isLoggedIn: false });
      });
    fetchCgsGroups()
      .then((payload) => {
        if (!cancelled) setGroupMemberships(payload.groups);
      })
      .catch(() => {
        if (!cancelled) setGroupMemberships([]);
      });
    return () => {
      cancelled = true;
    };
  }, [record]);

  const preferredOwnerIdentifier = usePreferredDidIdentifier(record?.did ?? "");
  const projectGalleryImages = useMemo(
    () => (projectGalleries ?? []).flatMap((gallery) => gallery.images),
    [projectGalleries],
  );
  // Every photo on the occurrence, in order, for the arrow-navigable hero.
  // Prefer the standalone media records (the authoritative set); fall back to the
  // single primary photo when none have loaded yet.
  const occurrenceImageUrls = useMemo(() => {
    if (!record || record.kind !== "occurrence") return [] as string[];
    const fromMedia = (occurrenceMedia ?? [])
      .filter(mediaItemIsImage)
      .map((item) => item.record.accessUri)
      .filter((url): url is string => Boolean(url));
    if (fromMedia.length > 0) return fromMedia;
    const fallback = record.imageUrl ?? resolvedOccurrenceImageUrl;
    return fallback ? [fallback] : [];
  }, [record, occurrenceMedia, resolvedOccurrenceImageUrl]);
  const occurrenceImageCount = occurrenceImageUrls.length;
  const activeOccurrenceImage = occurrenceImageCount > 0
    ? Math.min(occurrenceImageIndex, occurrenceImageCount - 1)
    : 0;

  // Arrow keys flip the occurrence hero between photos (outside the editor /
  // form fields), mirroring the full observation page.
  useEffect(() => {
    if (occurrenceImageCount <= 1) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setImgError(false);
        setOccurrenceImageIndex((index) => (index + 1) % occurrenceImageCount);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setImgError(false);
        setOccurrenceImageIndex((index) => (index - 1 + occurrenceImageCount) % occurrenceImageCount);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [occurrenceImageCount]);

  if (!record) return null;
  const activeRecord = record;

  const title =
    record.kind === "occurrence"
      ? occurrenceDisplayName(record, t)
      : record.kind === "bumicert" || record.kind === "project"
        ? record.title
        : record.name;

  const siteBannerUrl = record.kind === "site" ? record.bannerUrl ?? (record.coverRef ? record.imageUrl : null) : null;
  const heroUrl = record.kind === "site"
    ? siteBannerUrl
    : record.kind === "occurrence"
      ? occurrenceImageUrls[activeOccurrenceImage] ?? record.imageUrl ?? resolvedOccurrenceImageUrl
      : record.imageUrl;
  const occurrenceAudioUrl = record.kind === "occurrence" ? record.audioUrl ?? resolvedOccurrenceAudioUrl : null;
  const hasOccurrenceAudio = record.kind === "occurrence" && Boolean(record.audioRef || record.audioUrl);
  const ownerAvatarOverride = record.kind === "site" ? record.avatarUrl ?? (!record.coverRef && record.logoRef ? record.imageUrl : null) : undefined;
  const ownerAvatarRefOverride = record.kind === "bumicert" || record.kind === "occurrence" || record.kind === "project" ? record.creatorAvatarRef : record.kind === "site" ? record.logoRef : null;
  const ownerNameOverride = record.kind === "bumicert" || record.kind === "occurrence" || record.kind === "project" ? record.creatorName : record.kind === "site" ? record.name : null;
  const hasHeroImage = Boolean(heroUrl) && !imgError;
  const showAudioHero = hasOccurrenceAudio && !hasHeroImage;
  const showHero = record.kind === "site" || hasHeroImage || showAudioHero;

  // For bumicerts the headline numbers (contributors / places / period) live in
  // the stat strip, the scope tags in the pill row, and the created date in the
  // author chip — so the server's "Claim" section and scope-tag badges would
  // only repeat them. Suppress both for that kind.
  const sections: DetailSection[] =
    record.kind === "bumicert"
      ? []
      : detail
        ? localizeDetailSections(detail.sections, t)
        : [{ title: null, fields: buildFields(record, t) }];
  const mediaBadges: DetailBadge[] =
    record.kind === "occurrence"
      ? record.media.map((m) => ({ label: mediaLabel(m, t), tone: "info" }))
      : [];
  const badges = record.kind === "bumicert" ? [] : [...(detail?.badges ?? []), ...mediaBadges];
  const detailHref = record.kind === "bumicert" ? localBumicertHref(preferredOwnerIdentifier, record.rkey) : null;
  const observationHref =
    record.kind === "occurrence" && record.atUri.includes("/app.gainforest.dwc.occurrence/")
      ? localObservationHref(preferredOwnerIdentifier, record.rkey)
      : null;
  const projectHref = record.kind === "project" ? localProjectHref(preferredOwnerIdentifier, record.rkey) : null;
  const ownerHref = accountHref(preferredOwnerIdentifier);
  const managingGroupRole = isEditableObservationRecord(record)
    ? groupMemberships.find((group) => group.groupDid === record.did)?.role ?? null
    : null;
  const canManageOccurrence = canManageOccurrenceRecord(record, authSession, groupMemberships);
  const occurrenceMutationOptions = managingGroupRole === "owner" || managingGroupRole === "admin" ? { repo: record.did } : undefined;
  const occurrenceValidationError = record.kind === "occurrence" ? validateObservationDraft(occurrenceDraft, t) : null;
  const occurrenceHasChanges = record.kind === "occurrence" && !observationDraftsEqual(occurrenceDraft, observationDraftFromRecord(record));

  async function handleSaveOccurrence(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (activeRecord.kind !== "occurrence" || !canManageOccurrence || savingOccurrence) return;

    const validationError = validateObservationDraft(occurrenceDraft, t);
    if (validationError) {
      setOccurrenceFeedback(validationError);
      return;
    }

    setSavingOccurrence(true);
    setOccurrenceFeedback(null);
    try {
      const result = await updateOccurrence({
        rkey: activeRecord.rkey,
        ...observationPatchFromDraft(occurrenceDraft),
      }, occurrenceMutationOptions);
      const nextRecord = applyObservationDraft(activeRecord, occurrenceDraft, typeof result.cid === "string" ? result.cid : activeRecord.cid);
      onRecordUpdated?.(nextRecord);
      setDetail(null);
      setIsEditingOccurrence(false);
      setOccurrenceFeedback(t("observation.saved"));
    } catch {
      setOccurrenceFeedback(t("observation.saveError"));
    } finally {
      setSavingOccurrence(false);
    }
  }

  // Re-run the AI identification on demand against the sighting's primary photo,
  // then pre-fill the species fields in the editor for the owner to accept or
  // tweak. Leaves date, location and the rest untouched — this only refreshes the
  // suggested identity. PDS blob URLs serve `access-control-allow-origin: *`, so
  // the photo can be fetched client-side and handed to the same analyze route the
  // uploader uses.
  async function handleReanalyzeOccurrence() {
    if (activeRecord.kind !== "occurrence" || !canManageOccurrence || reanalyzingOccurrence || savingOccurrence) return;
    const imageUrl = activeRecord.imageUrl ?? resolvedOccurrenceImageUrl ?? occurrenceImageUrls[0] ?? null;
    if (!imageUrl) {
      setIsEditingOccurrence(true);
      setOccurrenceFeedback(t("observation.reanalyzeNoImage"));
      return;
    }
    setReanalyzingOccurrence(true);
    setOccurrenceFeedback(null);
    try {
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error("image");
      const blob = await imageResponse.blob();
      const file = new File([blob], "observation", { type: blob.type || "image/jpeg" });
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/manage/observations/analyze", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { analysis?: Record<string, string | undefined>; error?: string };
      setIsEditingOccurrence(true);
      if (!response.ok || data.error || !data.analysis) {
        setOccurrenceFeedback(t("observation.reanalyzeError"));
        return;
      }
      const analysis = data.analysis;
      const suggestion = (analysis.scientificName ?? "").trim();
      const isUnknown = suggestion === "" || suggestion.toLowerCase() === "unidentified organism";
      if (isUnknown) {
        setOccurrenceFeedback(t("observation.reanalyzeUnsure"));
        return;
      }
      setOccurrenceDraft((current) => ({
        ...current,
        scientificName: suggestion,
        vernacularName: (analysis.vernacularName ?? "").trim() || current.vernacularName,
        kingdom: observationKindFromKingdom(analysis.kingdom) || current.kingdom,
        occurrenceRemarks: current.occurrenceRemarks || (analysis.occurrenceRemarks ?? "").trim(),
      }));
      setOccurrenceFeedback(t("observation.reanalyzeApplied"));
    } catch {
      setIsEditingOccurrence(true);
      setOccurrenceFeedback(t("observation.reanalyzeError"));
    } finally {
      setReanalyzingOccurrence(false);
    }
  }

  async function handleDeleteOccurrence() {
    if (activeRecord.kind !== "occurrence" || !canManageOccurrence || deletingOccurrence) return;

    setDeletingOccurrence(true);
    setOccurrenceFeedback(null);
    try {
      await deleteOccurrenceCascade(activeRecord.rkey, occurrenceMutationOptions);
      onRecordDeleted?.(activeRecord);
      onClose();
    } catch {
      setOccurrenceFeedback(t("observation.deleteError"));
      setDeletingOccurrence(false);
    }
  }

  // A Bumicert's short description is the single description shown in the
  // drawer; when present, suppress the long-form body so it isn't shown twice.
  const shortLead = record.kind === "bumicert" || record.kind === "project" ? record.shortDescription : null;
  const blurb = detail?.blurb ?? "";
  const showLongBody = !shortLead;

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="drawer-scrim absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="drawer-sheet thin-scroll relative flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-background shadow-[-24px_0_60px_-30px_rgba(20,30,15,0.5)]">
        {showHero ? (
          <div className="relative">
            <div className="relative aspect-[5/4] w-full overflow-hidden bg-surface-sunken">
              {hasHeroImage ? (
                <Image
                  src={heroUrl!}
                  alt={title}
                  fill
                  priority
                  sizes="480px"
                  unoptimized={!isPdsBlobUrl(heroUrl!)}
                  onError={() => setImgError(true)}
                  className="object-cover"
                />
              ) : showAudioHero ? (
                <AudioHero src={occurrenceAudioUrl} title={title} />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_28%_20%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_58%),linear-gradient(135deg,var(--muted),var(--background))]">
                  <ImageOffIcon className="size-24 text-muted-foreground opacity-50" aria-hidden="true" strokeWidth={1.25} />
                </div>
              )}
              {/* Top scrim keeps the floating controls legible; bottom fade
                  blends the image into the title that overlaps it. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-foreground/35 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/40 to-transparent" />
              {record.kind === "occurrence" && occurrenceImageCount > 1 ? (
                <HeroCarouselControls
                  index={activeOccurrenceImage}
                  count={occurrenceImageCount}
                  onPrev={() => {
                    setImgError(false);
                    setOccurrenceImageIndex((current) => (current - 1 + occurrenceImageCount) % occurrenceImageCount);
                  }}
                  onNext={() => {
                    setImgError(false);
                    setOccurrenceImageIndex((current) => (current + 1) % occurrenceImageCount);
                  }}
                />
              ) : null}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
              <div className="pointer-events-auto">
                <KindBadge record={record} floating />
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                {(observationHref ?? projectHref) ? <MaximizeButton href={(observationHref ?? projectHref)!} /> : null}
                <CloseButton onClose={onClose} floating />
              </div>
            </div>
          </div>
        ) : (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-soft bg-background/90 px-5 py-4 backdrop-blur-xl">
            <KindBadge record={record} />
            <div className="flex items-center gap-2">
              {(observationHref ?? projectHref) ? <MaximizeButton href={(observationHref ?? projectHref)!} /> : null}
              <CloseButton onClose={onClose} />
            </div>
          </div>
        )}

        <div className={`px-6 pb-12 ${showHero ? "-mt-10" : "pt-5"}`}>
          {record.kind === "site" ? <TrustedByBadges did={record.did} className="relative mb-3" variant="compact" /> : null}
          <h2 className="relative font-instrument text-[30px] italic leading-[1.08] tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          {(record.kind === "bumicert" || record.kind === "project") && record.scopeTags && record.scopeTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {record.scopeTags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="inline-flex h-7 items-center rounded-full bg-muted px-3 text-[13px] font-medium text-muted-foreground"
                >
                  {formatWorkScopeTag(tag, workScopeLabels)}
                </span>
              ))}
            </div>
          )}
          {record.kind === "occurrence" && occurrenceSecondaryName(record, t) && (
            <p className="mt-1.5 text-[14px] italic text-foreground/65">{occurrenceSecondaryName(record, t)}</p>
          )}

          {/* Open the dedicated, iNaturalist-style observation page. */}
          {observationHref && <DetailLinkRow href={observationHref} label={t("actions.viewObservation")} />}
          {/* Open the dedicated project page — kept at the top to match the
              observation and cert actions. */}
          {projectHref && <DetailLinkRow href={projectHref} label={t("actions.viewProject")} />}
          {shortLead && (
            <p className="mt-2.5 text-[14.5px] leading-[1.55] text-foreground/72">
              {shortLead}
            </p>
          )}

          {/* Primary actions — donate (only when accepting), open the full
              page, share */}
          {detailHref && (
            <div className="mt-5 flex items-center gap-2.5">
              {donatable && (
                <Link
                  href={detailHref}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-[14px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
                >
                  <HeartIcon className="h-4 w-4" />
                  {t("actions.donate")}
                </Link>
              )}
              <DetailLink href={detailHref} label={t("actions.view")} className="flex-1" />
              <ShareIconButton path={detailHref} />
            </div>
          )}

          {/* Owner identity + created date */}
          <div className="mt-5 rounded-2xl bg-foreground/[0.04] p-3.5">
            <AuthorChip
              did={record.did}
              createdAt={record.createdAt}
              avatarOverride={ownerAvatarOverride}
              avatarRefOverride={ownerAvatarRefOverride}
              nameOverride={ownerNameOverride}
            />
            {/* When the drawer record *is* an organization/person, opening
                their profile is the primary action, so keep the full button.
                For projects, observations and certs it is a secondary link —
                rendered quietly so it is not mistaken for the "View project" /
                "View observation" action above. */}
            {record.kind === "site" ? (
              <DetailLink href={ownerHref} label={t("actions.viewProfile")} className="mt-3 w-full" />
            ) : (
              <Link
                href={ownerHref}
                className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                {t("actions.viewProfile")}
                <ArrowUpRightIcon className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
            {detail?.socials && detail.socials.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {detail.socials.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    title={socialLabel(s.platform)}
                    aria-label={socialLabel(s.platform)}
                    className="grid h-9 w-9 place-items-center rounded-full border border-border-soft bg-background text-foreground/60 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  >
                    <SocialGlyph platform={s.platform} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Like + comment straight from the drawer — the same interaction as
              the feed and the full detail page. Available for sightings,
              projects and organizations (each likes its own record URI, so the
              count matches the feed). */}
          {(record.kind === "occurrence" || record.kind === "project" || record.kind === "site") && (
            <div className="mt-4 border-t border-border-soft pt-3">
              <RecordEngagement subjectUri={record.atUri} />
            </div>
          )}

          {record.kind === "project" && (
            <ProjectCertSummary
              cert={projectBumicerts?.[0] ?? null}
              loading={projectBumicerts === null && record.bumicertUris.length > 0}
              evidence={record.evidence}
            />
          )}

          {record.kind === "project" && projectGalleryImages.length > 0 && (
            <ProjectDrawerGallery images={projectGalleryImages} projectTitle={record.title} />
          )}

          {/* One interactive boundary map (the shared RecordLocationMap), placed
              inside the project flow so it doesn't render twice. */}
          {record.kind === "project" && <RecordLocationMap record={record} />}

          {record.kind === "project" && projectHref && projectUpdates && projectUpdates.length > 0 && (
            <ProjectDrawerUpdates updates={projectUpdates} projectHref={projectHref} />
          )}

          {record.kind === "occurrence" && (
            <ObservationMediaStrip
              record={record}
              media={occurrenceMedia}
              fallbackImageUrl={heroUrl}
              audioUrl={occurrenceAudioUrl}
              activeImageUrl={occurrenceImageUrls[activeOccurrenceImage] ?? null}
              onSelectImage={(url) => {
                const next = occurrenceImageUrls.indexOf(url);
                if (next >= 0) {
                  setImgError(false);
                  setOccurrenceImageIndex(next);
                }
              }}
            />
          )}

          {record.kind === "occurrence" && occurrenceMeasurements.length > 0 && (
            <ObservationMeasurementsPanel facts={occurrenceMeasurements} />
          )}

          {record.kind === "occurrence" && canManageOccurrence && (
            <ObservationOwnerControls
              draft={occurrenceDraft}
              feedback={occurrenceFeedback}
              hasChanges={occurrenceHasChanges}
              isDeleting={deletingOccurrence}
              isEditing={isEditingOccurrence}
              isSaving={savingOccurrence}
              isReanalyzing={reanalyzingOccurrence}
              deleteConfirmOpen={deleteConfirmOpen}
              validationError={occurrenceValidationError}
              onCancelEdit={() => {
                setOccurrenceDraft(observationDraftFromRecord(record));
                setOccurrenceFeedback(null);
                setIsEditingOccurrence(false);
              }}
              onChange={(field, value) => {
                setOccurrenceFeedback(null);
                setOccurrenceDraft((current) => ({ ...current, [field]: value }));
              }}
              onConfirmDelete={() => void handleDeleteOccurrence()}
              onDeleteClick={() => setDeleteConfirmOpen(true)}
              onEditClick={() => {
                setDeleteConfirmOpen(false);
                setIsEditingOccurrence(true);
              }}
              onOpenLocationPicker={() => setLocationPickerOpen(true)}
              onReanalyze={() => void handleReanalyzeOccurrence()}
              onSave={(event) => void handleSaveOccurrence(event)}
              onStopDelete={() => setDeleteConfirmOpen(false)}
            />
          )}

          {record.kind === "occurrence" && canManageOccurrence && locationPickerOpen ? (
            <ObservationLocationPickerModal
              latitude={coordinateFromDraft(occurrenceDraft.decimalLatitude)}
              longitude={coordinateFromDraft(occurrenceDraft.decimalLongitude)}
              onClose={() => setLocationPickerOpen(false)}
              onSelect={(lat, lon) => {
                setOccurrenceFeedback(null);
                setOccurrenceDraft((current) => ({
                  ...current,
                  decimalLatitude: formatCoordinateInput(lat),
                  decimalLongitude: formatCoordinateInput(lon),
                }));
                setLocationPickerOpen(false);
              }}
            />
          ) : null}

          {/* Headline numbers for a Bumicert */}
          {record.kind === "bumicert" && <BumicertStatStrip record={record} />}

          {/* Full description — rich Leaflet document, else plain text. For a
              Bumicert the short description above already covers this. */}
          {showLongBody &&
            (detail?.richBody && detail.richBody.length > 0 ? (
              <div className="mt-5">
                <RichText blocks={detail.richBody} />
              </div>
            ) : (
              blurb.trim().length > 0 && (
                <p className="mt-5 whitespace-pre-line text-[14px] leading-[1.6] text-foreground/75">
                  {blurb}
                </p>
              )
            ))}

          {/* Status + media badges */}
          {badges.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {badges.map((b, i) => (
                <Badge key={`${b.label}-${i}`} badge={b} />
              ))}
            </div>
          )}

          {/* Projects render their own map higher up; everything else here. */}
          {record.kind !== "project" && <RecordLocationMap record={record} />}

          {/* Grouped detail sections — rich once loaded, base fields meanwhile */}
          {sections.map((s, i) =>
            s.fields.length === 0 ? null : (
              <div key={s.title ?? i} className="mt-6 border-t border-border-soft pt-5">
                {s.title && (
                  <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">
                    {s.title}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                  {s.fields.map((f) => (
                    <div key={f.label} className={f.wide ? "col-span-2" : ""}>
                      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
                        {f.label}
                      </dt>
                      <dd className="mt-1 text-[14px] leading-[1.45] text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ),
          )}

        </div>
      </div>
    </div>
  );
}

// Audio / image discrimination for the standalone media records. Audio files
// (or anything that isn't clearly an image) are kept out of the photo carousel.
const MEDIA_AUDIO_EXT = /\.(?:mp3|m4a|wav|ogg|oga|flac|aac)(?:[?#]|$)/i;
const MEDIA_IMAGE_EXT = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;

function mediaItemIsImage(item: ObservationMediaItem): boolean {
  const url = item.record.accessUri;
  if (!url) return false;
  const format = (item.record.format ?? "").toLowerCase();
  if (format.startsWith("image/")) return true;
  if (format.startsWith("audio/") || format.startsWith("video/")) return false;
  if (MEDIA_AUDIO_EXT.test(url)) return false;
  return !format || MEDIA_IMAGE_EXT.test(url);
}

function HeroCarouselControls({
  index,
  count,
  onPrev,
  onNext,
}: {
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("marketplace.recordDrawer.observation");
  return (
    <>
      <button
        type="button"
        onClick={onPrev}
        aria-label={t("previousPhoto")}
        className="pointer-events-auto absolute left-3 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-foreground/45 text-background backdrop-blur-sm transition-colors hover:bg-foreground/65"
      >
        <ChevronLeftIcon className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label={t("nextPhoto")}
        className="pointer-events-auto absolute right-3 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-foreground/45 text-background backdrop-blur-sm transition-colors hover:bg-foreground/65"
      >
        <ChevronRightIcon className="size-5" aria-hidden />
      </button>
      <span className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-foreground/55 px-2.5 py-1 text-[12px] font-medium tabular-nums text-background backdrop-blur-sm">
        {index + 1} / {count}
      </span>
    </>
  );
}

function ObservationMediaStrip({
  record,
  media,
  fallbackImageUrl,
  audioUrl,
  activeImageUrl,
  onSelectImage,
}: {
  record: Extract<ExplorerRecord, { kind: "occurrence" }>;
  media: ObservationMediaItem[] | null;
  fallbackImageUrl: string | null;
  audioUrl: string | null;
  activeImageUrl?: string | null;
  onSelectImage?: (url: string) => void;
}) {
  const t = useTranslations("marketplace.recordDrawer.observation");
  const items = media ?? [];
  const fallbackItems = items.length > 0
    ? []
    : [
        ...(fallbackImageUrl ? [{ key: "fallback-image", kind: "image" as const, url: fallbackImageUrl, label: t("primaryMedia") }] : []),
        ...(audioUrl ? [{ key: "fallback-audio", kind: "audio" as const, url: audioUrl, label: t("fieldSound") }] : []),
      ];
  const count = items.length || Math.max(record.media.length, fallbackItems.length);
  if (items.length === 0 && fallbackItems.length === 0) return null;
  if (count <= 1 && fallbackItems.length <= 1) return null;

  return (
    <div className="mt-5 rounded-2xl border border-border-soft bg-surface/60 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-foreground">{t("mediaTitle")}</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
          <Layers3Icon className="h-3.5 w-3.5" aria-hidden />
          {t("mediaCount", { count })}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.length > 0 ? items.map((item) => {
          const url = item.record.accessUri;
          const selectable = Boolean(url && onSelectImage && mediaItemIsImage(item));
          return (
            <ObservationMediaThumb
              key={item.metadata.uri}
              item={item}
              active={Boolean(url && activeImageUrl && url === activeImageUrl)}
              onSelect={selectable ? () => onSelectImage?.(url!) : undefined}
            />
          );
        }) : fallbackItems.map((item) => (
          <div key={item.key} className="relative aspect-square overflow-hidden rounded-xl bg-background ring-1 ring-border-soft">
            {item.kind === "image" ? (
              <Image
                src={item.url}
                alt={item.label}
                fill
                sizes="110px"
                unoptimized={!isPdsBlobUrl(item.url)}
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-primary/10 text-primary">
                <AudioLinesIcon className="h-6 w-6" aria-hidden />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ObservationMeasurementsPanel({ facts }: { facts: ObservationMeasurementFact[] }) {
  const t = useTranslations("marketplace.measurements");
  return (
    <div className="mt-5 rounded-2xl border border-border-soft bg-surface/60 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-foreground">{t("title")}</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
          <RulerIcon className="h-3.5 w-3.5" aria-hidden />
          {t("count", { count: facts.length })}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {facts.map((fact, index) => (
          <div key={`${fact.key ?? fact.label ?? "m"}-${index}`}>
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
              {fact.key ? t(`fields.${fact.key}`) : fact.label ?? ""}
            </dt>
            <dd className="mt-1 text-[14px] leading-[1.45] text-foreground">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ObservationMediaThumb({ item, active, onSelect }: { item: ObservationMediaItem; active?: boolean; onSelect?: () => void }) {
  const t = useTranslations("marketplace.recordDrawer.observation");
  const url = item.record.accessUri;
  const isImage = mediaItemIsImage(item);
  const ringClass = active ? "ring-2 ring-primary" : "ring-1 ring-border-soft";
  const inner = url && isImage ? (
    <Image
      src={url}
      alt={item.record.caption || t("mediaThumbnail")}
      fill
      sizes="110px"
      unoptimized={!isPdsBlobUrl(url)}
      className="object-cover"
    />
  ) : (
    <div className="absolute inset-0 grid place-items-center bg-primary/10 text-primary">
      <AudioLinesIcon className="h-6 w-6" aria-hidden />
    </div>
  );
  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={item.record.caption || t("showPhoto")}
        className={`relative aspect-square overflow-hidden rounded-xl bg-background transition-[box-shadow] ${ringClass} hover:ring-2 hover:ring-primary/60`}
        title={item.record.caption ?? undefined}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={`relative aspect-square overflow-hidden rounded-xl bg-background ${ringClass}`} title={item.record.caption ?? undefined}>
      {inner}
    </div>
  );
}

export type ObservationDraft = {
  scientificName: string;
  vernacularName: string;
  kingdom: string;
  basisOfRecord: string;
  eventDate: string;
  recordedBy: string;
  decimalLatitude: string;
  decimalLongitude: string;
  locality: string;
  country: string;
  habitat: string;
  occurrenceRemarks: string;
};

const EMPTY_OBSERVATION_DRAFT: ObservationDraft = {
  scientificName: "",
  vernacularName: "",
  kingdom: "",
  basisOfRecord: "",
  eventDate: "",
  recordedBy: "",
  decimalLatitude: "",
  decimalLongitude: "",
  locality: "",
  country: "",
  habitat: "",
  occurrenceRemarks: "",
};

const OPTIONAL_OBSERVATION_FIELDS: Array<keyof ObservationDraft> = [
  "vernacularName",
  "recordedBy",
  "locality",
  "country",
  "habitat",
  "occurrenceRemarks",
];

const INPUT_CLASS = "mt-1.5 h-10 w-full rounded-xl border border-border-soft bg-background px-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10";
const TEXTAREA_CLASS = "mt-1.5 min-h-20 w-full rounded-xl border border-border-soft bg-background px-3 py-2 text-[14px] leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10";
const LABEL_CLASS = "text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45";
const OBSERVATION_KIND_OPTIONS = ["Plantae", "Animalia"] as const;
const BASIS_OF_RECORD_OPTIONS = ["HumanObservation", "MachineObservation", "PreservedSpecimen", "MaterialSample", "LivingSpecimen"] as const;

function basisOptionKey(value: string): string {
  switch (value) {
    case "MachineObservation":
      return "machine";
    case "PreservedSpecimen":
      return "preserved";
    case "MaterialSample":
      return "material";
    case "LivingSpecimen":
      return "living";
    default:
      return "human";
  }
}

// Maps a Darwin Core basisOfRecord value onto a plain-language label.
export function basisOfRecordLabel(value: string | null | undefined, t: RecordDrawerT): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (!BASIS_OF_RECORD_OPTIONS.includes(raw as (typeof BASIS_OF_RECORD_OPTIONS)[number])) return raw;
  return t(`observation.basisOptions.${basisOptionKey(raw)}`);
}

// The shared editable field set, used by both the drawer panel and the inline
// page editor so the two surfaces always offer exactly the same fields.
export function ObservationFields({
  draft,
  onChange,
  onOpenLocationPicker,
  t,
}: {
  draft: ObservationDraft;
  onChange: (field: keyof ObservationDraft, value: string) => void;
  onOpenLocationPicker: () => void;
  t: RecordDrawerT;
}) {
  const kindOptions = OBSERVATION_KIND_OPTIONS.map((value) => ({
    value,
    label: value === "Plantae" ? t("observation.kindOptions.plant") : t("observation.kindOptions.animal"),
  }));
  const basisOptions = BASIS_OF_RECORD_OPTIONS.map((value) => ({
    value,
    label: t(`observation.basisOptions.${basisOptionKey(value)}`),
  }));
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label={t("observation.fields.scientificName")} value={draft.scientificName} onChange={(value) => onChange("scientificName", value)} required />
        <TextField label={t("observation.fields.vernacularName")} value={draft.vernacularName} onChange={(value) => onChange("vernacularName", value)} />
        <SelectField label={t("observation.fields.kind")} value={draft.kingdom} onChange={(value) => onChange("kingdom", value)} required options={kindOptions} />
        <SelectField label={t("observation.fields.basisOfRecord")} value={draft.basisOfRecord} onChange={(value) => onChange("basisOfRecord", value)} options={basisOptions} />
        <TextField label={t("observation.fields.eventDate")} value={draft.eventDate} onChange={(value) => onChange("eventDate", value)} placeholder="YYYY-MM-DD" required />
        <TextField label={t("observation.fields.recordedBy")} value={draft.recordedBy} onChange={(value) => onChange("recordedBy", value)} />
        <LocationField latitude={draft.decimalLatitude} longitude={draft.decimalLongitude} onOpenMap={onOpenLocationPicker} />
        <TextField label={t("observation.fields.place")} value={draft.locality} onChange={(value) => onChange("locality", value)} />
        <TextField label={t("observation.fields.country")} value={draft.country} onChange={(value) => onChange("country", value)} />
      </div>
      <TextAreaField label={t("observation.fields.habitat")} value={draft.habitat} onChange={(value) => onChange("habitat", value)} />
      <TextAreaField label={t("observation.fields.notes")} value={draft.occurrenceRemarks} onChange={(value) => onChange("occurrenceRemarks", value)} />
    </>
  );
}

function ObservationOwnerControls({
  draft,
  feedback,
  hasChanges,
  isDeleting,
  isEditing,
  isSaving,
  isReanalyzing,
  deleteConfirmOpen,
  validationError,
  onCancelEdit,
  onChange,
  onConfirmDelete,
  onDeleteClick,
  onEditClick,
  onOpenLocationPicker,
  onReanalyze,
  onSave,
  onStopDelete,
}: {
  draft: ObservationDraft;
  feedback: string | null;
  hasChanges: boolean;
  isDeleting: boolean;
  isEditing: boolean;
  isSaving: boolean;
  isReanalyzing: boolean;
  deleteConfirmOpen: boolean;
  validationError: string | null;
  onCancelEdit: () => void;
  onChange: (field: keyof ObservationDraft, value: string) => void;
  onConfirmDelete: () => void;
  onDeleteClick: () => void;
  onEditClick: () => void;
  onOpenLocationPicker: () => void;
  onReanalyze: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onStopDelete: () => void;
}) {
  const t = useTranslations("marketplace.recordDrawer");

  return (
    <div className="mt-4 rounded-2xl border border-border-soft bg-surface/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-foreground">{t("observation.ownerTitle")}</p>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {t("observation.ownerDescription")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onReanalyze}
            disabled={isReanalyzing || isSaving}
            title={t("observation.reanalyzeHint")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-soft bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
          >
            {isReanalyzing ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <SparklesIcon className="h-3.5 w-3.5" />}
            {t("observation.reanalyze")}
          </button>
          {!isEditing ? (
            <button
              type="button"
              onClick={onEditClick}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-soft bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <PencilIcon className="h-3.5 w-3.5" />
              {t("actions.edit")}
            </button>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={onSave} className="mt-4 space-y-4">
          <ObservationFields draft={draft} onChange={onChange} onOpenLocationPicker={onOpenLocationPicker} t={t} />
          {(feedback || validationError) && (
            <p className={`text-[13px] ${validationError ? "text-destructive" : "text-muted-foreground"}`}>
              {validationError ?? feedback}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={isSaving}
              className="inline-flex h-10 items-center rounded-full border border-border-soft bg-background px-4 text-[13px] font-medium text-foreground/80 transition-colors hover:border-foreground/30 disabled:opacity-60"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSaving || !hasChanges || Boolean(validationError)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isSaving ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <CheckIcon className="h-3.5 w-3.5" />}
              {t("actions.saveChanges")}
            </button>
          </div>
        </form>
      ) : feedback ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{feedback}</p>
      ) : null}

      <div className="mt-4 border-t border-border-soft pt-4">
        {deleteConfirmOpen ? (
          <div className="rounded-xl bg-destructive/10 p-3">
            <p className="text-[13px] font-medium text-foreground">{t("observation.deleteTitle")}</p>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
              {t("observation.deleteDescription")}
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onStopDelete}
                disabled={isDeleting}
                className="inline-flex h-9 items-center rounded-full border border-border-soft bg-background px-3 text-[13px] font-medium text-foreground/80 transition-colors hover:border-foreground/30 disabled:opacity-60"
              >
                {t("observation.keep")}
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={isDeleting}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-destructive px-3 text-[13px] font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
              >
                {isDeleting ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <Trash2Icon className="h-3.5 w-3.5" />}
                {t("observation.delete")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onDeleteClick}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/25 bg-background px-3 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2Icon className="h-3.5 w-3.5" />
            {t("observation.delete")}
          </button>
        )}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "decimal";
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className={LABEL_CLASS}>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        required={required}
        className={INPUT_CLASS}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  required?: boolean;
}) {
  const t = useTranslations("marketplace.recordDrawer.observation");

  return (
    <label className="block">
      <span className={LABEL_CLASS}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className={INPUT_CLASS}
      >
        <option value="">{t("chooseOne")}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function LocationField({ latitude, longitude, onOpenMap }: { latitude: string; longitude: string; onOpenMap: () => void }) {
  const t = useTranslations("marketplace.recordDrawer.observation");
  const lat = coordinateFromDraft(latitude);
  const lon = coordinateFromDraft(longitude);
  const locationText = lat != null && lon != null
    ? `${formatCoordinateInput(lat)}, ${formatCoordinateInput(lon)}`
    : t("chooseMapLocation");

  return (
    <div className="sm:col-span-2">
      <span className={LABEL_CLASS}>{t("fields.mapLocation")}</span>
      <div className="mt-1.5 flex flex-col gap-2 rounded-xl border border-border-soft bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[13px] text-foreground/75">{locationText}</span>
        <button
          type="button"
          onClick={onOpenMap}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border-soft bg-surface px-3 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <MapPinIcon className="h-3.5 w-3.5" />
          {t("chooseOnMap")}
        </button>
      </div>
    </div>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className={LABEL_CLASS}>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className={TEXTAREA_CLASS} />
    </label>
  );
}

export function ObservationLocationPickerModal({
  latitude,
  longitude,
  onClose,
  onSelect,
}: {
  latitude: number | null;
  longitude: number | null;
  onClose: () => void;
  onSelect: (lat: number, lon: number) => void;
}) {
  const t = useTranslations("marketplace.recordDrawer");
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const selectedRef = useRef<{ lat: number; lon: number } | null>(
    latitude != null && longitude != null ? { lat: latitude, lon: longitude } : null,
  );
  const [selected, setSelected] = useState<{ lat: number; lon: number } | null>(selectedRef.current);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    tileRef.current?.setUrl(mapTileUrl(isDark));
  }, [isDark]);

  useEffect(() => {
    if (!elRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current) return;

      const initial = selectedRef.current ?? { lat: 0, lon: 0 };
      const initialZoom = selectedRef.current ? 12 : 2;
      const pinIcon = L.divIcon({
        className: "gf-pin",
        html: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const map = L.map(elRef.current, {
        worldCopyJump: true,
        minZoom: 1,
        zoomControl: true,
      }).setView([initial.lat, initial.lon], initialZoom);
      tileRef.current = L.tileLayer(mapTileUrl(document.documentElement.classList.contains("dark")), {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;

      const placeMarker = (lat: number, lon: number) => {
        markerRef.current?.remove();
        markerRef.current = L.marker([lat, lon], { icon: pinIcon }).addTo(map);
      };

      if (selectedRef.current) placeMarker(selectedRef.current.lat, selectedRef.current.lon);
      map.on("click", (event) => {
        const next = { lat: event.latlng.lat, lon: event.latlng.lng };
        placeMarker(next.lat, next.lon);
        setSelected(next);
      });
      setTimeout(() => map.invalidateSize(), 60);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center px-4 py-6" role="dialog" aria-modal="true" aria-label={t("observation.chooseMapLocationTitle")}>
      <button
        type="button"
        aria-label={t("observation.closeMapLocationChooser")}
        className="absolute inset-0 bg-foreground/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-[1] flex w-full max-w-[440px] flex-col overflow-hidden rounded-3xl border border-border-soft bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div>
            <h3 className="text-[16px] font-medium text-foreground">{t("observation.chooseMapLocationTitle")}</h3>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{t("observation.movePin")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border-soft text-foreground/70 transition-colors hover:text-foreground"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div ref={elRef} className="h-80 w-full border-y border-border-soft bg-surface-sunken" />
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground">
            {selected ? `${formatCoordinateInput(selected.lat)}, ${formatCoordinateInput(selected.lon)}` : t("observation.noMapLocation")}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-full border border-border-soft bg-background px-4 text-[13px] font-medium text-foreground/80 transition-colors hover:border-foreground/30"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => selected && onSelect(selected.lat, selected.lon)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              {t("observation.useLocation")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isEditableObservationRecord(record: ExplorerRecord): record is Extract<ExplorerRecord, { kind: "occurrence" }> {
  return record.kind === "occurrence" && record.atUri.includes("/app.gainforest.dwc.occurrence/");
}

// Shared owner/admin gate for editing a sighting, reused by the drawer and the
// full observation page so both surfaces agree on who may edit. A signed-in user
// can manage their own sighting, or any sighting owned by a group where they are
// an owner or admin.
export function canManageOccurrenceRecord(
  record: ExplorerRecord | null,
  session: AuthSession | null,
  memberships: CgsGroupMembership[],
): boolean {
  if (!record || !isEditableObservationRecord(record)) return false;
  if (session?.isLoggedIn !== true) return false;
  if (session.did === record.did) return true;
  const role = memberships.find((group) => group.groupDid === record.did)?.role ?? null;
  return role === "owner" || role === "admin";
}

export function observationKindFromKingdom(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "plantae" || normalized === "plant" || normalized === "flora") return "Plantae";
  if (normalized === "animalia" || normalized === "animal" || normalized === "fauna") return "Animalia";
  return "";
}

function observationKindLabel(value: string | null | undefined, t: RecordDrawerT): string | null {
  const kind = observationKindFromKingdom(value);
  if (kind === "Plantae") return t("observation.kindOptions.plant");
  if (kind === "Animalia") return t("observation.kindOptions.animal");
  return null;
}

export function coordinateFromDraft(value: string): number | null {
  const number = Number(normalizeDraftValue(value));
  return Number.isFinite(number) ? number : null;
}

export function formatCoordinateInput(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(6)).toString();
}

export function observationDraftFromRecord(record: Extract<ExplorerRecord, { kind: "occurrence" }>): ObservationDraft {
  return {
    scientificName: record.scientificName ?? "",
    vernacularName: record.vernacularName ?? "",
    kingdom: observationKindFromKingdom(record.kingdom),
    basisOfRecord: record.basisOfRecord ?? "",
    eventDate: record.eventDate ?? "",
    recordedBy: record.recordedBy ?? "",
    decimalLatitude: record.lat != null ? String(record.lat) : "",
    decimalLongitude: record.lon != null ? String(record.lon) : "",
    locality: record.locality ?? "",
    country: record.country ?? "",
    habitat: record.habitat ?? "",
    occurrenceRemarks: record.remarks ?? "",
  };
}

function normalizeDraftValue(value: string): string {
  return value.trim();
}

export function observationDraftsEqual(a: ObservationDraft, b: ObservationDraft): boolean {
  return (Object.keys(a) as Array<keyof ObservationDraft>).every((field) => normalizeDraftValue(a[field]) === normalizeDraftValue(b[field]));
}

export function validateObservationDraft(draft: ObservationDraft, t: RecordDrawerT): string | null {
  if (!normalizeDraftValue(draft.scientificName)) return t("observation.validation.name");
  if (!observationKindFromKingdom(draft.kingdom)) return t("observation.validation.kind");
  if (!normalizeDraftValue(draft.eventDate)) return t("observation.validation.date");

  const lat = Number(normalizeDraftValue(draft.decimalLatitude));
  const lon = Number(normalizeDraftValue(draft.decimalLongitude));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return t("observation.validation.location");
  }

  return null;
}

function optionalDraftValue(value: string): string | undefined {
  const normalized = normalizeDraftValue(value);
  return normalized ? normalized : undefined;
}

export function observationPatchFromDraft(draft: ObservationDraft): {
  data: {
    scientificName: string;
    vernacularName?: string;
    kingdom: string;
    basisOfRecord?: string;
    eventDate: string;
    recordedBy?: string;
    decimalLatitude: string;
    decimalLongitude: string;
    locality?: string;
    country?: string;
    habitat?: string;
    occurrenceRemarks?: string;
  };
  unset: string[];
} {
  const data = {
    scientificName: normalizeDraftValue(draft.scientificName),
    kingdom: observationKindFromKingdom(draft.kingdom),
    basisOfRecord: optionalDraftValue(draft.basisOfRecord),
    eventDate: normalizeDraftValue(draft.eventDate),
    decimalLatitude: normalizeDraftValue(draft.decimalLatitude),
    decimalLongitude: normalizeDraftValue(draft.decimalLongitude),
    vernacularName: optionalDraftValue(draft.vernacularName),
    recordedBy: optionalDraftValue(draft.recordedBy),
    locality: optionalDraftValue(draft.locality),
    country: optionalDraftValue(draft.country),
    habitat: optionalDraftValue(draft.habitat),
    occurrenceRemarks: optionalDraftValue(draft.occurrenceRemarks),
  };
  const unset: string[] = OPTIONAL_OBSERVATION_FIELDS.filter((field) => !optionalDraftValue(draft[field]));
  if (!optionalDraftValue(draft.occurrenceRemarks)) unset.push("fieldNotes");
  return { data, unset };
}

function applyObservationDraft(
  record: Extract<ExplorerRecord, { kind: "occurrence" }>,
  draft: ObservationDraft,
  cid: string | null,
): ExplorerRecord {
  return {
    ...record,
    cid,
    scientificName: normalizeDraftValue(draft.scientificName),
    vernacularName: optionalDraftValue(draft.vernacularName) ?? null,
    kingdom: observationKindFromKingdom(draft.kingdom) || null,
    basisOfRecord: optionalDraftValue(draft.basisOfRecord) ?? record.basisOfRecord ?? null,
    eventDate: normalizeDraftValue(draft.eventDate),
    recordedBy: optionalDraftValue(draft.recordedBy) ?? null,
    lat: Number(normalizeDraftValue(draft.decimalLatitude)),
    lon: Number(normalizeDraftValue(draft.decimalLongitude)),
    locality: optionalDraftValue(draft.locality) ?? null,
    country: optionalDraftValue(draft.country) ?? null,
    habitat: optionalDraftValue(draft.habitat) ?? null,
    remarks: optionalDraftValue(draft.occurrenceRemarks) ?? null,
  };
}

function AudioHero({ src, title }: { src: string | null; title: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const t = useTranslations("marketplace.recordDrawer");

  useEffect(() => {
    audioRef.current?.pause();
  }, [src]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  function handlePlay() {
    pauseOtherAudio(audioRef.current);
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(110%_95%_at_50%_10%,color-mix(in_oklab,var(--primary)_64%,#092014),#07170f)] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-55 [background-image:linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="relative z-[1] flex h-full flex-col justify-end px-7 pb-12 pt-16">
        {src ? (
          <audio
            ref={audioRef}
            controls
            preload="metadata"
            src={src}
            aria-label={t("audioHero", { title })}
            onPlay={handlePlay}
            className="relative z-[2] h-10 w-full accent-primary"
          />
        ) : null}
      </div>
    </div>
  );
}

function MaximizeButton({ href }: { href: string }) {
  const t = useTranslations("marketplace.recordDrawer");
  return (
    <Link
      href={href}
      aria-label={t("actions.openFullPage")}
      title={t("actions.openFullPage")}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground/70 shadow-sm backdrop-blur-md transition-colors hover:bg-background hover:text-primary"
    >
      <Maximize2Icon className="h-[15px] w-[15px]" aria-hidden />
    </Link>
  );
}

function CloseButton({ onClose, floating = false }: { onClose: () => void; floating?: boolean }) {
  const t = useTranslations("marketplace.recordDrawer");

  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={t("actions.close")}
      className={
        floating
          ? "inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground/70 shadow-sm backdrop-blur-md transition-colors hover:bg-background hover:text-foreground"
          : "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground"
      }
    >
      <XIcon className="h-[15px] w-[15px]" aria-hidden />
    </button>
  );
}

// A single, consistent "open the dedicated detail page" link shared by the
// project, observation, cert, and owner-profile actions so they all look the
// same. Pass `flex-1` (inside a share row) or `w-full` (standalone) via
// className to control width.
function DetailLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border-soft bg-background px-4 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary",
        className,
      )}
    >
      <ArrowUpRightIcon className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

function DetailLinkRow({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-5 flex items-center gap-2.5">
      <DetailLink href={href} label={label} className="flex-1" />
      <ShareIconButton path={href} />
    </div>
  );
}

function ShareIconButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("marketplace.recordDrawer");

  function handleShare() {
    const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={t("actions.copyLink")}
      title={copied ? t("actions.copied") : t("actions.copyLink")}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-soft bg-background text-foreground/60 transition-colors hover:border-primary/40 hover:text-primary"
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-primary" />
      ) : (
        <Share2Icon className="h-4 w-4" />
      )}
    </button>
  );
}

// A project owns exactly one impact certificate, and the standalone Cert page
// is being retired — so instead of listing the linked Cert as a card that opens
// another page, surface the certificate's substance directly in the project
// drawer: the headline stats (people named / places / work period) and the
// at-a-glance evidence summary (boundaries / timeline / reviews).
function ProjectCertSummary({
  cert,
  loading,
  evidence,
}: {
  cert: BumicertRecord | null;
  loading: boolean;
  evidence?: ProjectEvidenceCounts;
}) {
  const t = useTranslations("marketplace.recordDrawer");
  const hasEvidence = Boolean(evidence);
  if (!cert && !loading && !hasEvidence) return null;

  return (
    <>
      {loading ? (
        <div className="mt-5 grid grid-cols-2 gap-2.5" aria-hidden>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className={`h-[72px] animate-pulse rounded-2xl bg-muted ${index === 2 ? "col-span-2" : ""}`}
            />
          ))}
        </div>
      ) : cert ? (
        <BumicertStatStrip record={cert} />
      ) : null}

      {hasEvidence ? (
        <section className="mt-5 rounded-2xl border border-border-soft bg-foreground/[0.04] p-4">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardCheckIcon className="h-4 w-4 text-primary" aria-hidden />
            <h3 className="text-[13px] font-medium text-foreground">{t("projectEvidence.title")}</h3>
          </div>
          <ProjectEvidence
            evidence={evidence}
            className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] leading-5"
          />
        </section>
      ) : null}
    </>
  );
}

// Project photo gallery for the drawer: a tight thumbnail grid sized for the
// 480px sheet, with an in-drawer lightbox (arrow-key + swipe-free nav). The
// last visible tile collapses any overflow into a "+N" affordance.
function ProjectDrawerGallery({ images, projectTitle }: { images: ProjectGalleryImage[]; projectTitle: string }) {
  const t = useTranslations("marketplace.recordDrawer");
  const galleryT = useTranslations("common.projectGallery");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const MAX_THUMBS = 6;
  const thumbs = images.slice(0, MAX_THUMBS);
  const overflow = images.length - thumbs.length;

  useEffect(() => {
    if (activeIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.stopPropagation();
        setActiveIndex((index) => (index === null ? index : (index - 1 + images.length) % images.length));
      } else if (event.key === "ArrowRight") {
        event.stopPropagation();
        setActiveIndex((index) => (index === null ? index : (index + 1) % images.length));
      } else if (event.key === "Escape") {
        event.stopPropagation();
        setActiveIndex(null);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [activeIndex, images.length]);

  const active = activeIndex !== null ? images[activeIndex] ?? null : null;

  return (
    <section className="mt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-foreground">{t("projectGallery.title")}</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
          <ImagesIcon className="h-3.5 w-3.5" aria-hidden />
          {t("projectGallery.count", { count: images.length })}
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-1.5">
        {thumbs.map((image, index) => {
          const isOverflowTile = index === thumbs.length - 1 && overflow > 0;
          return (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={galleryT("openImage", { projectTitle })}
                className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-surface-sunken ring-1 ring-border-soft outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <Image
                  src={image.url}
                  alt={galleryT("imageAlt", { projectTitle, index: index + 1 })}
                  fill
                  sizes="150px"
                  unoptimized={!isPdsBlobUrl(image.url)}
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {isOverflowTile ? (
                  <span className="absolute inset-0 grid place-items-center bg-foreground/60 text-[15px] font-semibold text-background">
                    +{overflow}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {active ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/88 p-4"
          onClick={() => setActiveIndex(null)}
        >
          <button
            type="button"
            onClick={() => setActiveIndex(null)}
            aria-label={galleryT("closeImage")}
            className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/20"
          >
            <XIcon className="h-5 w-5" aria-hidden />
          </button>
          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex((index) => (index === null ? index : (index - 1 + images.length) % images.length));
                }}
                aria-label={galleryT("previousImage")}
                className="absolute left-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/20"
              >
                <ChevronLeftIcon className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex((index) => (index === null ? index : (index + 1) % images.length));
                }}
                aria-label={galleryT("nextImage")}
                className="absolute right-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/20"
              >
                <ChevronRightIcon className="h-5 w-5" aria-hidden />
              </button>
            </>
          ) : null}
          <div className="w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
            <div className="relative h-[78vh] w-full">
              <Image
                src={active.url}
                alt={galleryT("imageAlt", { projectTitle, index: (activeIndex ?? 0) + 1 })}
                fill
                sizes="90vw"
                unoptimized={!isPdsBlobUrl(active.url)}
                className="object-contain"
              />
            </div>
            {images.length > 1 ? (
              <p className="mt-3 text-center text-sm text-white/70">{(activeIndex ?? 0) + 1} / {images.length}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProjectDrawerUpdates({ updates, projectHref }: { updates: TimelineAttachmentItem[]; projectHref: string }) {
  const t = useTranslations("marketplace.recordDrawer");
  return (
    <section className="mt-5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-foreground">{t("projectUpdates.title")}</h3>
        <Link
          href={`${projectHref}#updates`}
          className="text-[12.5px] font-medium text-primary transition-colors hover:underline"
        >
          {t("projectUpdates.seeAll")}
        </Link>
      </div>
      <ul className="space-y-2">
        {updates.map((entry) => {
          const date = entry.record.createdAt ?? entry.metadata.createdAt;
          return (
            <li key={entry.metadata.uri ?? entry.metadata.rkey}>
              <Link
                href={`${projectHref}#updates`}
                className="group block rounded-xl border border-border-soft bg-surface p-3 transition-colors hover:border-primary/40 hover:bg-surface-sunken"
              >
                <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                  {entry.record.title?.trim() || entry.record.shortDescription?.trim() || t("projectUpdates.fallback")}
                </p>
                {date ? <p className="mt-1 text-[11px] text-muted-foreground">{formatRelative(date)}</p> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BumicertStatStrip({ record }: { record: Extract<ExplorerRecord, { kind: "bumicert" }> }) {
  const t = useTranslations("marketplace.recordDrawer.bumicertStats");
  const period = useMemo(() => {
    if (!record.startDate && !record.endDate) return null;
    const start = record.startDate ? formatDate(record.startDate) : "—";
    const end = record.endDate ? formatDate(record.endDate) : "—";
    return `${start} → ${end}`;
  }, [record.startDate, record.endDate]);

  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5">
      <RecordDrawerStatsTile
        icon={<UsersIcon />}
        value={formatCompact(record.contributorCount)}
        label={t("peopleNamed")}
      />
      <RecordDrawerStatsTile
        icon={<MapPinIcon />}
        value={formatCompact(record.locationCount)}
        label={t("locations")}
      />
      {period && (
        <RecordDrawerStatsTile
          className="col-span-2"
          icon={<CalendarRangeIcon />}
          value={period}
          label={t("workPeriod")}
          valueClassName="text-[15px] font-medium"
        />
      )}
    </div>
  );
}

const BADGE_TONE: Record<DetailBadge["tone"], string> = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  down: "bg-down/15 text-down",
  info: "bg-foreground/[0.06] text-foreground/70",
};

function Badge({ badge }: { badge: DetailBadge }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${BADGE_TONE[badge.tone]}`}
    >
      {badge.label}
    </span>
  );
}

function mediaLabel(kind: string, t: RecordDrawerT): string {
  switch (kind) {
    case "image":
      return t("media.image");
    case "audio":
      return t("media.audio");
    case "video":
      return t("media.video");
    case "spectrogram":
      return t("media.spectrogram");
    default:
      return kind;
  }
}

function occurrenceDisplayName(record: Extract<ExplorerRecord, { kind: "occurrence" }>, t: RecordDrawerT): string {
  if (record.media.includes("audio") && record.vernacularName === "Nature sound recording") {
    return record.scientificName || t("observation.natureSoundRecording");
  }
  return record.vernacularName || record.scientificName || (record.media.includes("audio") ? t("observation.natureSoundRecording") : t("observation.unidentifiedSighting"));
}

function occurrenceSecondaryName(record: Extract<ExplorerRecord, { kind: "occurrence" }>, t: RecordDrawerT): string | null {
  if (!record.vernacularName || !record.scientificName) return null;
  if (record.media.includes("audio") && record.vernacularName === "Nature sound recording") return t("observation.natureSoundRecording");
  return record.vernacularName.toLowerCase() === record.scientificName.toLowerCase()
    ? null
    : record.scientificName;
}

function KindBadge({ record, floating = false }: { record: ExplorerRecord; floating?: boolean }) {
  const t = useTranslations("marketplace.recordDrawer");
  const map = {
    occurrence: { label: t("kind.occurrence"), cls: "text-primary-dark bg-primary/10" },
    bumicert: { label: t("kind.bumicert"), cls: "text-brand-dark bg-brand/12" },
    project: { label: t("kind.project"), cls: "text-primary-dark bg-primary/10" },
    site: { label: t("kind.site"), cls: "text-foreground/70 bg-foreground/[0.06]" },
  } as const;
  const m = map[record.kind];
  const label = record.kind === "site" ? t("kind.organization") : m.label;
  const cls = floating
    ? "bg-background/80 text-foreground shadow-sm backdrop-blur-md"
    : m.cls;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

type Field = { label: string; value: string; wide?: boolean };

function localizeDetailSections(sections: DetailSection[], t: RecordDrawerT): DetailSection[] {
  return sections.map((section) => ({
    ...section,
    title: section.title ? localizeDetailLabel(section.title, t) : section.title,
    fields: section.fields.map((field) => ({ ...field, label: localizeDetailLabel(field.label, t) })),
  }));
}

function localizeDetailLabel(label: string, t: RecordDrawerT): string {
  switch (label) {
    case "Name details": return t("detailLabels.nameDetails");
    case "Scientific name": return t("observation.fields.scientificName");
    case "Common name": return t("observation.fields.vernacularName");
    case "Name rank": return t("detailLabels.nameRank");
    case "Nature group": return t("detailLabels.natureGroup");
    case "Sighting details": return t("detailLabels.sightingDetails");
    case "Sighting type": return t("detailLabels.sightingType");
    case "Count": return t("fields.count");
    case "Life stage": return t("detailLabels.lifeStage");
    case "Sex": return t("detailLabels.sex");
    case "Reproductive condition": return t("detailLabels.reproductiveCondition");
    case "Behavior": return t("detailLabels.behavior");
    case "Place": return t("observation.fields.place");
    case "Place name": return t("detailLabels.placeName");
    case "City or town": return t("detailLabels.cityOrTown");
    case "Area": return t("detailLabels.area");
    case "State / province": return t("detailLabels.stateProvince");
    case "Country": return t("fields.country");
    case "Map location": return t("fields.mapLocation");
    case "Elevation": return t("detailLabels.elevation");
    case "Habitat": return t("observation.fields.habitat");
    case "Shared details": return t("detailLabels.sharedDetails");
    case "Shared by": return t("fields.sharedBy");
    case "Observed by": return t("detailLabels.observedBy");
    case "Observed": return t("fields.observed");
    case "Named by": return t("detailLabels.namedBy");
    case "Date named": return t("detailLabels.dateNamed");
    case "Shared": return t("detailLabels.shared");
    case "Source details": return t("detailLabels.sourceDetails");
    case "Source name": return t("detailLabels.sourceName");
    case "Organization code": return t("detailLabels.organizationCode");
    case "Source group": return t("detailLabels.sourceGroup");
    case "Survey method": return t("detailLabels.surveyMethod");
    case "License": return t("detailLabels.license");
    case "Rights holder": return t("detailLabels.rightsHolder");
    case "Sighting ID": return t("detailLabels.sightingId");
    default: return label;
  }
}

function buildFields(r: ExplorerRecord, t: RecordDrawerT): Field[] {
  const fields: Field[] = [];
  if (r.kind === "occurrence") {
    if (r.family) fields.push({ label: t("fields.family"), value: r.family });
    if (r.genus) fields.push({ label: t("fields.genus"), value: r.genus });
    const observationKind = observationKindLabel(r.kingdom, t);
    if (observationKind) fields.push({ label: t("observation.fields.kind"), value: observationKind });
    if (r.basisOfRecord) fields.push({ label: t("fields.basisOfRecord"), value: r.basisOfRecord });
    if (r.individualCount != null)
      fields.push({ label: t("fields.count"), value: formatNumber(r.individualCount) });
    if (r.recordedBy) fields.push({ label: t("fields.sharedBy"), value: r.recordedBy });
    const place = [r.locality, r.country].filter(Boolean).join(", ");
    if (place)
      fields.push({
        label: t("fields.location"),
        value: `${countryFlag(r.countryCode)} ${place}`.trim(),
        wide: true,
      });
    if (r.lat != null && r.lon != null)
      fields.push({ label: t("fields.mapLocation"), value: `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`, wide: true });
    if (r.eventDate) fields.push({ label: t("fields.observed"), value: formatDate(r.eventDate) });
    if (r.media.length)
      fields.push({ label: t("fields.media"), value: r.media.map((kind) => mediaLabel(kind, t)).join(", "), wide: true });
    if (r.remarks) fields.push({ label: t("fields.remarks"), value: r.remarks, wide: true });
  } else if (r.kind === "bumicert") {
    fields.push({ label: t("fields.peopleNamed"), value: formatNumber(r.contributorCount) });
    fields.push({ label: t("fields.projectPlaces"), value: formatNumber(r.locationCount) });
    if (r.startDate) fields.push({ label: t("fields.start"), value: formatDate(r.startDate) });
    if (r.endDate) fields.push({ label: t("fields.end"), value: formatDate(r.endDate) });
  } else if (r.kind === "project") {
    // The project's single Cert is summarised inline (stats + evidence), its
    // photos in the gallery, and its place on the map — so there are no extra
    // fields worth repeating in a dl here.
  } else {
    if (r.country) fields.push({ label: t("fields.country"), value: formatCountry(r.country) });
    if (r.orgType) fields.push({ label: t("fields.type"), value: r.orgType });
  }
  return fields;
}

// Query the Bumicert's funding config to learn whether it is actively
// accepting donations. Donations are "applicable" only when a receiving wallet
// is linked and the status is open (a null status defaults to open). The
// indexer serves `access-control-allow-origin: *`, so the browser can hit it
// directly. Resolves false on any error so the Donate button stays hidden.
async function fetchDonationsOpen(did: string, rkey: string, signal: AbortSignal): Promise<boolean> {
  const uri = `at://${did}/app.gainforest.funding.config/${rkey}`;
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      query: `
        query RecordDrawerFundingConfig($uri: String!) {
          appGainforestFundingConfigByUri(uri: $uri) {
            certifiedProfileData { displayName }
            receivingWallet { ... on AppGainforestFundingConfigEvmLinkRef { uri } }
            status
          }
        }
      `,
      variables: { uri },
    }),
  });

  const json = (await response.json()) as {
    data?: {
      appGainforestFundingConfigByUri?: {
        certifiedProfileData?: { displayName?: string | null } | null;
        receivingWallet?: { uri?: string | null } | null;
        status?: string | null;
      } | null;
    };
  };

  const node = json.data?.appGainforestFundingConfigByUri;
  if (!node?.receivingWallet?.uri) return false;
  const status = node.status ?? "open";
  return status === "open";
}
