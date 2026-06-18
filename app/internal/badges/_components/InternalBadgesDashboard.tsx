"use client";

import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { AwardIcon, BadgeCheckIcon, Edit3Icon, Loader2Icon, MailIcon, PlusIcon, ShieldCheckIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import type { BadgeAwardRecord, BadgeDefinitionRecord, InternalBadgeData, PendingBadgeAwardRecord, StrongRef } from "../_lib/badge-records";

const BADGE_DEFINITION_COLLECTION = "app.certified.badge.definition";
const BADGE_AWARD_COLLECTION = "app.certified.badge.award";
const BADGE_PENDING_AWARD_COLLECTION = "app.certified.badge.pendingAward";

const BADGE_TYPES = ["endorsement", "verification", "participation", "certification", "affiliation", "recognition"] as const;
const BADGE_TYPE_SET = new Set<string>(BADGE_TYPES);
const INPUT_CLASS = "w-full rounded-2xl border border-border bg-background/80 px-3.5 py-2.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 disabled:cursor-not-allowed disabled:opacity-60";
const PRIMARY_BUTTON_CLASS = "inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-foreground/90 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY_BUTTON_CLASS = "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-muted";
const ICON_BUTTON_CLASS = "inline-flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground";

type BadgeData = InternalBadgeData & { writeRepo: string | null };
type UploadBlobResult = { ref?: unknown; mimeType?: string; size?: number; blob?: unknown };
type MutationResult = { uri: string; cid: string; error?: string; message?: string };
type RecipientResult =
  | { kind: "email"; email: string }
  | { kind: "did"; did: string; handle: string | null; displayName: string | null; avatarUrl: string | null };

type BadgeForm = {
  editing: BadgeDefinitionRecord | null;
  title: string;
  badgeType: string;
  description: string;
  iconFile: File | null;
};

type AwardForm = {
  badgeUri: string;
  recipient: string;
  note: string;
  url: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toErrorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) return value.message;
  if (isRecord(value) && typeof value.message === "string") return value.message;
  return fallback;
}

async function bytesToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function toLexBlobRef(uploaded: UploadBlobResult, file: File) {
  const raw = isRecord(uploaded.blob) ? uploaded.blob : uploaded;
  if (!("ref" in raw) || raw.ref === undefined || raw.ref === null) {
    throw new Error("Could not save the badge icon.");
  }
  return {
    $type: "blob" as const,
    ref: raw.ref,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : file.type,
    size: typeof raw.size === "number" ? raw.size : file.size,
  };
}

async function callMutation<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/internal/badges/mutation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!response.ok || !data || data.error) {
    throw new Error(data?.message ?? data?.error ?? "Request failed.");
  }
  return data;
}

async function uploadIcon(file: File): Promise<UploadBlobResult> {
  return callMutation<UploadBlobResult>({
    operation: "uploadBlob",
    blobData: await bytesToBase64(file),
    blobMimeType: file.type || "application/octet-stream",
  });
}

async function resolveRecipient(identifier: string): Promise<RecipientResult> {
  const params = new URLSearchParams({ identifier });
  const response = await fetch(`/api/internal/badges/recipient?${params.toString()}`, { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as (RecipientResult & { error?: string; message?: string }) | null;
  if (!response.ok || !data || data.error) throw new Error(data?.message ?? data?.error ?? "Recipient lookup failed.");
  return data;
}

function emptyBadgeForm(): BadgeForm {
  return { editing: null, title: "", badgeType: "recognition", description: "", iconFile: null };
}

function emptyAwardForm(badgeUri = ""): AwardForm {
  return { badgeUri, recipient: "", note: "", url: "" };
}

function strongRef(definition: BadgeDefinitionRecord): StrongRef {
  return { uri: definition.uri, cid: definition.cid };
}

function formatDate(locale: string, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function InternalBadgesDashboard({ initialData, writeRepo }: { initialData: InternalBadgeData; writeRepo: string | null }) {
  const t = useTranslations("common.internalBadges");
  const locale = useLocale();
  const [data, setData] = useState<BadgeData>({ ...initialData, writeRepo });
  const [badgeForm, setBadgeForm] = useState<BadgeForm>(() => emptyBadgeForm());
  const [awardForm, setAwardForm] = useState<AwardForm>(() => emptyAwardForm(initialData.definitions[0]?.uri ?? ""));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const definitionsByUri = useMemo(() => new Map(data.definitions.map((definition) => [definition.uri, definition])), [data.definitions]);
  const badgeTypeLabel = (type: string) => BADGE_TYPE_SET.has(type) ? t(`types.${type}`) : type;
  const groupedRecipients = useMemo(() => {
    const rows = new Map<string, { label: string; sublabel: string | null; awards: BadgeAwardRecord[]; pending: PendingBadgeAwardRecord[] }>();
    data.awards.forEach((award) => {
      const key = award.subjectDid ?? award.subjectLabel;
      const existing = rows.get(key) ?? { label: award.subjectLabel, sublabel: award.subjectHandle, awards: [], pending: [] };
      existing.awards.push(award);
      rows.set(key, existing);
    });
    data.pendingAwards.forEach((award) => {
      const key = `email:${award.email}`;
      const existing = rows.get(key) ?? { label: award.email, sublabel: t("pendingEmail"), awards: [], pending: [] };
      existing.pending.push(award);
      rows.set(key, existing);
    });
    return Array.from(rows.values());
  }, [data.awards, data.pendingAwards, t]);

  async function refresh(nextMessage?: { tone: "success" | "error"; text: string }) {
    const response = await fetch("/api/internal/badges", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as (BadgeData & { error?: string }) | null;
    if (!response.ok || !payload || payload.error) throw new Error(payload?.error ?? t("errors.refresh"));
    setData(payload);
    if (nextMessage) setMessage(nextMessage);
  }

  function run(action: () => Promise<void>) {
    setMessage(null);
    startTransition(() => {
      void action().catch((error) => setMessage({ tone: "error", text: toErrorMessage(error, t("errors.generic")) }));
    });
  }

  function editBadge(definition: BadgeDefinitionRecord) {
    setBadgeForm({
      editing: definition,
      title: definition.title,
      badgeType: definition.badgeType,
      description: definition.description ?? "",
      iconFile: null,
    });
  }

  function saveBadge() {
    run(async () => {
      const title = badgeForm.title.trim();
      if (!title) throw new Error(t("errors.titleRequired"));
      let icon: unknown | null | undefined = badgeForm.editing ? undefined : null;
      if (badgeForm.iconFile) icon = toLexBlobRef(await uploadIcon(badgeForm.iconFile), badgeForm.iconFile);
      const record: Record<string, unknown> = {
        $type: BADGE_DEFINITION_COLLECTION,
        title,
        badgeType: badgeForm.badgeType.trim() || "recognition",
        description: badgeForm.description.trim() || undefined,
        createdAt: badgeForm.editing?.createdAt ?? new Date().toISOString(),
      };
      if (icon) record.icon = icon;
      if (badgeForm.editing && icon === undefined && badgeForm.editing.icon) {
        record.icon = badgeForm.editing.icon;
      }

      if (badgeForm.editing) {
        await callMutation<MutationResult>({
          operation: "putRecord",
          collection: BADGE_DEFINITION_COLLECTION,
          rkey: badgeForm.editing.rkey,
          record,
          swapRecord: badgeForm.editing.cid,
        });
      } else {
        await callMutation<MutationResult>({ operation: "createRecord", collection: BADGE_DEFINITION_COLLECTION, record });
      }
      setBadgeForm(emptyBadgeForm());
      await refresh({ tone: "success", text: t(badgeForm.editing ? "messages.badgeUpdated" : "messages.badgeCreated") });
    });
  }

  function deleteBadge(definition: BadgeDefinitionRecord) {
    if (!window.confirm(t("confirm.deleteBadge", { title: definition.title }))) return;
    run(async () => {
      await callMutation({ operation: "deleteRecord", collection: BADGE_DEFINITION_COLLECTION, rkey: definition.rkey });
      await refresh({ tone: "success", text: t("messages.badgeDeleted") });
    });
  }

  function assignBadge() {
    run(async () => {
      const definition = definitionsByUri.get(awardForm.badgeUri);
      if (!definition) throw new Error(t("errors.badgeRequired"));
      const recipient = await resolveRecipient(awardForm.recipient);
      const note = awardForm.note.trim();
      const url = awardForm.url.trim();
      if (recipient.kind === "email") {
        await callMutation<MutationResult>({
          operation: "createRecord",
          collection: BADGE_PENDING_AWARD_COLLECTION,
          record: {
            $type: BADGE_PENDING_AWARD_COLLECTION,
            badge: strongRef(definition),
            email: recipient.email,
            note: note || undefined,
            createdAt: new Date().toISOString(),
          },
        });
        setAwardForm(emptyAwardForm(definition.uri));
        await refresh({ tone: "success", text: t("messages.pendingCreated") });
        return;
      }

      await callMutation<MutationResult>({
        operation: "createRecord",
        collection: BADGE_AWARD_COLLECTION,
        record: {
          $type: BADGE_AWARD_COLLECTION,
          badge: strongRef(definition),
          subject: { $type: "app.certified.defs#did", did: recipient.did },
          note: note || undefined,
          url: url || undefined,
          createdAt: new Date().toISOString(),
        },
      });
      setAwardForm(emptyAwardForm(definition.uri));
      await refresh({ tone: "success", text: t("messages.awardCreated") });
    });
  }

  function deleteAward(collection: string, rkey: string) {
    if (!window.confirm(t("confirm.deleteAward"))) return;
    run(async () => {
      await callMutation({ operation: "deleteRecord", collection, rkey });
      await refresh({ tone: "success", text: t("messages.awardDeleted") });
    });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(117,93,55,0.18),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)))] px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur">
          <div className="grid gap-6 p-6 md:grid-cols-[1.4fr_0.8fr] md:p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-200">
                <ShieldCheckIcon className="size-3.5" />
                {t("eyebrow")}
              </div>
              <h1 className="mt-5 font-instrument text-5xl font-light italic tracking-[-0.04em] md:text-7xl">{t("title")}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{t("description")}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-1">
              <Stat label={t("stats.badges")} value={data.definitions.length} />
              <Stat label={t("stats.awards")} value={data.awards.length} />
              <Stat label={t("stats.pending")} value={data.pendingAwards.length} />
            </div>
          </div>
        </section>

        {message ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"}`}>
            {message.text}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.25fr]">
          <Panel title={badgeForm.editing ? t("badgeForm.editTitle") : t("badgeForm.createTitle")} icon={<BadgeCheckIcon className="size-5" />}>
            <div className="space-y-4">
              <Field label={t("badgeForm.nameLabel")}>
                <input value={badgeForm.title} onChange={(event) => setBadgeForm((form) => ({ ...form, title: event.target.value }))} className={INPUT_CLASS} placeholder={t("badgeForm.namePlaceholder")} />
              </Field>
              <Field label={t("badgeForm.typeLabel")}>
                <select value={badgeForm.badgeType} onChange={(event) => setBadgeForm((form) => ({ ...form, badgeType: event.target.value }))} className={INPUT_CLASS}>
                  {BADGE_TYPES.map((type) => <option key={type} value={type}>{t(`types.${type}`)}</option>)}
                </select>
              </Field>
              <Field label={t("badgeForm.descriptionLabel")}>
                <textarea value={badgeForm.description} onChange={(event) => setBadgeForm((form) => ({ ...form, description: event.target.value }))} className={`${INPUT_CLASS} min-h-28`} placeholder={t("badgeForm.descriptionPlaceholder")} />
              </Field>
              <Field label={t("badgeForm.iconLabel")}>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => setBadgeForm((form) => ({ ...form, iconFile: event.target.files?.[0] ?? null }))} className="text-sm" aria-label={t("badgeForm.iconLabel")} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={saveBadge} disabled={isPending} className={PRIMARY_BUTTON_CLASS}>
                  {isPending ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                  {badgeForm.editing ? t("badgeForm.save") : t("badgeForm.create")}
                </button>
                {badgeForm.editing ? <button type="button" onClick={() => setBadgeForm(emptyBadgeForm())} className={SECONDARY_BUTTON_CLASS}>{t("badgeForm.cancel")}</button> : null}
              </div>
            </div>
          </Panel>

          <Panel title={t("awardForm.title")} icon={<AwardIcon className="size-5" />}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("awardForm.badgeLabel")}>
                <select value={awardForm.badgeUri} onChange={(event) => setAwardForm((form) => ({ ...form, badgeUri: event.target.value }))} className={INPUT_CLASS} disabled={data.definitions.length === 0}>
                  {data.definitions.length === 0 ? <option>{t("awardForm.noBadges")}</option> : data.definitions.map((definition) => <option key={definition.uri} value={definition.uri}>{definition.title}</option>)}
                </select>
              </Field>
              <Field label={t("awardForm.recipientLabel")}>
                <input value={awardForm.recipient} onChange={(event) => setAwardForm((form) => ({ ...form, recipient: event.target.value }))} className={INPUT_CLASS} placeholder={t("awardForm.recipientPlaceholder")} />
              </Field>
              <Field label={t("awardForm.noteLabel")}>
                <input value={awardForm.note} onChange={(event) => setAwardForm((form) => ({ ...form, note: event.target.value }))} className={INPUT_CLASS} placeholder={t("awardForm.notePlaceholder")} />
              </Field>
              <Field label={t("awardForm.urlLabel")}>
                <input value={awardForm.url} onChange={(event) => setAwardForm((form) => ({ ...form, url: event.target.value }))} className={INPUT_CLASS} placeholder={t("awardForm.urlPlaceholder")} />
              </Field>
            </div>
            <button type="button" onClick={assignBadge} disabled={isPending || data.definitions.length === 0} className={`${PRIMARY_BUTTON_CLASS} mt-4`}>
              {isPending ? <Loader2Icon className="size-4 animate-spin" /> : <AwardIcon className="size-4" />}
              {t("awardForm.assign")}
            </button>
          </Panel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <Panel title={t("badges.title")} icon={<BadgeCheckIcon className="size-5" />}>
            {data.definitions.length === 0 ? <Empty text={t("badges.empty")} /> : (
              <div className="space-y-3">
                {data.definitions.map((definition) => (
                  <article key={definition.uri} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="flex gap-4">
                      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                        {definition.iconUrl ? <Image src={definition.iconUrl} alt="" width={56} height={56} unoptimized className="size-full object-cover" /> : <BadgeCheckIcon className="size-6 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-medium">{definition.title}</h3>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{badgeTypeLabel(definition.badgeType)}</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => editBadge(definition)} className={ICON_BUTTON_CLASS} aria-label={t("badges.editAria", { title: definition.title })}><Edit3Icon className="size-4" /></button>
                            <button type="button" onClick={() => deleteBadge(definition)} className={`${ICON_BUTTON_CLASS} text-red-600`} aria-label={t("badges.deleteAria", { title: definition.title })}><Trash2Icon className="size-4" /></button>
                          </div>
                        </div>
                        {definition.description ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{definition.description}</p> : null}
                        <p className="mt-3 text-xs text-muted-foreground">{formatDate(locale, definition.createdAt)}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={t("recipients.title")} icon={<UserRoundIcon className="size-5" />}>
            {groupedRecipients.length === 0 ? <Empty text={t("recipients.empty")} /> : (
              <div className="space-y-3">
                {groupedRecipients.map((row) => (
                  <article key={`${row.label}-${row.sublabel ?? ""}`} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        {row.pending.length > 0 && row.awards.length === 0 ? <MailIcon className="size-4" /> : <UserRoundIcon className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-medium">{row.label}</h3>
                        {row.sublabel ? <p className="mt-0.5 text-xs text-muted-foreground">{row.sublabel}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {row.awards.map((award) => (
                            <AwardChip key={award.uri} title={award.badgeTitle ?? t("unknownBadge")} detail={formatDate(locale, award.createdAt)} onDelete={() => deleteAward(BADGE_AWARD_COLLECTION, award.rkey)} deleteLabel={t("recipients.removeAward")} />
                          ))}
                          {row.pending.map((award) => (
                            <AwardChip key={award.uri} title={award.badgeTitle ?? t("unknownBadge")} detail={t("pendingChip")} onDelete={() => deleteAward(BADGE_PENDING_AWARD_COLLECTION, award.rkey)} deleteLabel={t("recipients.removeAward")} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
      <div className="font-instrument text-4xl italic tracking-[-0.04em]">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-xl shadow-black/5 backdrop-blur">
      <div className="mb-4 flex items-center gap-2 text-lg font-medium">{icon}<h2>{title}</h2></div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-1.5 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function AwardChip({ title, detail, onDelete, deleteLabel }: { title: string; detail: string; onDelete: () => void; deleteLabel: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/70 px-3 py-1.5 text-xs">
      <AwardIcon className="size-3.5" />
      <span className="font-medium">{title}</span>
      <span className="text-muted-foreground">{detail}</span>
      <button type="button" onClick={onDelete} className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-red-600" aria-label={deleteLabel}>
        <Trash2Icon className="size-3" />
      </button>
    </span>
  );
}
