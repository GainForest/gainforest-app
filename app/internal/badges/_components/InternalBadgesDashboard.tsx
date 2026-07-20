"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeftIcon,
  AwardIcon,
  BadgeCheckIcon,
  Building2Icon,
  Edit3Icon,
  Loader2Icon,
  MailIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import { AdminOnlyIndicator } from "@/app/_components/AdminOnlyIndicator";
import { formatCgsErrorMessage } from "@/app/_lib/cgs-errors";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
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
  recipients: string;
  note: string;
  url: string;
};

type BusyAction =
  | { kind: "badgeForm" }
  | { kind: "awardForm" }
  | { kind: "deleteBadge"; rkey: string }
  | { kind: "deleteAward"; id: string };

type ActionResult = { ok: true } | { ok: false; error: string };

type HolderRow = {
  key: string;
  label: string;
  sublabel: string | null;
  kind: "account" | "organization" | "email" | "record";
  awards: BadgeAwardRecord[];
  pending: PendingBadgeAwardRecord[];
};

type DeleteAwardTarget = {
  collection: typeof BADGE_AWARD_COLLECTION | typeof BADGE_PENDING_AWARD_COLLECTION;
  rkey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toErrorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) return formatCgsErrorMessage(value.message, fallback);
  if (isRecord(value) && typeof value.message === "string") return formatCgsErrorMessage(value.message, fallback);
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
    throw new Error(formatCgsErrorMessage(data?.message ?? data?.error, "Request failed."));
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
  return { badgeUri, recipients: "", note: "", url: "" };
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

function uniqueRecipients(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,;]+/).map((entry) => entry.trim()).filter(Boolean)));
}

export function InternalBadgesDashboard({
  initialData,
  writeRepo,
  selectedBadgeRkey,
}: {
  initialData: InternalBadgeData;
  writeRepo: string | null;
  selectedBadgeRkey?: string;
}) {
  const t = useTranslations("common.internalBadges");
  const locale = useLocale();
  const router = useRouter();
  const modal = useModal();
  const [data, setData] = useState<BadgeData>({ ...initialData, writeRepo });
  const [awardForm, setAwardForm] = useState<AwardForm>(() => emptyAwardForm(initialData.definitions.find((definition) => definition.rkey === selectedBadgeRkey)?.uri ?? ""));
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "loading"; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const isBusy = Boolean(busyAction);
  const isAwardFormBusy = busyAction?.kind === "awardForm";

  const selectedDefinition = useMemo(
    () => data.definitions.find((definition) => definition.rkey === selectedBadgeRkey) ?? null,
    [data.definitions, selectedBadgeRkey],
  );
  const isDetailPage = Boolean(selectedBadgeRkey && selectedDefinition);
  const badgeTypeLabel = (type: string) => (BADGE_TYPE_SET.has(type) ? t(`types.${type}`) : type);
  const holderRows = useMemo(() => {
    if (!selectedDefinition) return [];
    const rows = new Map<string, HolderRow>();
    data.awards.filter((award) => award.badge.uri === selectedDefinition.uri).forEach((award) => {
      const key = award.subjectDid ? `account:${award.subjectDid}` : `${award.subjectKind}:${award.subjectLabel}`;
      const kind: HolderRow["kind"] = award.subjectKind === "record" ? "record" : "account";
      const existing = rows.get(key) ?? { key, label: award.subjectLabel, sublabel: award.subjectHandle, kind, awards: [], pending: [] };
      existing.awards.push(award);
      rows.set(key, existing);
    });
    data.pendingAwards.filter((award) => award.badge.uri === selectedDefinition.uri).forEach((award) => {
      const key = `email:${award.email}`;
      const existing = rows.get(key) ?? { key, label: award.email, sublabel: t("pendingEmail"), kind: "email" as const, awards: [], pending: [] };
      existing.pending.push(award);
      rows.set(key, existing);
    });
    return Array.from(rows.values());
  }, [data.awards, data.pendingAwards, selectedDefinition, t]);
  const isDeletingBadge = (rkey: string) => busyAction?.kind === "deleteBadge" && busyAction.rkey === rkey;
  const isDeletingAward = (collection: string, rkey: string) => busyAction?.kind === "deleteAward" && busyAction.id === `${collection}:${rkey}`;

  useEffect(() => {
    if (!selectedDefinition) return;
    setAwardForm((form) => form.badgeUri === selectedDefinition.uri ? form : emptyAwardForm(selectedDefinition.uri));
  }, [selectedDefinition]);

  async function refresh(nextNotice?: { tone: "success" | "error" | "loading"; text: string }) {
    const includeAwards = selectedBadgeRkey ? "?includeAwards=1" : "";
    const response = await fetch(`/api/internal/badges${includeAwards}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as (BadgeData & { error?: string }) | null;
    if (!response.ok || !payload || payload.error) throw new Error(payload?.error ?? t("errors.refresh"));
    setData(payload);
    if (nextNotice) setNotice(nextNotice);
    return payload;
  }

  async function run(actionState: BusyAction, statusText: string, action: () => Promise<void>): Promise<ActionResult> {
    setBusyAction(actionState);
    setNotice({ tone: "loading", text: statusText });
    try {
      await action();
      return { ok: true };
    } catch (error) {
      const message = toErrorMessage(error, t("errors.generic"));
      setNotice({ tone: "error", text: message });
      return { ok: false, error: message };
    } finally {
      setBusyAction((current) => sameBusyAction(current, actionState) ? null : current);
    }
  }

  function closeModal() {
    void modal.hide().then(() => modal.popModal());
  }

  function openCreateBadge() {
    setNotice(null);
    modal.pushModal({
      id: "internal-badge-create",
      content: <BadgeFormModal initialForm={emptyBadgeForm()} onCancel={closeModal} onSave={saveBadge} />,
    }, true);
    void modal.show();
  }

  function openEditBadge(definition: BadgeDefinitionRecord) {
    setNotice(null);
    modal.pushModal({
      id: `internal-badge-edit-${definition.rkey}`,
      content: <BadgeFormModal initialForm={{ editing: definition, title: definition.title, badgeType: definition.badgeType, description: definition.description ?? "", iconFile: null }} onCancel={closeModal} onSave={saveBadge} />,
    }, true);
    void modal.show();
  }

  async function saveBadge(form: BadgeForm): Promise<ActionResult> {
    const editing = Boolean(form.editing);
    return run({ kind: "badgeForm" }, t(editing ? "status.updatingBadge" : "status.creatingBadge"), async () => {
      const title = form.title.trim();
      if (!title) throw new Error(t("errors.titleRequired"));
      let icon: unknown | null | undefined = form.editing ? undefined : null;
      if (form.iconFile) icon = toLexBlobRef(await uploadIcon(form.iconFile), form.iconFile);
      const record: Record<string, unknown> = {
        $type: BADGE_DEFINITION_COLLECTION,
        title,
        badgeType: form.badgeType.trim() || "recognition",
        description: form.description.trim() || undefined,
        createdAt: form.editing?.createdAt ?? new Date().toISOString(),
      };
      if (icon) record.icon = icon;
      if (form.editing && icon === undefined && form.editing.icon) record.icon = form.editing.icon;

      if (form.editing) {
        await callMutation<MutationResult>({
          operation: "putRecord",
          collection: BADGE_DEFINITION_COLLECTION,
          rkey: form.editing.rkey,
          record,
          swapRecord: form.editing.cid,
        });
      } else {
        await callMutation<MutationResult>({ operation: "createRecord", collection: BADGE_DEFINITION_COLLECTION, record });
      }
      await refresh({ tone: "success", text: t(editing ? "messages.badgeUpdated" : "messages.badgeCreated") });
    });
  }

  function openDeleteBadge(definition: BadgeDefinitionRecord) {
    modal.pushModal({
      id: `internal-badge-delete-${definition.rkey}`,
      content: <ConfirmActionModal title={t("confirm.deleteBadgeTitle")} description={t("confirm.deleteBadge", { title: definition.title })} actionLabel={t("confirm.deleteBadgeAction")} onCancel={closeModal} onConfirm={() => deleteBadge(definition)} />,
    }, true);
    void modal.show();
  }

  async function deleteBadge(definition: BadgeDefinitionRecord): Promise<ActionResult> {
    return run({ kind: "deleteBadge", rkey: definition.rkey }, t("status.deletingBadge"), async () => {
      await callMutation({ operation: "deleteRecord", collection: BADGE_DEFINITION_COLLECTION, rkey: definition.rkey });
      await refresh({ tone: "success", text: t("messages.badgeDeleted") });
      if (selectedBadgeRkey === definition.rkey) router.push("/internal/badges");
    });
  }

  async function createAwardForRecipient(definition: BadgeDefinitionRecord, recipientText: string, note: string, url: string) {
    const recipient = await resolveRecipient(recipientText);
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
  }

  function assignBadge() {
    void run({ kind: "awardForm" }, t("status.assigningBadge"), async () => {
      const definition = selectedDefinition ?? data.definitions.find((entry) => entry.uri === awardForm.badgeUri);
      if (!definition) throw new Error(t("errors.badgeRequired"));
      const recipients = uniqueRecipients(awardForm.recipients);
      if (recipients.length === 0) throw new Error(t("errors.recipientRequired"));
      const note = awardForm.note.trim();
      const url = awardForm.url.trim();
      for (const recipient of recipients) {
        await createAwardForRecipient(definition, recipient, note, url);
      }
      setAwardForm(emptyAwardForm(definition.uri));
      await refresh({
        tone: "success",
        text: recipients.length === 1 ? t("messages.awardCreated") : t("messages.awardsCreated", { count: recipients.length }),
      });
    });
  }

  function openDeleteAward(target: DeleteAwardTarget) {
    modal.pushModal({
      id: `internal-badge-assignment-delete-${target.collection}-${target.rkey}`,
      content: <ConfirmActionModal title={t("confirm.deleteAwardTitle")} description={t("confirm.deleteAward")} actionLabel={t("confirm.deleteAwardAction")} onCancel={closeModal} onConfirm={() => deleteAward(target)} />,
    }, true);
    void modal.show();
  }

  async function deleteAward(target: DeleteAwardTarget): Promise<ActionResult> {
    const id = `${target.collection}:${target.rkey}`;
    return run({ kind: "deleteAward", id }, t("status.removingAward"), async () => {
      await callMutation({ operation: "deleteRecord", collection: target.collection, rkey: target.rkey });
      await refresh({ tone: "success", text: t("messages.awardDeleted") });
    });
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8" aria-busy={isBusy}>
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        {isDetailPage && selectedDefinition ? (
          <BadgeDetailHeader
            definition={selectedDefinition}
            badgeTypeLabel={badgeTypeLabel(selectedDefinition.badgeType)}
            createdAt={formatDate(locale, selectedDefinition.createdAt)}
            onEdit={() => openEditBadge(selectedDefinition)}
            onDelete={() => openDeleteBadge(selectedDefinition)}
            deleting={isDeletingBadge(selectedDefinition.rkey)}
          />
        ) : (
          <BadgesIndexHeader onCreate={openCreateBadge} />
        )}

        <StatusNotice notice={notice} />

        {isDetailPage && selectedDefinition ? (
          <div className="grid gap-5">
            <Panel title={t("awardForm.titleForBadge")} icon={<AwardIcon className="size-5" />}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t("awardForm.recipientsLabel")}>
                  <Textarea
                    value={awardForm.recipients}
                    onChange={(event) => setAwardForm((form) => ({ ...form, recipients: event.target.value }))}
                    className="min-h-28"
                    placeholder={t("awardForm.recipientsPlaceholder")}
                    disabled={isAwardFormBusy}
                  />
                </Field>
                <div className="grid gap-4">
                  <Field label={t("awardForm.noteLabel")}>
                    <Input value={awardForm.note} onChange={(event) => setAwardForm((form) => ({ ...form, note: event.target.value }))} placeholder={t("awardForm.notePlaceholder")} disabled={isAwardFormBusy} />
                  </Field>
                  <Field label={t("awardForm.urlLabel")}>
                    <Input value={awardForm.url} onChange={(event) => setAwardForm((form) => ({ ...form, url: event.target.value }))} placeholder={t("awardForm.urlPlaceholder")} disabled={isAwardFormBusy} />
                  </Field>
                </div>
              </div>
              <Button type="button" onClick={assignBadge} disabled={isAwardFormBusy} className="mt-4 shadow-none">
                {isAwardFormBusy ? <Loader2Icon className="size-4 animate-spin" /> : <AwardIcon className="size-4" />}
                {t("awardForm.assign")}
              </Button>
            </Panel>

            <Panel title={t("recipients.title")} icon={<UserRoundIcon className="size-5" />}>
              {holderRows.length === 0 ? <Empty text={t("recipients.emptyForBadge")} /> : (
                <div className="space-y-3">
                  {holderRows.map((row) => (
                    <article key={row.key} className="rounded-2xl bg-background p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                          {row.kind === "email" ? <MailIcon className="size-4" /> : row.kind === "record" || row.kind === "organization" ? <Building2Icon className="size-4" /> : <UserRoundIcon className="size-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-medium">{row.label}</h3>
                          {row.sublabel ? <p className="mt-0.5 text-xs text-muted-foreground">{row.sublabel}</p> : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {row.awards.map((award) => (
                              <AwardChip
                                key={award.uri}
                                title={selectedDefinition.title}
                                detail={formatDate(locale, award.createdAt)}
                                deleting={isDeletingAward(BADGE_AWARD_COLLECTION, award.rkey)}
                                onDelete={() => openDeleteAward({ collection: BADGE_AWARD_COLLECTION, rkey: award.rkey })}
                                deleteLabel={t("recipients.removeAward")}
                              />
                            ))}
                            {row.pending.map((award) => (
                              <AwardChip
                                key={award.uri}
                                title={selectedDefinition.title}
                                detail={t("pendingChip")}
                                deleting={isDeletingAward(BADGE_PENDING_AWARD_COLLECTION, award.rkey)}
                                onDelete={() => openDeleteAward({ collection: BADGE_PENDING_AWARD_COLLECTION, rkey: award.rkey })}
                                deleteLabel={t("recipients.removeAward")}
                              />
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
        ) : (
          <Panel title={t("badges.title")} icon={<BadgeCheckIcon className="size-5" />}>
            {data.definitions.length === 0 ? <Empty text={t("badges.empty")} /> : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.definitions.map((definition) => (
                  <Link
                    key={definition.uri}
                    href={`/internal/badges/${encodeURIComponent(definition.rkey)}`}
                    className="group rounded-2xl bg-background p-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("badges.openAria", { title: definition.title })}
                  >
                    <div className="flex gap-4">
                      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                        {definition.iconUrl ? <Image src={definition.iconUrl} alt="" width={56} height={56} unoptimized className="size-full object-cover" /> : <BadgeCheckIcon className="size-6 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium group-hover:text-primary">{definition.title}</h3>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{badgeTypeLabel(definition.badgeType)}</p>
                        {definition.description ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{definition.description}</p> : null}
                        <p className="mt-3 text-xs text-muted-foreground">{formatDate(locale, definition.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>

    </main>
  );
}

function BadgesIndexHeader({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations("common.internalBadges");
  return (
    <section className="rounded-3xl bg-card p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheckIcon className="size-3.5" />
            {t("eyebrow")}
            <AdminOnlyIndicator />
          </div>
          <h1 className="mt-3 font-instrument text-4xl font-light italic tracking-[-0.04em] md:text-5xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
        </div>
        <Button type="button" onClick={onCreate} className="self-start shadow-none">
          <PlusIcon className="size-4" />
          {t("badgeForm.create")}
        </Button>
      </div>
    </section>
  );
}

function BadgeDetailHeader({
  definition,
  badgeTypeLabel,
  createdAt,
  onEdit,
  onDelete,
  deleting,
}: {
  definition: BadgeDefinitionRecord;
  badgeTypeLabel: string;
  createdAt: string;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const t = useTranslations("common.internalBadges");
  return (
    <section className="rounded-3xl bg-card p-5 md:p-6">
      <Button asChild variant="ghost" size="sm" className="mb-4 w-fit">
        <Link href="/internal/badges"><ArrowLeftIcon className="size-4" />{t("badges.back")}</Link>
      </Button>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-muted">
            {definition.iconUrl ? <Image src={definition.iconUrl} alt="" width={80} height={80} unoptimized className="size-full object-cover" /> : <BadgeCheckIcon className="size-8 text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{badgeTypeLabel}</p>
            <h1 className="mt-2 font-instrument text-4xl font-light italic tracking-[-0.04em] md:text-5xl">{definition.title}</h1>
            {definition.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{definition.description}</p> : null}
            <p className="mt-3 text-xs text-muted-foreground">{createdAt}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" onClick={onEdit} variant="secondary" disabled={deleting} className="shadow-none"><Edit3Icon className="size-4" />{t("badges.edit")}</Button>
          <Button type="button" onClick={onDelete} variant="destructive" disabled={deleting} className="shadow-none">
            {deleting ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
            {t("badges.delete")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function BadgeFormModal({
  initialForm,
  onCancel,
  onSave,
}: {
  initialForm: BadgeForm;
  onCancel: () => void;
  onSave: (form: BadgeForm) => Promise<ActionResult>;
}) {
  const t = useTranslations("common.internalBadges");
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const result = await onSave(form);
      if (result.ok) onCancel();
      else setError(result.error);
    } catch (caught) {
      setError(toErrorMessage(caught, t("errors.generic")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalContent dismissible={!busy}>
      <ModalHeader>
        <ModalTitle>{form.editing ? t("badgeForm.editTitle") : t("badgeForm.createTitle")}</ModalTitle>
        <ModalDescription>{t("badgeForm.modalDescription")}</ModalDescription>
      </ModalHeader>
      <StatusNotice notice={error ? { tone: "error", text: error } : null} />
      <div className="space-y-4 pt-1">
        <Field label={t("badgeForm.nameLabel")}>
          <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={t("badgeForm.namePlaceholder")} disabled={busy} />
        </Field>
        <Field label={t("badgeForm.typeLabel")}>
          <Select value={form.badgeType} onValueChange={(value) => setForm((current) => ({ ...current, badgeType: value }))} disabled={busy}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BADGE_TYPES.map((type) => <SelectItem key={type} value={type}>{t(`types.${type}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("badgeForm.descriptionLabel")}>
          <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="min-h-28" placeholder={t("badgeForm.descriptionPlaceholder")} disabled={busy} />
        </Field>
        <Field label={t("badgeForm.iconLabel")}>
          <Input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => setForm((current) => ({ ...current, iconFile: event.target.files?.[0] ?? null }))} disabled={busy} aria-label={t("badgeForm.iconLabel")} />
        </Field>
      </div>
      <ModalFooter>
        <Button type="button" onClick={() => void handleSave()} disabled={busy} className="w-full shadow-none">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
          {form.editing ? t("badgeForm.save") : t("badgeForm.create")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="w-full">{t("badgeForm.cancel")}</Button>
      </ModalFooter>
    </ModalContent>
  );
}

function ConfirmActionModal({
  title,
  description,
  actionLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<ActionResult>;
}) {
  const t = useTranslations("common.internalBadges");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (result.ok) onCancel();
      else setError(result.error);
    } catch (caught) {
      setError(toErrorMessage(caught, t("errors.generic")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalContent dismissible={!busy}>
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>
      <StatusNotice notice={error ? { tone: "error", text: error } : null} />
      <ModalFooter>
        <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={busy} className="w-full">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
          {actionLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="w-full">{t("confirm.cancel")}</Button>
      </ModalFooter>
    </ModalContent>
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
