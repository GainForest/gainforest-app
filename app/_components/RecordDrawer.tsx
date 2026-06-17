"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Map as LeafletMap, Marker, TileLayer } from "leaflet";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRightIcon, CalendarRangeIcon, CheckIcon, HeartIcon, ImageOffIcon, Layers3Icon, Loader2Icon, MapPinIcon, PencilIcon, Share2Icon, Trash2Icon, UsersIcon, XIcon } from "lucide-react";
import {
  fetchRecordByUri,
  fetchRecordDetail,
  type BumicertRecord,
  type ExplorerRecord,
  type RecordDetail,
  type DetailSection,
  type DetailBadge,
} from "../_lib/indexer";
import { formatCompact, formatDate, formatNumber, countryFlag, formatCountry } from "../_lib/format";
import { AuthorChip } from "./AuthorChip";
import { usePreferredDidIdentifier } from "./PreferredLinks";
import { RecordLocationMap } from "./RecordLocationMap";
import { mapTileUrl } from "../_lib/coords";
import { RichText } from "./RichText";
import { SocialGlyph, socialLabel } from "./SocialIcon";
import { RecordDrawerStatsTile } from "./StatsTile";
import { isPdsBlobUrl, resolveBlobUrl } from "../_lib/pds";
import { pauseOtherAudio } from "../_lib/audio-coordinator";
import type { AuthSession } from "../_lib/auth";
import { deleteOccurrenceCascade, updateOccurrence } from "@/app/(manage)/manage/_lib/mutations";
import {
  INDEXER_URL,
  accountHref,
  localBumicertHref,
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
  const [resolvedOccurrenceAudioUrl, setResolvedOccurrenceAudioUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [isEditingOccurrence, setIsEditingOccurrence] = useState(false);
  const [occurrenceDraft, setOccurrenceDraft] = useState<ObservationDraft>(EMPTY_OBSERVATION_DRAFT);
  const [occurrenceFeedback, setOccurrenceFeedback] = useState<string | null>(null);
  const [savingOccurrence, setSavingOccurrence] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingOccurrence, setDeletingOccurrence] = useState(false);
  const [projectBumicerts, setProjectBumicerts] = useState<BumicertRecord[] | null>(null);
  const t = useTranslations("marketplace.recordDrawer");
  // Whether this Bumicert is currently accepting donations — drives the Donate
  // button. `null` while we don't yet know (loading / non-bumicert).
  const [donatable, setDonatable] = useState<boolean | null>(null);
  const recordIdentity = record?.atUri ?? null;
  useEffect(() => {
    setImgError(false);
    setResolvedOccurrenceImageUrl(null);
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
    return () => {
      cancelled = true;
    };
  }, [record]);

  const preferredOwnerIdentifier = usePreferredDidIdentifier(record?.did ?? "");

  if (!record) return null;
  const activeRecord = record;

  const title =
    record.kind === "occurrence"
      ? occurrenceDisplayName(record, t)
      : record.kind === "bumicert" || record.kind === "project"
        ? record.title
        : record.name;

  const siteBannerUrl = record.kind === "site" ? record.bannerUrl ?? (record.coverRef ? record.imageUrl : null) : null;
  const heroUrl = record.kind === "site" ? siteBannerUrl : record.kind === "occurrence" ? record.imageUrl ?? resolvedOccurrenceImageUrl : record.imageUrl;
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
  const ownerHref = accountHref(preferredOwnerIdentifier);
  const canManageOccurrence = isEditableObservationRecord(record) && authSession?.isLoggedIn === true && authSession.did === record.did;
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
      });
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

  async function handleDeleteOccurrence() {
    if (activeRecord.kind !== "occurrence" || !canManageOccurrence || deletingOccurrence) return;

    setDeletingOccurrence(true);
    setOccurrenceFeedback(null);
    try {
      await deleteOccurrenceCascade(activeRecord.rkey);
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
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
              <div className="pointer-events-auto">
                <KindBadge record={record} floating />
              </div>
              <div className="pointer-events-auto">
                <CloseButton onClose={onClose} floating />
              </div>
            </div>
          </div>
        ) : (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-soft bg-background/90 px-5 py-4 backdrop-blur-xl">
            <KindBadge record={record} />
            <CloseButton onClose={onClose} />
          </div>
        )}

        <div className={`px-6 pb-12 ${showHero ? "-mt-10" : "pt-5"}`}>
          <h2 className="relative font-instrument text-[30px] italic leading-[1.08] tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          {record.kind === "bumicert" && record.scopeTags && record.scopeTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {record.scopeTags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="inline-flex h-7 items-center rounded-full bg-muted px-3 text-[13px] font-medium text-muted-foreground"
                >
                  {formatScopeTag(tag)}
                </span>
              ))}
            </div>
          )}
          {record.kind === "occurrence" && occurrenceSecondaryName(record, t) && (
            <p className="mt-1.5 text-[14px] italic text-foreground/65">{occurrenceSecondaryName(record, t)}</p>
          )}
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
              <Link
                href={detailHref}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-border-soft bg-background px-4 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <ArrowUpRightIcon className="h-4 w-4" />
                {t("actions.view")}
              </Link>
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
            <Link
              href={ownerHref}
              className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-full border border-border-soft bg-background text-[13px] font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
            >
              {t("actions.viewProfile")}
              <ArrowUpRightIcon className="h-3.5 w-3.5" />
            </Link>
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

          {record.kind === "project" && (
            <ProjectBumicertList
              records={projectBumicerts}
              totalCount={record.bumicertCount}
              requestedCount={record.bumicertUris.length}
            />
          )}

          {record.kind === "occurrence" && canManageOccurrence && (
            <ObservationOwnerControls
              draft={occurrenceDraft}
              feedback={occurrenceFeedback}
              hasChanges={occurrenceHasChanges}
              isDeleting={deletingOccurrence}
              isEditing={isEditingOccurrence}
              isSaving={savingOccurrence}
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

          <RecordLocationMap record={record} />

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

type ObservationDraft = {
  scientificName: string;
  vernacularName: string;
  kingdom: string;
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

function ObservationOwnerControls({
  draft,
  feedback,
  hasChanges,
  isDeleting,
  isEditing,
  isSaving,
  deleteConfirmOpen,
  validationError,
  onCancelEdit,
  onChange,
  onConfirmDelete,
  onDeleteClick,
  onEditClick,
  onOpenLocationPicker,
  onSave,
  onStopDelete,
}: {
  draft: ObservationDraft;
  feedback: string | null;
  hasChanges: boolean;
  isDeleting: boolean;
  isEditing: boolean;
  isSaving: boolean;
  deleteConfirmOpen: boolean;
  validationError: string | null;
  onCancelEdit: () => void;
  onChange: (field: keyof ObservationDraft, value: string) => void;
  onConfirmDelete: () => void;
  onDeleteClick: () => void;
  onEditClick: () => void;
  onOpenLocationPicker: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onStopDelete: () => void;
}) {
  const t = useTranslations("marketplace.recordDrawer");
  const kindOptions = OBSERVATION_KIND_OPTIONS.map((value) => ({
    value,
    label: value === "Plantae" ? t("observation.kindOptions.plant") : t("observation.kindOptions.animal"),
  }));

  return (
    <div className="mt-4 rounded-2xl border border-border-soft bg-surface/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-foreground">{t("observation.ownerTitle")}</p>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {t("observation.ownerDescription")}
          </p>
        </div>
        {!isEditing ? (
          <button
            type="button"
            onClick={onEditClick}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border-soft bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <PencilIcon className="h-3.5 w-3.5" />
            {t("actions.edit")}
          </button>
        ) : null}
      </div>

      {isEditing ? (
        <form onSubmit={onSave} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label={t("observation.fields.scientificName")} value={draft.scientificName} onChange={(value) => onChange("scientificName", value)} required />
            <TextField label={t("observation.fields.vernacularName")} value={draft.vernacularName} onChange={(value) => onChange("vernacularName", value)} />
            <SelectField
              label={t("observation.fields.kind")}
              value={draft.kingdom}
              onChange={(value) => onChange("kingdom", value)}
              required
              options={kindOptions}
            />
            <TextField label={t("observation.fields.eventDate")} value={draft.eventDate} onChange={(value) => onChange("eventDate", value)} placeholder="YYYY-MM-DD" required />
            <TextField label={t("observation.fields.recordedBy")} value={draft.recordedBy} onChange={(value) => onChange("recordedBy", value)} />
            <LocationField
              latitude={draft.decimalLatitude}
              longitude={draft.decimalLongitude}
              onOpenMap={onOpenLocationPicker}
            />
            <TextField label={t("observation.fields.place")} value={draft.locality} onChange={(value) => onChange("locality", value)} />
            <TextField label={t("observation.fields.country")} value={draft.country} onChange={(value) => onChange("country", value)} />
          </div>
          <TextAreaField label={t("observation.fields.habitat")} value={draft.habitat} onChange={(value) => onChange("habitat", value)} />
          <TextAreaField label={t("observation.fields.notes")} value={draft.occurrenceRemarks} onChange={(value) => onChange("occurrenceRemarks", value)} />
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

function ObservationLocationPickerModal({
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

function observationKindFromKingdom(value: string | null | undefined): string {
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

function coordinateFromDraft(value: string): number | null {
  const number = Number(normalizeDraftValue(value));
  return Number.isFinite(number) ? number : null;
}

function formatCoordinateInput(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(6)).toString();
}

function observationDraftFromRecord(record: Extract<ExplorerRecord, { kind: "occurrence" }>): ObservationDraft {
  return {
    scientificName: record.scientificName ?? "",
    vernacularName: record.vernacularName ?? "",
    kingdom: observationKindFromKingdom(record.kingdom),
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

function observationDraftsEqual(a: ObservationDraft, b: ObservationDraft): boolean {
  return (Object.keys(a) as Array<keyof ObservationDraft>).every((field) => normalizeDraftValue(a[field]) === normalizeDraftValue(b[field]));
}

function validateObservationDraft(draft: ObservationDraft, t: RecordDrawerT): string | null {
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

function observationPatchFromDraft(draft: ObservationDraft): {
  data: {
    scientificName: string;
    vernacularName?: string;
    kingdom: string;
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

function ProjectBumicertList({
  records,
  totalCount,
  requestedCount,
}: {
  records: BumicertRecord[] | null;
  totalCount: number;
  requestedCount: number;
}) {
  const t = useTranslations("marketplace.recordDrawer.projectBumicerts");
  const loading = records === null && requestedCount > 0;
  const shownCount = records?.length ?? 0;

  return (
    <section className="mt-5 rounded-2xl border border-border-soft bg-foreground/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers3Icon className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-[13px] font-medium text-foreground">{t("title")}</h3>
        </div>
        <span className="rounded-full bg-background px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">
          {formatCompact(totalCount)}
        </span>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2" aria-label={t("loading")}>
          {Array.from({ length: Math.min(Math.max(totalCount, 1), 3) }).map((_, index) => (
            <div key={index} className="flex gap-3 rounded-2xl bg-background/70 p-2">
              <div className="h-14 w-16 shrink-0 animate-pulse rounded-xl bg-muted" />
              <div className="min-w-0 flex-1 space-y-2 py-1">
                <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-muted" />
                <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : shownCount > 0 ? (
        <div className="mt-3 space-y-2">
          {records!.map((bumicert) => (
            <Link
              key={bumicert.id}
              href={localBumicertHref(bumicert.did, bumicert.rkey)}
              className="group flex gap-3 rounded-2xl bg-background/70 p-2 transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <span className="relative h-14 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                {bumicert.imageUrl ? (
                  <Image
                    src={bumicert.imageUrl}
                    alt=""
                    fill
                    sizes="64px"
                    unoptimized={!isPdsBlobUrl(bumicert.imageUrl)}
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <span className="grid h-full place-items-center text-primary/45">
                    <Layers3Icon className="h-5 w-5" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 py-0.5">
                <span className="line-clamp-1 block font-instrument text-lg italic leading-tight text-foreground">
                  {bumicert.title}
                </span>
                {bumicert.shortDescription ? (
                  <span className="mt-1 line-clamp-2 block text-[12.5px] leading-snug text-muted-foreground">
                    {bumicert.shortDescription}
                  </span>
                ) : null}
                <span className="mt-1.5 inline-flex text-[11.5px] font-medium text-primary">
                  {t("view")}
                </span>
              </span>
            </Link>
          ))}
          {requestedCount > shownCount ? (
            <p className="px-1 pt-1 text-[12px] text-muted-foreground">
              {t("showing", { shown: shownCount, total: requestedCount })}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
          {t("empty")}
        </p>
      )}
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

function formatScopeTag(tag: string): string {
  const clean = tag.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : tag;
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
    fields.push({ label: t("fields.bumicerts"), value: formatNumber(r.bumicertCount) });
    if (r.locationUri) fields.push({ label: t("fields.projectPlace"), value: t("fields.added") });
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
