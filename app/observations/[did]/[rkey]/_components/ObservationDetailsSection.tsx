"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckIcon, Loader2Icon, PencilIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import type { OccurrenceRecord } from "@/app/_lib/indexer";
import type { AuthSession } from "@/app/_lib/auth";
import { formatNumber } from "@/app/_lib/format";
import { fetchCgsGroups, type CgsGroupMembership } from "@/app/(manage)/manage/_lib/cgs";
import {
  ObservationFields,
  ObservationLocationPickerModal,
  basisOfRecordLabel,
  canManageOccurrenceRecord,
  coordinateFromDraft,
  formatCoordinateInput,
  observationDraftFromRecord,
  observationDraftsEqual,
  observationKindFromKingdom,
  observationPatchFromDraft,
  validateObservationDraft,
  type ObservationDraft,
} from "@/app/_components/RecordDrawer";
import { deleteOccurrenceCascade, updateOccurrence } from "@/app/(manage)/manage/_lib/mutations";

type DetailField = { label: string; value: string; wide?: boolean };

/**
 * The sighting's Details + Notes, rendered once. Everyone sees the read view;
 * owners and group admins get an inline Edit / Re-run AI toggle that swaps the
 * read view for the very same form the explorer drawer uses (no slide-over, no
 * duplicate field list). Editing, Re-run AI and Delete all live here.
 */
export function ObservationDetailsSection({
  record,
  primaryImageUrl,
  fallbackHref,
}: {
  record: OccurrenceRecord;
  primaryImageUrl: string | null;
  fallbackHref: string;
}) {
  const t = useTranslations("marketplace.recordDrawer");
  const pageT = useTranslations("marketplace.observationPage");
  const router = useRouter();

  const [session, setSession] = useState<AuthSession | null>(null);
  const [memberships, setMemberships] = useState<CgsGroupMembership[]>([]);

  const [draft, setDraft] = useState<ObservationDraft>(() => observationDraftFromRecord(record));
  const [isEditing, setIsEditing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { session?: AuthSession } | null) => {
        if (!cancelled) setSession(payload?.session ?? { isLoggedIn: false });
      })
      .catch(() => {
        if (!cancelled) setSession({ isLoggedIn: false });
      });
    fetchCgsGroups()
      .then((payload) => {
        if (!cancelled) setMemberships(payload.groups);
      })
      .catch(() => {
        if (!cancelled) setMemberships([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-sync the draft from the latest server data whenever the read view is shown.
  useEffect(() => {
    if (!isEditing) setDraft(observationDraftFromRecord(record));
  }, [record, isEditing]);

  const canManage = canManageOccurrenceRecord(record, session, memberships);
  const role = memberships.find((group) => group.groupDid === record.did)?.role ?? null;
  const mutationOptions = role === "owner" || role === "admin" ? { repo: record.did } : undefined;

  const validationError = validateObservationDraft(draft, t);
  const hasChanges = !observationDraftsEqual(draft, observationDraftFromRecord(record));

  const readFields = useMemo<DetailField[]>(() => {
    const fields: DetailField[] = [];
    if (record.scientificName) fields.push({ label: t("observation.fields.scientificName"), value: record.scientificName });
    if (record.vernacularName && record.vernacularName.toLowerCase() !== (record.scientificName ?? "").toLowerCase()) {
      fields.push({ label: t("observation.fields.vernacularName"), value: record.vernacularName });
    }
    const kind = observationKindFromKingdom(record.kingdom);
    const kindLabel = kind === "Plantae" ? t("observation.kindOptions.plant") : kind === "Animalia" ? t("observation.kindOptions.animal") : null;
    if (kindLabel) fields.push({ label: t("observation.fields.kind"), value: kindLabel });
    const basis = basisOfRecordLabel(record.basisOfRecord, t);
    if (basis) fields.push({ label: t("observation.fields.basisOfRecord"), value: basis });
    if (record.family) fields.push({ label: t("fields.family"), value: record.family });
    if (record.genus) fields.push({ label: t("fields.genus"), value: record.genus });
    if (record.individualCount != null) fields.push({ label: t("fields.count"), value: formatNumber(record.individualCount) });
    if (record.recordedBy) fields.push({ label: t("fields.sharedBy"), value: record.recordedBy });
    if (record.habitat) fields.push({ label: t("observation.fields.habitat"), value: record.habitat, wide: true });
    if (record.lat != null && record.lon != null) {
      fields.push({ label: t("fields.mapLocation"), value: `${record.lat.toFixed(4)}, ${record.lon.toFixed(4)}` });
    }
    if (record.datasetName) fields.push({ label: t("detailLabels.sourceName"), value: record.datasetName });
    return fields;
  }, [record, t]);

  async function handleSave(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (isSaving) return;
    const error = validateObservationDraft(draft, t);
    if (error) {
      setFeedback(error);
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      await updateOccurrence({ rkey: record.rkey, ...observationPatchFromDraft(draft) }, mutationOptions);
      setIsEditing(false);
      setFeedback(t("observation.saved"));
      router.refresh();
    } catch {
      setFeedback(t("observation.saveError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      await deleteOccurrenceCascade(record.rkey, mutationOptions);
      router.replace(fallbackHref);
    } catch {
      setFeedback(t("observation.deleteError"));
      setIsDeleting(false);
    }
  }

  async function handleReanalyze() {
    if (isReanalyzing || isSaving) return;
    if (!primaryImageUrl) {
      setIsEditing(true);
      setFeedback(t("observation.reanalyzeNoImage"));
      return;
    }
    setIsReanalyzing(true);
    setFeedback(null);
    try {
      const imageResponse = await fetch(primaryImageUrl);
      if (!imageResponse.ok) throw new Error("image");
      const blob = await imageResponse.blob();
      const file = new File([blob], "observation", { type: blob.type || "image/jpeg" });
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/manage/observations/analyze", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { analysis?: Record<string, string | undefined>; error?: string };
      setIsEditing(true);
      if (!response.ok || data.error || !data.analysis) {
        setFeedback(t("observation.reanalyzeError"));
        return;
      }
      const analysis = data.analysis;
      const suggestion = (analysis.scientificName ?? "").trim();
      const isUnknown = suggestion === "" || suggestion.toLowerCase() === "unidentified organism";
      if (isUnknown) {
        setFeedback(t("observation.reanalyzeUnsure"));
        return;
      }
      setDraft((current) => ({
        ...current,
        scientificName: suggestion,
        vernacularName: (analysis.vernacularName ?? "").trim() || current.vernacularName,
        kingdom: observationKindFromKingdom(analysis.kingdom) || current.kingdom,
        occurrenceRemarks: current.occurrenceRemarks || (analysis.occurrenceRemarks ?? "").trim(),
      }));
      setFeedback(t("observation.reanalyzeApplied"));
    } catch {
      setIsEditing(true);
      setFeedback(t("observation.reanalyzeError"));
    } finally {
      setIsReanalyzing(false);
    }
  }

  return (
    <section className="mt-10 border-t border-border-soft pt-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{pageT("detailsTitle")}</h2>
        {canManage ? (
          <div className="flex items-center gap-2">
            <ToolbarButton onClick={() => void handleReanalyze()} disabled={isReanalyzing || isSaving} title={t("observation.reanalyzeHint")}>
              {isReanalyzing ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <SparklesIcon className="h-3.5 w-3.5" />}
              {t("observation.reanalyze")}
            </ToolbarButton>
            {!isEditing ? (
              <ToolbarButton onClick={() => { setDeleteConfirmOpen(false); setIsEditing(true); }}>
                <PencilIcon className="h-3.5 w-3.5" />
                {t("actions.edit")}
              </ToolbarButton>
            ) : null}
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
          <ObservationFields
            draft={draft}
            onChange={(field, value) => {
              setFeedback(null);
              setDraft((current) => ({ ...current, [field]: value }));
            }}
            onOpenLocationPicker={() => setLocationPickerOpen(true)}
            t={t}
          />
          {feedback || validationError ? (
            <p className={`text-[13px] ${validationError ? "text-destructive" : "text-muted-foreground"}`}>{validationError ?? feedback}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(observationDraftFromRecord(record));
                setFeedback(null);
                setIsEditing(false);
              }}
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
          <div className="border-t border-border-soft pt-4">
            {deleteConfirmOpen ? (
              <div className="rounded-xl bg-destructive/10 p-3">
                <p className="text-[13px] font-medium text-foreground">{t("observation.deleteTitle")}</p>
                <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{t("observation.deleteDescription")}</p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(false)}
                    disabled={isDeleting}
                    className="inline-flex h-9 items-center rounded-full border border-border-soft bg-background px-3 text-[13px] font-medium text-foreground/80 transition-colors hover:border-foreground/30 disabled:opacity-60"
                  >
                    {t("observation.keep")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
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
                onClick={() => setDeleteConfirmOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/25 bg-background px-3 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                {t("observation.delete")}
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          {readFields.length > 0 ? (
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {readFields.map((field) => (
                <div key={field.label} className={field.wide ? "sm:col-span-2 lg:col-span-3" : undefined}>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">{field.label}</dt>
                  <dd className="mt-1 text-[14.5px] leading-[1.5] text-foreground">{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {record.remarks ? (
            <div className="mt-8">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{pageT("notesTitle")}</h3>
              <p className="max-w-3xl whitespace-pre-line text-[15px] leading-[1.65] text-foreground/80">{record.remarks}</p>
            </div>
          ) : null}
          {feedback ? <p className="mt-4 text-[13px] text-muted-foreground">{feedback}</p> : null}
        </>
      )}

      {locationPickerOpen ? (
        <ObservationLocationPickerModal
          latitude={coordinateFromDraft(draft.decimalLatitude)}
          longitude={coordinateFromDraft(draft.decimalLongitude)}
          onClose={() => setLocationPickerOpen(false)}
          onSelect={(lat, lon) => {
            setFeedback(null);
            setDraft((current) => ({
              ...current,
              decimalLatitude: formatCoordinateInput(lat),
              decimalLongitude: formatCoordinateInput(lon),
            }));
            setLocationPickerOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

function ToolbarButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-soft bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
    >
      {children}
    </button>
  );
}
