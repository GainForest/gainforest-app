"use client";

/**
 * /events/host — hosting an event IS the event page, editable in place.
 *
 * Following atmo-events' editor: the create/edit view mirrors the published
 * page's exact layout — the cover sits where the cover will be (click or drop
 * a photo straight onto it), the title is the page's own heading typed over a
 * placeholder, the date/time/format facts are the same chips the published
 * page shows, About and the agenda are written in place, and the publish
 * button lives where the RSVP panel will appear. No form chrome, no
 * collapsible sections: what you see is what gets published.
 *
 * Behavior kept from before: the draft autosaves from the first keystroke,
 * validation runs once on Publish with plain-language messages, publishing
 * swaps the page for the "Your event is live" confirmation, and
 * `?edit=<rkey>` loads the viewer's own event into the same editor.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarIcon,
  CameraIcon,
  CheckCircle2Icon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  ImagePlusIcon,
  LinkIcon,
  MapPinIcon,
  PlusIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { countryEntries } from "@/app/_lib/countries";
import { eventHref, type CommunityEvent, type EventMode } from "@/app/_lib/community-events";
import { useViewer } from "@/app/_lib/viewer";
import { liveEventsAdapter, type EventAccountCard, type EventsAdapter } from "../_lib/adapter";
import { clearEventDraft, draftHasContent, loadEventDraft, saveEventDraft } from "../_lib/draft";
import {
  emptyEventForm,
  eventToForm,
  validateEventForm,
  type EventFormErrors,
  type EventFormState,
} from "../_lib/form";
import { AvatarFace, CoverArt } from "./EventBits";

type FieldKey = "name" | "date" | "start" | "place" | "onlineUrl" | "guidelines";

/** The published page's fact chips, made editable: same rounded-full border,
 *  with a live input inside. */
const chipClass =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground transition-colors focus-within:border-primary/60";
const chipInputClass =
  "border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0 [&::-webkit-calendar-picker-indicator]:hidden";

/** Native date/time inputs carry their own picker glyphs; the chips show a
 *  single icon instead, and clicking anywhere in the chip opens the picker. */
function openPicker(event: React.MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    /* focus alone is fine where showPicker is not allowed */
  }
}
const chipErrorClass = "border-destructive bg-destructive/5";

/** A borderless textarea that grows with its content, so the title and the
 *  longer texts are written straight onto the page, over a placeholder. */
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
  id,
  rows = 1,
  textareaRef,
}: {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  className: string;
  ariaLabel: string;
  id?: string;
  rows?: number;
  textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  // Re-fit when the value changes from outside typing (draft restore, edit mode).
  useEffect(() => {
    grow(ref.current);
  }, [value]);
  return (
    <textarea
      id={id}
      ref={(el) => {
        ref.current = el;
        if (textareaRef) textareaRef.current = el;
      }}
      rows={rows}
      value={value}
      onChange={onChange}
      onInput={(event) => grow(event.currentTarget)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

/**
 * The cover, edited in place — exactly where the published page shows it.
 * Click (or drop an image onto it) to set a photo; hovering an existing photo
 * reveals "Change cover photo" and a remove control, atmo-events style. Until
 * a photo is chosen it previews the generated art the page will fall back to.
 */
function CoverEditor({
  seed,
  coverUrl,
  onPick,
  onRemove,
}: {
  seed: string;
  coverUrl: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("events.host");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const takeFile = (file: File | null | undefined) => {
    if (file && file.type.startsWith("image/")) onPick(file);
  };

  return (
    <div
      className="group relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        takeFile(e.dataTransfer?.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          takeFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="overflow-hidden rounded-3xl border border-border-soft bg-surface-sunken">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview or PDS blob URL resolved at runtime.
          <img src={coverUrl} alt="" className="aspect-[3/1] w-full object-cover" />
        ) : (
          <CoverArt seed={seed} className="aspect-[3/1] w-full" />
        )}
      </div>
      {/* The whole cover is the control. On a photo the invite appears on
          hover; on generated art it stays visible so the affordance is clear. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-3xl transition-colors ${
          coverUrl
            ? `text-white/0 group-hover:bg-black/40 group-hover:text-white/95 focus-visible:bg-black/40 focus-visible:text-white/95 ${dragOver ? "bg-black/40 text-white/95" : "bg-black/0"}`
            : `text-foreground/80 hover:bg-black/10 hover:text-white focus-visible:bg-black/10 ${dragOver ? "bg-black/10 text-white" : "bg-black/0"}`
        }`}
      >
        {coverUrl ? <CameraIcon className="size-5" aria-hidden /> : <ImagePlusIcon className="size-5" aria-hidden />}
        <span className="text-sm font-medium">{coverUrl ? t("coverChange") : t("coverAdd")}</span>
      </button>
      {coverUrl ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("coverRemove")}
          className="absolute right-3 top-3 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function HostEventClient({ adapter = liveEventsAdapter }: { adapter?: EventsAdapter }) {
  const t = useTranslations("events.host");
  const tDetail = useTranslations("events.detail");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editRkey = searchParams.get("edit");
  const viewer = useViewer();
  const viewerDid = adapter.viewerDidOverride !== undefined ? adapter.viewerDidOverride : viewer.sessionDid;

  const [form, setForm] = useState<EventFormState>(emptyEventForm);
  const [hydrated, setHydrated] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CommunityEvent | null>(null);
  const [existingCoverUrl, setExistingCoverUrl] = useState<string | null>(null);
  const [viewerCard, setViewerCard] = useState<EventAccountCard | null>(null);
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(false);
  const [published, setPublished] = useState<{ did: string; rkey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
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
    }
    setHydrated(true);
  }, [adapter, editRkey, viewerDid]);

  // Editing: resolve the stored cover so the editor previews the real page.
  useEffect(() => {
    if (!editingEvent?.coverRef) return;
    const controller = new AbortController();
    void adapter
      .coverUrl(editingEvent.did, editingEvent.coverRef, controller.signal)
      .then((url) => setExistingCoverUrl(url))
      .catch(() => undefined);
    return () => controller.abort();
  }, [adapter, editingEvent]);

  // The host card mirrors the published page's "Your host".
  useEffect(() => {
    if (!viewerDid) return;
    const controller = new AbortController();
    void adapter
      .accountCards([viewerDid], controller.signal)
      .then((cards) => setViewerCard(cards.get(viewerDid) ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [adapter, viewerDid]);

  // A fresh page invites you to start typing the name, like atmo's editor —
  // but only where a keyboard is already at hand.
  useEffect(() => {
    if (!hydrated || isEditing || form.name) return;
    if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
      titleRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, when the editor appears.
  }, [hydrated, isEditing]);

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

  const handleCover = useCallback(
    (file: File) => {
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
      <main ref={confirmationRef} className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-xl rounded-3xl border border-border-soft bg-surface p-8 text-center shadow-sm">
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

  // ── The editable event page ──────────────────────────────────────────────
  const errorCount = Object.keys(errors).length;
  const displayedCover = form.coverDataUrl ?? (form.existingCoverRef ? existingCoverUrl : null);
  const hostName = viewerCard?.displayName ?? t("you");

  const fieldError = (key: FieldKey) =>
    errors[key] ? (
      <p className="mt-1.5 text-xs font-medium text-destructive" role="alert">
        {t(`errors.${errors[key]}`)}
      </p>
    ) : null;

  const publishLabel = publishing ? t("publishing") : isEditing ? t("saveChanges") : t("publish");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:pb-16">
      <h1 className="sr-only">{isEditing ? t("editTitle") : t("title")}</h1>
      <div className="flex items-center justify-between gap-3">
        <Link
          href={isEditing && editingEvent ? eventHref(editingEvent.did, editingEvent.rkey) : "/events"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {isEditing ? t("close") : tDetail("back")}
        </Link>
        {!isEditing && draftSavedAt ? <span className="text-xs font-medium text-muted-foreground">{t("draftSaved")}</span> : null}
      </div>

      {!hydrated ? (
        <div className="mt-4 animate-pulse">
          <div className="aspect-[3/1] rounded-3xl bg-muted" />
          <div className="mt-6 h-8 w-2/3 rounded bg-muted" />
          <div className="mt-4 h-4 w-1/2 rounded bg-muted" />
        </div>
      ) : (
        <form
          className="mt-4 flex flex-col gap-8 lg:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void handlePublish();
          }}
        >
          <article className="min-w-0 flex-1">
            {/* Cover — edited exactly where the page shows it. */}
            <CoverEditor
              seed={form.name.trim() || editingEvent?.rkey || "event"}
              coverUrl={displayedCover}
              onPick={handleCover}
              onRemove={() => update({ coverDataUrl: null, existingCoverRef: null })}
            />

            {/* Title — the page's own heading, typed over a placeholder. */}
            <div className="mt-5" ref={(el) => void (fieldRefs.current.name = el)}>
              <AutoGrowTextarea
                id="event-name"
                textareaRef={titleRef}
                value={form.name}
                onChange={(e) => update({ name: e.target.value.replace(/\n/g, " ") })}
                placeholder={t("namePlaceholder")}
                ariaLabel={t("nameLabel")}
                className="w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-2xl font-semibold leading-tight tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0 sm:text-3xl"
              />
              {fieldError("name")}
            </div>

            {/* Fact chips — the published page's chips, live. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className={`${chipClass} ${errors.date ? chipErrorClass : ""}`} ref={(el) => void (fieldRefs.current.date = el as HTMLElement | null)}>
                <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} onClick={openPicker} aria-label={t("dateLabel")} className={chipInputClass} />
              </label>
              <label className={`${chipClass} ${errors.start ? chipErrorClass : ""}`} ref={(el) => void (fieldRefs.current.start = el as HTMLElement | null)}>
                <ClockIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input type="time" value={form.startTime} onChange={(e) => update({ startTime: e.target.value })} onClick={openPicker} aria-label={t("startLabel")} className={chipInputClass} />
                <span className="text-muted-foreground/60" aria-hidden>
                  –
                </span>
                <input type="time" value={form.endTime} onChange={(e) => update({ endTime: e.target.value })} onClick={openPicker} aria-label={t("endLabel")} className={chipInputClass} />
              </label>
              <div role="group" aria-label={t("howJoinLabel")} className="inline-flex items-center gap-1">
                {(["inperson", "virtual", "hybrid"] as EventMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update({ mode })}
                    aria-pressed={form.mode === mode}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      form.mode === mode
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {mode === "inperson" ? t("modeInPerson") : mode === "virtual" ? t("modeOnline") : t("modeBoth")}
                  </button>
                ))}
              </div>
              <label className={chipClass}>
                <TagIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  type="text"
                  value={form.themeTag}
                  onChange={(e) => update({ themeTag: e.target.value })}
                  placeholder={t("themeTagPlaceholder")}
                  aria-label={t("themeTagLabel")}
                  className={`${chipInputClass} w-36`}
                />
              </label>
            </div>
            {fieldError("date")}
            {fieldError("start")}

            {/* Where people meet — the page's meeting-place block, editable. */}
            {form.mode !== "virtual" ? (
              <div className="mt-4" ref={(el) => void (fieldRefs.current.place = el)}>
                <div
                  className={`overflow-hidden rounded-2xl border transition-colors focus-within:border-primary/60 ${
                    errors.place ? "border-destructive" : form.placeName.trim() ? "border-border" : "border-dashed border-border"
                  }`}
                >
                  <div className="flex flex-col items-center justify-center gap-1.5 bg-surface-sunken px-4 py-5">
                    <MapPinIcon className="size-4 text-muted-foreground" aria-hidden />
                    <input
                      type="text"
                      value={form.placeName}
                      onChange={(e) => update({ placeName: e.target.value })}
                      placeholder={t("wherePlaceholder")}
                      aria-label={t("whereLabel")}
                      className="w-full max-w-md border-0 bg-transparent p-0 text-center text-sm font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
                    />
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="text"
                        value={form.locality}
                        onChange={(e) => update({ locality: e.target.value })}
                        placeholder={t("localityLabel")}
                        aria-label={t("localityLabel")}
                        className="w-32 border-0 bg-transparent p-0 text-center text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
                      />
                      <span aria-hidden>·</span>
                      <select
                        value={form.country}
                        onChange={(e) => update({ country: e.target.value })}
                        aria-label={t("countryLabel")}
                        className="max-w-40 border-0 bg-transparent p-0 text-xs text-muted-foreground outline-none focus:outline-none focus:ring-0"
                      >
                        <option value="">{t("countryLabel")}</option>
                        {countryEntries.map(([code, country]) => (
                          <option key={code} value={code}>
                            {country.emoji} {country.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                {fieldError("place")}
              </div>
            ) : null}

            {/* Where people join online. */}
            {form.mode !== "inperson" ? (
              <div className="mt-3" ref={(el) => void (fieldRefs.current.onlineUrl = el)}>
                <label
                  className={`flex items-center gap-2.5 rounded-2xl border bg-surface px-3.5 py-2.5 transition-colors focus-within:border-primary/60 ${
                    errors.onlineUrl ? "border-destructive" : "border-border"
                  }`}
                >
                  <LinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <input
                    type="url"
                    value={form.onlineUrl}
                    onChange={(e) => update({ onlineUrl: e.target.value })}
                    placeholder="https://…"
                    aria-label={t("onlineUrlLabel")}
                    className="w-full border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
                  />
                </label>
                {fieldError("onlineUrl")}
              </div>
            ) : null}

            {/* About — written in place, styled like the published body. */}
            <section className="mt-7">
              <h2 className="text-lg font-semibold text-foreground">{tDetail("about")}</h2>
              <AutoGrowTextarea
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder={t("descriptionPlaceholder")}
                ariaLabel={t("aboutLabel")}
                rows={2}
                className="mt-2 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-7 text-foreground/85 outline-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
              />
            </section>

            {/* What to expect — the agenda card, with editable rows. */}
            <section className="mt-7">
              <h2 className="text-lg font-semibold text-foreground">{tDetail("whatToExpect")}</h2>
              <div className={`mt-2 divide-y divide-border-soft rounded-2xl border bg-surface ${form.agenda.length === 0 ? "border-dashed border-border" : "border-border-soft"}`}>
                {form.agenda.map((item, index) => (
                  <div key={index} className="group/agenda flex items-center gap-4 px-4 py-2.5 text-sm">
                    <input
                      type="text"
                      value={item.time}
                      onChange={(e) => update({ agenda: form.agenda.map((a, i) => (i === index ? { ...a, time: e.target.value } : a)) })}
                      placeholder={t("agendaTime")}
                      aria-label={t("agendaTime")}
                      className="w-14 shrink-0 border-0 bg-transparent p-0 text-sm font-semibold text-muted-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
                    />
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => update({ agenda: form.agenda.map((a, i) => (i === index ? { ...a, text: e.target.value } : a)) })}
                      placeholder={t("agendaWhat")}
                      aria-label={t("agendaWhat")}
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() => update({ agenda: form.agenda.filter((_, i) => i !== index) })}
                      aria-label={t("remove")}
                      className="shrink-0 rounded-full p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/agenda:opacity-100"
                    >
                      <XIcon className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => update({ agenda: [...form.agenda, { time: "", text: "" }] })}
                  className="flex w-full items-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <PlusIcon className="size-4" aria-hidden />
                  {t("agendaAdd")}
                </button>
              </div>
            </section>

            {/* Your host — you, exactly as the page will show you. */}
            <section className="mt-7">
              <h2 className="text-lg font-semibold text-foreground">{tDetail("yourHost")}</h2>
              <div className="mt-2 flex items-center gap-4 rounded-2xl border border-border-soft bg-surface p-4">
                <AvatarFace card={viewerCard} className="size-12" />
                <p className="min-w-0 flex-1 truncate font-semibold text-foreground">{hostName}</p>
              </div>
            </section>
          </article>

          {/* The action rail — where the RSVP panel lives on the page. */}
          <aside className="w-full lg:w-80 lg:shrink-0">
            <div className="space-y-4 lg:sticky lg:top-20">
              <div className="rounded-3xl border border-border-soft bg-surface p-5 shadow-sm">
                <p className="font-semibold text-foreground">{isEditing ? t("editTitle") : t("title")}</p>

                <div className="mt-4" ref={(el) => void (fieldRefs.current.guidelines = el)}>
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={form.guidelinesAccepted}
                      onChange={(e) => {
                        update({ guidelinesAccepted: e.target.checked });
                        // Ticking the box is the whole fix — clear its message
                        // immediately instead of waiting for the next Publish.
                        if (e.target.checked) setErrors((prev) => ({ ...prev, guidelines: undefined }));
                      }}
                      className="mt-0.5 size-4 accent-[var(--primary)]"
                    />
                    {t("guidelines")}
                  </label>
                  {fieldError("guidelines")}
                </div>

                {errorCount > 0 ? (
                  <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive" role="alert">
                    {t("errors.summary")}
                  </p>
                ) : null}
                {publishError ? (
                  <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive" role="alert">
                    {t("publishFailed")}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={publishing}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {publishing ? null : <CheckCircle2Icon className="size-4" aria-hidden />}
                  {publishLabel}
                </button>
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="mt-2 w-full rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary/50"
                  >
                    {t("saveDraft")}
                  </button>
                ) : null}
              </div>

              {/* Good to know — edited inside the card the page shows it in. */}
              <div className="rounded-3xl border border-border-soft bg-surface p-5">
                <h3 className="text-sm font-semibold text-foreground">{tDetail("goodToKnow")}</h3>
                <AutoGrowTextarea
                  value={form.goodToKnow}
                  onChange={(e) => update({ goodToKnow: e.target.value })}
                  placeholder={t("goodToKnowPlaceholder")}
                  ariaLabel={t("goodToKnowLabel")}
                  className="mt-1.5 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-6 text-muted-foreground outline-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
                />
                {form.mode !== "virtual" ? (
                  <div className="mt-3 border-t border-border-soft pt-3">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="event-meeting-note">
                      {t("meetingNoteLabel")}
                    </label>
                    <input
                      id="event-meeting-note"
                      type="text"
                      value={form.meetingNote}
                      onChange={(e) => update({ meetingNote: e.target.value })}
                      placeholder={t("meetingNotePlaceholder")}
                      className="mt-1 w-full border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          {/* Mobile pinned publish bar — the CTA at every scroll position,
              mirroring the page's pinned RSVP bar. */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-soft bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p className="truncate font-semibold text-foreground">{form.name.trim() || t("namePlaceholder")}</p>
                <p className="truncate text-xs text-muted-foreground">{!isEditing && draftSavedAt ? t("draftSaved") : isEditing ? t("editTitle") : t("title")}</p>
              </div>
              <button
                type="submit"
                disabled={publishing}
                className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {publishLabel}
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
