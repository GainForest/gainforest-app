"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  AwardIcon,
  BadgeCheckIcon,
  Edit3Icon,
  Loader2Icon,
  MailIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  BadgeAwardRecord,
  BadgeDefinitionRecord,
  InternalBadgeData,
  PendingBadgeAwardRecord,
  StrongRef,
} from "../_lib/badge-records";

const BADGE_DEFINITION_COLLECTION = "app.certified.badge.definition";
const BADGE_AWARD_COLLECTION = "app.certified.badge.award";
const BADGE_PENDING_AWARD_COLLECTION = "app.certified.badge.pendingAward";

const BADGE_TYPES = ["endorsement", "verification", "participation", "certification", "affiliation", "recognition"] as const;
const BADGE_TYPE_SET = new Set<string>(BADGE_TYPES);

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

type BusyAction =
  | { kind: "badgeForm" }
  | { kind: "awardForm" }
  | { kind: "deleteBadge"; rkey: string }
  | { kind: "deleteAward"; id: string };

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

function sameBusyAction(a: BusyAction | null, b: BusyAction): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === "deleteBadge" && b.kind === "deleteBadge") return a.rkey === b.rkey;
  if (a.kind === "deleteAward" && b.kind === "deleteAward") return a.id === b.id;
  return true;
}

export function InternalBadgesDashboard({ initialData, writeRepo }: { initialData: InternalBadgeData; writeRepo: string | null }) {
  const t = useTranslations("common.internalBadges");
  const locale = useLocale();
  const [data, setData] = useState<BadgeData>({ ...initialData, writeRepo });
  const [badgeForm, setBadgeForm] = useState<BadgeForm>(() => emptyBadgeForm());
  const [awardForm, setAwardForm] = useState<AwardForm>(() => emptyAwardForm(initialData.definitions[0]?.uri ?? ""));
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "loading"; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const isBusy = Boolean(busyAction);
  const isBadgeFormBusy = busyAction?.kind === "badgeForm";
  const isAwardFormBusy = busyAction?.kind === "awardForm";

  const definitionsByUri = useMemo(() => new Map(data.definitions.map((definition) => [definition.uri, definition])), [data.definitions]);
  const badgeTypeLabel = (type: string) => (BADGE_TYPE_SET.has(type) ? t(`types.${type}`) : type);
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
  const isDeletingBadge = (rkey: string) => busyAction?.kind === "deleteBadge" && busyAction.rkey === rkey;
  const isDeletingAward = (collection: string, rkey: string) => busyAction?.kind === "deleteAward" && busyAction.id === `${collection}:${rkey}`;

  async function refresh(nextNotice?: { tone: "success" | "error" | "loading"; text: string }) {
    const response = await fetch("/api/internal/badges", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as (BadgeData & { error?: string }) | null;
    if (!response.ok || !payload || payload.error) throw new Error(payload?.error ?? t("errors.refresh"));
    setData(payload);
    if (nextNotice) setNotice(nextNotice);
  }

  async function run(actionState: BusyAction, statusText: string, action: () => Promise<void>) {
    setBusyAction(actionState);
    setNotice({ tone: "loading", text: statusText });
    try {
      await action();
    } catch (error) {
      setNotice({ tone: "error", text: toErrorMessage(error, t("errors.generic")) });
    } finally {
      setBusyAction((current) => sameBusyAction(current, actionState) ? null : current);
    }
  }

  function editBadge(definition: BadgeDefinitionRecord) {
    setBadgeForm({
      editing: definition,
      title: definition.title,
      badgeType: definition.badgeType,
      description: definition.description ?? "",
      iconFile: null,
    });
    setNotice(null);
  }

  function saveBadge() {
    const editing = Boolean(badgeForm.editing);
    void run({ kind: "badgeForm" }, t(editing ? "status.updatingBadge" : "status.creatingBadge"), async () => {
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
      if (badgeForm.editing && icon === undefined && badgeForm.editing.icon) record.icon = badgeForm.editing.icon;

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
      await refresh({ tone: "success", text: t(editing ? "messages.badgeUpdated" : "messages.badgeCreated") });
    });
  }

  function deleteBadge(definition: BadgeDefinitionRecord) {
    if (!window.confirm(t("confirm.deleteBadge", { title: definition.title }))) return;
    void run({ kind: "deleteBadge", rkey: definition.rkey }, t("status.deletingBadge"), async () => {
      await callMutation({ operation: "deleteRecord", collection: BADGE_DEFINITION_COLLECTION, rkey: definition.rkey });
      await refresh({ tone: "success", text: t("messages.badgeDeleted") });
    });
  }

  function assignBadge() {
    void run({ kind: "awardForm" }, t("status.assigningBadge"), async () => {
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
    const id = `${collection}:${rkey}`;
    void run({ kind: "deleteAward", id }, t("status.removingAward"), async () => {
      await callMutation({ operation: "deleteRecord", collection, rkey });
      await refresh({ tone: "success", text: t("messages.awardDeleted") });
    });
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8" aria-busy={isBusy}>
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <section className="rounded-3xl bg-card p-5 md:p-6">
          <div className="grid gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <ShieldCheckIcon className="size-3.5" />
                {t("eyebrow")}
              </div>
              <h1 className="mt-3 font-instrument text-4xl font-light italic tracking-[-0.04em] md:text-5xl">{t("title")}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label={t("stats.badges")} value={data.definitions.length} />
              <Stat label={t("stats.awards")} value={data.awards.length} />
              <Stat label={t("stats.pending")} value={data.pendingAwards.length} />
            </div>
          </div>
        </section>

        <StatusNotice notice={notice} />

        <div className="grid gap-5">
          <Panel title={badgeForm.editing ? t("badgeForm.editTitle") : t("badgeForm.createTitle")} icon={<BadgeCheckIcon className="size-5" />}>
            <div className="space-y-4">
              <Field label={t("badgeForm.nameLabel")}>
                <Input value={badgeForm.title} onChange={(event) => setBadgeForm((form) => ({ ...form, title: event.target.value }))} placeholder={t("badgeForm.namePlaceholder")} disabled={isBadgeFormBusy} />
              </Field>
              <Field label={t("badgeForm.typeLabel")}>
                <Select value={badgeForm.badgeType} onValueChange={(value) => setBadgeForm((form) => ({ ...form, badgeType: value }))} disabled={isBadgeFormBusy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BADGE_TYPES.map((type) => <SelectItem key={type} value={type}>{t(`types.${type}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("badgeForm.descriptionLabel")}>
                <Textarea value={badgeForm.description} onChange={(event) => setBadgeForm((form) => ({ ...form, description: event.target.value }))} className="min-h-28" placeholder={t("badgeForm.descriptionPlaceholder")} disabled={isBadgeFormBusy} />
              </Field>
              <Field label={t("badgeForm.iconLabel")}>
                <Input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => setBadgeForm((form) => ({ ...form, iconFile: event.target.files?.[0] ?? null }))} disabled={isBadgeFormBusy} aria-label={t("badgeForm.iconLabel")} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={saveBadge} disabled={isBadgeFormBusy} className="shadow-none">
                  {isBadgeFormBusy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                  {badgeForm.editing ? t("badgeForm.save") : t("badgeForm.create")}
                </Button>
                {badgeForm.editing ? <Button type="button" onClick={() => setBadgeForm(emptyBadgeForm())} variant="secondary" disabled={isBadgeFormBusy}>{t("badgeForm.cancel")}</Button> : null}
              </div>
            </div>
          </Panel>

          <Panel title={t("awardForm.title")} icon={<AwardIcon className="size-5" />}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("awardForm.badgeLabel")}>
                <Select value={awardForm.badgeUri} onValueChange={(value) => setAwardForm((form) => ({ ...form, badgeUri: value }))} disabled={isAwardFormBusy || data.definitions.length === 0}>
                  <SelectTrigger><SelectValue placeholder={data.definitions.length === 0 ? t("awardForm.noBadges") : undefined} /></SelectTrigger>
                  <SelectContent>
                    {data.definitions.map((definition) => <SelectItem key={definition.uri} value={definition.uri}>{definition.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("awardForm.recipientLabel")}>
                <Input value={awardForm.recipient} onChange={(event) => setAwardForm((form) => ({ ...form, recipient: event.target.value }))} placeholder={t("awardForm.recipientPlaceholder")} disabled={isAwardFormBusy} />
              </Field>
              <Field label={t("awardForm.noteLabel")}>
                <Input value={awardForm.note} onChange={(event) => setAwardForm((form) => ({ ...form, note: event.target.value }))} placeholder={t("awardForm.notePlaceholder")} disabled={isAwardFormBusy} />
              </Field>
              <Field label={t("awardForm.urlLabel")}>
                <Input value={awardForm.url} onChange={(event) => setAwardForm((form) => ({ ...form, url: event.target.value }))} placeholder={t("awardForm.urlPlaceholder")} disabled={isAwardFormBusy} />
              </Field>
            </div>
            <Button type="button" onClick={assignBadge} disabled={isAwardFormBusy || data.definitions.length === 0} className="mt-4 shadow-none">
              {isAwardFormBusy ? <Loader2Icon className="size-4 animate-spin" /> : <AwardIcon className="size-4" />}
              {t("awardForm.assign")}
            </Button>
          </Panel>
        </div>

        <div className="grid gap-5">
          <Panel title={t("badges.title")} icon={<BadgeCheckIcon className="size-5" />}>
            {data.definitions.length === 0 ? <Empty text={t("badges.empty")} /> : (
              <div className="space-y-3">
                {data.definitions.map((definition) => (
                  <article key={definition.uri} className="rounded-2xl bg-background p-4">
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
                          <div className="flex gap-1">
                            <Button type="button" onClick={() => editBadge(definition)} variant="ghost" size="icon-sm" disabled={isDeletingBadge(definition.rkey)} aria-label={t("badges.editAria", { title: definition.title })}><Edit3Icon className="size-4" /></Button>
                            <Button type="button" onClick={() => deleteBadge(definition)} variant="ghost" size="icon-sm" disabled={isDeletingBadge(definition.rkey)} aria-label={t("badges.deleteAria", { title: definition.title })}>{isDeletingBadge(definition.rkey) ? <Loader2Icon className="size-4 animate-spin text-destructive" /> : <Trash2Icon className="size-4 text-destructive" />}</Button>
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
                  <article key={`${row.label}-${row.sublabel ?? ""}`} className="rounded-2xl bg-background p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        {row.pending.length > 0 && row.awards.length === 0 ? <MailIcon className="size-4" /> : <UserRoundIcon className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-medium">{row.label}</h3>
                        {row.sublabel ? <p className="mt-0.5 text-xs text-muted-foreground">{row.sublabel}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {row.awards.map((award) => (
                            <AwardChip key={award.uri} title={award.badgeTitle ?? t("unknownBadge")} detail={formatDate(locale, award.createdAt)} deleting={isDeletingAward(BADGE_AWARD_COLLECTION, award.rkey)} onDelete={() => deleteAward(BADGE_AWARD_COLLECTION, award.rkey)} deleteLabel={t("recipients.removeAward")} />
                          ))}
                          {row.pending.map((award) => (
                            <AwardChip key={award.uri} title={award.badgeTitle ?? t("unknownBadge")} detail={t("pendingChip")} deleting={isDeletingAward(BADGE_PENDING_AWARD_COLLECTION, award.rkey)} onDelete={() => deleteAward(BADGE_PENDING_AWARD_COLLECTION, award.rkey)} deleteLabel={t("recipients.removeAward")} />
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
    <div className="rounded-2xl bg-background p-4">
      <div className="font-instrument text-4xl italic tracking-[-0.04em]">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusNotice({ notice }: { notice: { tone: "success" | "error" | "loading"; text: string } | null }) {
  if (!notice) return null;
  const toneClass = notice.tone === "error"
    ? "bg-destructive/10 text-destructive"
    : notice.tone === "success"
      ? "bg-primary/10 text-primary"
      : "bg-muted text-muted-foreground";
  return (
    <div aria-live="polite" className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ${toneClass}`}>
      {notice.tone === "loading" ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {notice.text}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[1.5rem] bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-lg font-medium">{icon}<h2>{title}</h2></div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl bg-background p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function AwardChip({ title, detail, onDelete, deleteLabel, deleting }: { title: string; detail: string; onDelete: () => void; deleteLabel: string; deleting: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs">
      <AwardIcon className="size-3.5" />
      <span className="font-medium">{title}</span>
      <span className="text-muted-foreground">{detail}</span>
      <Button type="button" onClick={onDelete} variant="ghost" size="icon-xs" disabled={deleting} aria-label={deleteLabel}>
        {deleting ? <Loader2Icon className="size-3 animate-spin text-destructive" /> : <Trash2Icon className="size-3 text-destructive" />}
      </Button>
    </span>
  );
}
