"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { OccurrenceRecord } from "@/app/_lib/indexer";
import type { AuthSession } from "@/app/_lib/auth";
import { fetchCgsGroups, type CgsGroupMembership } from "@/app/(manage)/manage/_lib/cgs";
import {
  ObservationOwnerControls,
  ObservationLocationPickerModal,
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

/**
 * Owner-only inline editor rendered straight into the sighting page — no
 * slide-over. Reuses the very same form, validation, location picker and
 * Re-run AI the explorer drawer uses, so the two stay in lockstep. Renders
 * nothing for visitors who can't manage the sighting.
 */
export function ObservationInlineEditor({
  record,
  primaryImageUrl,
  fallbackHref,
}: {
  record: OccurrenceRecord;
  primaryImageUrl: string | null;
  fallbackHref: string;
}) {
  const t = useTranslations("marketplace.recordDrawer");
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

  // Keep the draft in step with the latest server data after a refresh.
  useEffect(() => {
    if (!isEditing) setDraft(observationDraftFromRecord(record));
  }, [record, isEditing]);

  if (!canManageOccurrenceRecord(record, session, memberships)) return null;

  // Group-owned sightings write through the org repo; a personal one writes to
  // the signed-in user's own repo (no override needed).
  const role = memberships.find((group) => group.groupDid === record.did)?.role ?? null;
  const mutationOptions = role === "owner" || role === "admin" ? { repo: record.did } : undefined;

  const validationError = validateObservationDraft(draft, t);
  const hasChanges = !observationDraftsEqual(draft, observationDraftFromRecord(record));

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
    <section className="mt-8 border-t border-border-soft pt-8">
      <ObservationOwnerControls
        draft={draft}
        feedback={feedback}
        hasChanges={hasChanges}
        isDeleting={isDeleting}
        isEditing={isEditing}
        isSaving={isSaving}
        isReanalyzing={isReanalyzing}
        deleteConfirmOpen={deleteConfirmOpen}
        validationError={validationError}
        onCancelEdit={() => {
          setDraft(observationDraftFromRecord(record));
          setFeedback(null);
          setIsEditing(false);
        }}
        onChange={(field, value) => {
          setFeedback(null);
          setDraft((current) => ({ ...current, [field]: value }));
        }}
        onConfirmDelete={() => void handleDelete()}
        onDeleteClick={() => setDeleteConfirmOpen(true)}
        onEditClick={() => {
          setDeleteConfirmOpen(false);
          setIsEditing(true);
        }}
        onOpenLocationPicker={() => setLocationPickerOpen(true)}
        onReanalyze={() => void handleReanalyze()}
        onSave={(event) => void handleSave(event)}
        onStopDelete={() => setDeleteConfirmOpen(false)}
      />
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
