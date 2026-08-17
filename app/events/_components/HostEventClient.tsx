"use client";

/**
 * /events/host — the one-page host form. Three required basics (name,
 * date/time, format+place) publish a simple event on their own; description
 * & cover, agenda and capacity are one-tap expanders that open in place. The draft autosaves from the first keystroke
 * ("Draft saved" in the header); validation runs once, on Publish, with a
 * plain-language summary and per-field messages; publishing swaps the page
 * for the "Your event is live" confirmation. `?edit=<rkey>` loads the
 * viewer's own event into the same form.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  ImageIcon,
  MapPinIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { countryEntries } from "@/app/_lib/countries";
import { eventHref, type CommunityEvent, type EventMode } from "@/app/_lib/community-events";
import { useViewer } from "@/app/_lib/viewer";
import { liveEventsAdapter, type EventsAdapter } from "../_lib/adapter";
import { clearEventDraft, draftHasContent, loadEventDraft, saveEventDraft } from "../_lib/draft";
import {
  emptyEventForm,
  eventToForm,
  validateEventForm,
  type EventFormErrors,
  type EventFormState,
} from "../_lib/form";

type SectionKey = "description" | "agenda" | "capacity";
type FieldKey = "name" | "date" | "start" | "place" | "onlineUrl";

const inputClass =
  "w-full rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none";
const inputErrorClass = "border-destructive bg-destructive/5";

export function HostEventClient({ adapter = liveEventsAdapter }: { adapter?: EventsAdapter }) {
  const t = useTranslations("events.host");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editRkey = searchParams.get("edit");
  const viewer = useViewer();
  const viewerDid = adapter.viewerDidOverride !== undefined ? adapter.viewerDidOverride : viewer.sessionDid;

  const [form, setForm] = useState<EventFormState>(emptyEventForm);
  const [hydrated, setHydrated] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CommunityEvent | null>(null);
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set());
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(false);
  const [published, setPublished] = useState<{ did: string; rkey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const confirmationRef = useRef<HTMLElement | null>(null);
  const saveTimer = useRef<number | null>(null);
  const isEditing = Boolean(editRkey);

  // Hydrate: the edit target, or the resumable draft.
  useEffect(() => {
    if (editRkey) {
      if (!viewerDid) return; // wait for the session to resolve
      let cancelled = false;
      void adapter.getEvent(viewerDid, editRkey).then((event) => {
        if (cancelled || !event) return;
        setEditingEvent(event);
        setForm(eventToForm(event));
        const open = new Set<SectionKey>();
        if (event.description || event.coverRef) open.add("description");
        if (event.agenda.length > 0) open.add("agenda");
        if (event.capacity !== null) open.add("capacity");
        setOpenSections(open);
        setHydrated(true);
      });
      return () => {
        cancelled = true;
      };
    }
    const draft = loadEventDraft();
    if (draftHasContent(draft)) {
      setForm(draft.form);
      setDraftSavedAt(draft.savedAt);
      const open = new Set<SectionKey>();
      if (draft.form.description || draft.form.coverDataUrl) open.add("description");
      if (draft.form.agenda.length > 0) open.add("agenda");
      if (draft.form.capacity) open.add("capacity");
      setOpenSections(open);
    }
    setHydrated(true);
  }, [adapter, editRkey, viewerDid]);

  // Autosave from the first keystroke (create mode only — edits are records).
  const update = useCallback(
    (patch: Partial<EventFormState>) => {
      setForm((prev) => {
        const next = { ...prev, ...patch };
        if (!isEditing) {
          if (saveTimer.current) window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => {
            saveEventDraft(next);
            setDraftSavedAt(new Date().toISOString());
          }, 400);
        }
        return next;
      });
    },
    [isEditing],
  );

  const toggleSection = useCallback((key: SectionKey) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const removeSection = useCallback(
    (key: SectionKey) => {
      setOpenSections((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (key === "description") update({ description: "", coverDataUrl: null, existingCoverRef: null });
      if (key === "agenda") update({ agenda: [] });
      if (key === "capacity") update({ capacity: "" });
    },
    [update],
  );

  const handleCover = useCallback(
    (file: File | null) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => update({ coverDataUrl: typeof reader.result === "string" ? reader.result : null, existingCoverRef: null });
      reader.readAsDataURL(file);
    },
    [update],
  );

  const handlePublish = useCallback(async () => {
    if (!viewerDid) {
      adapter.requestSignIn();
      return;
    }
    const validation = validateEventForm(form, Date.now());
    setErrors(validation);
    setPublishError(false);
    const firstError = (Object.keys(validation) as FieldKey[])[0];
    if (firstError) {
      fieldRefs.current[firstError]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setPublishing(true);
    try {
      const origin = window.location.origin;
      if (isEditing && editingEvent) {
        await adapter.update(editingEvent, form, { origin });
        router.push(eventHref(editingEvent.did, editingEvent.rkey));
        return;
      }
      const result = await adapter.publish(form, { origin, locale });
      // A debounced autosave may still be pending — cancel it so it cannot
      // resurrect the draft after we clear it.
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      clearEventDraft();
      setPublished({ did: result.did, rkey: result.rkey });
    } catch {
      setPublishError(true);
    } finally {
      setPublishing(false);
    }
  }, [adapter, editingEvent, form, isEditing, locale, router, viewerDid]);

  const handleSaveDraft = useCallback(() => {
    saveEventDraft(form);
    setDraftSavedAt(new Date().toISOString());
  }, [form]);

  // Bring the confirmation into view — the app shell scrolls an inner
  // container, so window.scrollTo would miss.
  useEffect(() => {
    if (published) confirmationRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [published]);

  // ── Published confirmation ───────────────────────────────────────────────
  if (published) {
    const pageUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${eventHref(published.did, published.rkey)}`;
    return (
      <main ref={confirmationRef} className="mx-auto w-full max-w-xl scroll-mt-20 px-4 py-12 sm:px-6">
        <div className="rounded-[2rem] border border-border-soft bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
            <CheckIcon className="size-7" aria-hidden />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-foreground">{t("confirm.title")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{t("confirm.body", { name: form.name.trim() })}</p>

          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-surface-sunken px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground">{pageUrl.replace(/^https?:\/\//, "")}</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(pageUrl).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              <CopyIcon className="size-3.5" aria-hidden />
              {copied ? t("confirm.copied") : t("confirm.copyLink")}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href={eventHref(published.did, published.rkey)} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">
              {t("confirm.viewEvent")}
            </Link>
            <button
              type="button"
              onClick={() => {
                if (navigator.share) void navigator.share({ title: form.name, url: pageUrl }).catch(() => undefined);
                else void navigator.clipboard.writeText(pageUrl);
              }}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:border-primary/50"
            >
              {t("confirm.invite")}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── The form ─────────────────────────────────────────────────────────────
  const errorCount = Object.keys(errors).length;

  const sectionCard = (key: SectionKey, title: string, hint: string, children: React.ReactNode) => {
    const open = openSections.has(key);
    if (!open) {
      return (
        <button
          type="button"
          onClick={() => toggleSection(key)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-3.5 text-left transition-colors hover:border-primary/40"
        >
          <span>
            <span className="block text-sm font-semibold text-foreground">{title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
          </span>
          <PlusIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      );
    }
    return (
      <div className="rounded-2xl border border-border-soft bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <button type="button" onClick={() => removeSection(key)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            {t("remove")}
            <XIcon className="size-3.5" aria-hidden />
          </button>
        </div>
        <div className="mt-3 space-y-3">{children}</div>
      </div>
    );
  };

  const fieldError = (key: FieldKey) =>
    errors[key] ? (
      <p className="mt-1 text-xs font-medium text-destructive" role="alert">
        {t(`errors.${errors[key]}`)}
      </p>
    ) : null;

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">{isEditing ? t("editTitle") : t("title")}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {!isEditing && draftSavedAt ? <span>{t("draftSaved")}</span> : null}
          <Link href={isEditing && editingEvent ? eventHref(editingEvent.did, editingEvent.rkey) : "/events"} className="font-medium text-foreground hover:text-primary">
            {t("close")}
          </Link>
        </div>
      </div>

      {!hydrated ? (
        <div className="mt-8 animate-pulse space-y-4">
          <div className="h-10 rounded-2xl bg-muted" />
          <div className="h-10 rounded-2xl bg-muted" />
          <div className="h-24 rounded-2xl bg-muted" />
        </div>
      ) : (
        <form
          className="mt-6 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void handlePublish();
          }}
        >
          {errorCount > 0 ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3" role="alert">
              <p className="text-sm font-semibold text-destructive">{t("errors.summary")}</p>
              <p className="text-xs text-destructive/80">{t("errors.summaryHint")}</p>
            </div>
          ) : null}

          {/* The basics — the whole required form. */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">{t("basicsTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("basicsIntro")}</p>

            <div className="mt-4 space-y-4">
              <div ref={(el) => void (fieldRefs.current.name = el)}>
                <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="event-name">
                  {t("nameLabel")}
                </label>
                <input
                  id="event-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder={t("namePlaceholder")}
                  className={`${inputClass} ${errors.name ? inputErrorClass : ""}`}
                />
                {fieldError("name")}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2" ref={(el) => void (fieldRefs.current.date = el)}>
                  <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="event-date">
                    {t("dateLabel")}
                  </label>
                  <input
                    id="event-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => update({ date: e.target.value })}
                    className={`${inputClass} ${errors.date ? inputErrorClass : ""}`}
                  />
                  {fieldError("date")}
                </div>
                <div ref={(el) => void (fieldRefs.current.start = el)}>
                  <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="event-start">
                    {t("startLabel")}
                  </label>
                  <input
                    id="event-start"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => update({ startTime: e.target.value })}
                    className={`${inputClass} ${errors.start ? inputErrorClass : ""}`}
                  />
                  {fieldError("start")}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="event-end">
                    {t("endLabel")}
                  </label>
                  <input id="event-end" type="time" value={form.endTime} onChange={(e) => update({ endTime: e.target.value })} className={inputClass} />
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-foreground">{t("howJoinLabel")}</span>
                <div className="inline-flex items-center rounded-full border border-border bg-surface p-1">
                  {(["inperson", "virtual", "hybrid"] as EventMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => update({ mode })}
                      aria-pressed={form.mode === mode}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        form.mode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {mode === "inperson" ? t("modeInPerson") : mode === "virtual" ? t("modeOnline") : t("modeBoth")}
                    </button>
                  ))}
                </div>
              </div>

              {form.mode !== "virtual" ? (
                <div ref={(el) => void (fieldRefs.current.place = el)}>
                  <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="event-place">
                    {t("whereLabel")}
                  </label>
                  <input
                    id="event-place"
                    type="text"
                    value={form.placeName}
                    onChange={(e) => update({ placeName: e.target.value })}
                    placeholder={t("wherePlaceholder")}
                    className={`${inputClass} ${errors.place ? inputErrorClass : ""}`}
                  />
                  {fieldError("place")}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="event-locality">
                        {t("localityLabel")}
                      </label>
                      <input id="event-locality" type="text" value={form.locality} onChange={(e) => update({ locality: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="event-country">
                        {t("countryLabel")}
                      </label>
                      <select id="event-country" value={form.country} onChange={(e) => update({ country: e.target.value })} className={inputClass}>
                        <option value="">—</option>
                        {countryEntries.map(([code, country]) => (
                          <option key={code} value={code}>
                            {country.emoji} {country.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 grid h-20 place-items-center rounded-2xl border border-dashed border-border bg-surface-sunken text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPinIcon className="size-4" aria-hidden />
                      {form.placeName.trim() || t("mapHint")}
                    </span>
                  </div>
                </div>
              ) : null}

              {form.mode !== "inperson" ? (
                <div ref={(el) => void (fieldRefs.current.onlineUrl = el)}>
                  <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="event-online-url">
                    {t("onlineUrlLabel")}
                  </label>
                  <input
                    id="event-online-url"
                    type="url"
                    value={form.onlineUrl}
                    onChange={(e) => update({ onlineUrl: e.target.value })}
                    placeholder="https://…"
                    className={`${inputClass} ${errors.onlineUrl ? inputErrorClass : ""}`}
                  />
                  {fieldError("onlineUrl")}
                </div>
              ) : null}
            </div>
          </section>

          {/* Optional extras — folded away, clearly optional. */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("addMore")}</h2>
            <div className="mt-3 space-y-3">
              {sectionCard(
                "description",
                t("sections.description.title"),
                t("sections.description.hint"),
                <>
                  <textarea
                    value={form.description}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder={t("descriptionPlaceholder")}
                    rows={4}
                    className={inputClass}
                  />
                  {form.coverDataUrl || form.existingCoverRef ? (
                    <div className="flex items-center gap-3">
                      {form.coverDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local data URL preview.
                        <img src={form.coverDataUrl} alt="" className="h-20 w-32 rounded-xl border border-border-soft object-cover" />
                      ) : (
                        <span className="grid h-20 w-32 place-items-center rounded-xl border border-border-soft bg-surface-sunken text-xs text-muted-foreground">
                          <ImageIcon className="size-5" aria-hidden />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => update({ coverDataUrl: null, existingCoverRef: null })}
                        className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      >
                        {t("coverRemove")}
                      </button>
                    </div>
                  ) : (
                    <label className="grid h-24 cursor-pointer place-items-center rounded-2xl border border-dashed border-border bg-surface-sunken text-xs text-muted-foreground transition-colors hover:border-primary/50">
                      <span className="inline-flex items-center gap-1.5">
                        <ImageIcon className="size-4" aria-hidden />
                        {t("coverDrop")}
                      </span>
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleCover(e.target.files?.[0] ?? null)} />
                    </label>
                  )}
                </>,
              )}

              {sectionCard(
                "agenda",
                t("sections.agenda.title"),
                t("sections.agenda.hint"),
                <>
                  {form.agenda.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.time}
                        onChange={(e) => update({ agenda: form.agenda.map((a, i) => (i === index ? { ...a, time: e.target.value } : a)) })}
                        placeholder={t("agendaTime")}
                        className={`${inputClass} w-24 shrink-0`}
                      />
                      <input
                        type="text"
                        value={item.text}
                        onChange={(e) => update({ agenda: form.agenda.map((a, i) => (i === index ? { ...a, text: e.target.value } : a)) })}
                        placeholder={t("agendaWhat")}
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => update({ agenda: form.agenda.filter((_, i) => i !== index) })}
                        aria-label={t("remove")}
                        className="shrink-0 rounded-full p-2 text-muted-foreground hover:text-foreground"
                      >
                        <XIcon className="size-4" aria-hidden />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => update({ agenda: [...form.agenda, { time: "", text: "" }] })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-semibold text-foreground hover:border-primary/50"
                  >
                    <PlusIcon className="size-3.5" aria-hidden />
                    {t("agendaAdd")}
                  </button>
                </>,
              )}

              {sectionCard(
                "capacity",
                t("sections.capacity.title"),
                t("sections.capacity.hint"),
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    value={form.capacity}
                    onChange={(e) => update({ capacity: e.target.value })}
                    className={`${inputClass} w-28`}
                    aria-label={t("sections.capacity.title")}
                  />
                  <span className="text-sm text-muted-foreground">{t("sections.capacity.waitlistNote")}</span>
                </div>,
              )}
            </div>
          </section>

          {/* Extras that stay visible on the published page. */}
          <section className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="event-tag">
                {t("themeTagLabel")}
              </label>
              <input id="event-tag" type="text" value={form.themeTag} onChange={(e) => update({ themeTag: e.target.value })} placeholder={t("themeTagPlaceholder")} className={inputClass} />
            </div>
            {form.mode !== "virtual" ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="event-meeting-note">
                  {t("meetingNoteLabel")}
                </label>
                <input
                  id="event-meeting-note"
                  type="text"
                  value={form.meetingNote}
                  onChange={(e) => update({ meetingNote: e.target.value })}
                  placeholder={t("meetingNotePlaceholder")}
                  className={inputClass}
                />
              </div>
            ) : null}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="event-good-to-know">
                {t("goodToKnowLabel")}
              </label>
              <input
                id="event-good-to-know"
                type="text"
                value={form.goodToKnow}
                onChange={(e) => update({ goodToKnow: e.target.value })}
                placeholder={t("goodToKnowPlaceholder")}
                className={inputClass}
              />
            </div>
          </section>

          {/* Guidelines gate + publish, always at the foot of the page. */}
          <section className="space-y-4 border-t border-border-soft pt-5">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.guidelinesAccepted}
                onChange={(e) => update({ guidelinesAccepted: e.target.checked })}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              {t("guidelines")}
            </label>
            {publishError ? (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive" role="alert">
                {t("publishFailed")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!isEditing ? (
                <button type="button" onClick={handleSaveDraft} className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary/50">
                  {t("saveDraft")}
                </button>
              ) : null}
              <button
                type="submit"
                disabled={!form.guidelinesAccepted || publishing}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publishing ? (
                  t("publishing")
                ) : (
                  <>
                    <CheckCircle2Icon className="size-4" aria-hidden />
                    {isEditing ? t("saveChanges") : t("publish")}
                  </>
                )}
              </button>
            </div>
          </section>
        </form>
      )}
    </main>
  );
}
