"use client";

/**
 * Draft persistence for the host form. Autosaves to localStorage from the
 * first keystroke; closing the page keeps a resumable draft that the events
 * page and the published confirmation both point back to. One draft at a
 * time — matching the wireframe's single "Draft · … · Continue" row.
 */

import { emptyEventForm, type EventFormState } from "./form";

const DRAFT_KEY = "gf-community-event-draft-v1";
/** Cover data URLs above this size are dropped from the stored draft rather
 *  than risking the whole write failing localStorage's quota. */
const MAX_STORED_COVER_CHARS = 1_500_000;

export type StoredEventDraft = {
  form: EventFormState;
  savedAt: string;
};

export function loadEventDraft(): StoredEventDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredEventDraft> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.savedAt !== "string" || !parsed.form) return null;
    return { form: { ...emptyEventForm(), ...parsed.form }, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function saveEventDraft(form: EventFormState): void {
  if (typeof window === "undefined") return;
  const stored: StoredEventDraft = {
    form:
      form.coverDataUrl && form.coverDataUrl.length > MAX_STORED_COVER_CHARS
        ? { ...form, coverDataUrl: null }
        : form,
    savedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(stored));
  } catch {
    // Quota exceeded — retry without the cover before giving up silently.
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...stored, form: { ...stored.form, coverDataUrl: null } }));
    } catch {
      /* draft loss is acceptable; publishing still works */
    }
  }
}

export function clearEventDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** True when the draft has anything worth resuming. */
export function draftHasContent(draft: StoredEventDraft | null): draft is StoredEventDraft {
  if (!draft) return false;
  const f = draft.form;
  return Boolean(f.name.trim() || f.date || f.description.trim() || f.placeName.trim());
}
