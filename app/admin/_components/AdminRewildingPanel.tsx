"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  LockIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundPlusIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/app/_lib/format";
import { REWILDING_GRANT_SLOTS } from "@/app/_lib/rewilding-grantees";
import { accountPath } from "@/app/account/_lib/account-route";
import type {
  RewildingAdminDocument,
  RewildingAdminGrantee,
  RewildingAdminMilestone,
} from "../_lib/rewilding-admin";
import { AdminAvatar } from "./AdminPanel";

/**
 * "Rewilding the Web" admin section: the program's ten slots.
 *
 * A slot is either held by an enrolled organization or open. Enrolling an
 * organization (search by name, add) is what admits them to the program —
 * from that moment their account can open the grantee dashboard at
 * /grants/my-grant. Each filled slot expands into the contract milestone
 * checklist (marking one done is GainForest's confirmation — it releases
 * the matching payment tranche) and the private grant documents.
 * All writes go through /api/admin/rewilding.
 *
 * Documents are private to the admin group: they are stored outside the
 * public repo and have no shareable URL, so opening one asks the server for
 * a link that expires within minutes.
 */

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const ACCEPTED_FILE_TYPES =
  ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.odt,application/pdf,image/jpeg,image/png,image/webp";

async function postAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/admin/rewilding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !json || typeof json.error === "string") {
    throw new Error(typeof json?.error === "string" ? json.error : "save_failed");
  }
  return json;
}

/** Last resort when an account has no resolvable handle: enough of the DID to
 *  tell two same-named accounts apart. */
function shortDid(did: string): string {
  return did.length > 18 ? `${did.slice(0, 12)}…${did.slice(-6)}` : did;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function AdminRewildingPanel({
  grantees,
  documentStorageConfigured,
}: {
  grantees: RewildingAdminGrantee[];
  /** False when this deployment has no private storage for documents. */
  documentStorageConfigured: boolean;
}) {
  const t = useTranslations("common.adminModeration.rewilding");
  const openSlots = Math.max(0, REWILDING_GRANT_SLOTS - grantees.length);

  return (
    <ul className="flex flex-col gap-3">
      {grantees.map((grantee, index) => (
        <GranteeCard
          key={grantee.did}
          grantee={grantee}
          slotNumber={index + 1}
          documentStorageConfigured={documentStorageConfigured}
        />
      ))}
      {openSlots > 0 ? <AddGranteeSlot slotNumber={grantees.length + 1} /> : null}
      {Array.from({ length: Math.max(0, openSlots - 1) }, (_, index) => {
        const slotNumber = grantees.length + 2 + index;
        return (
          <li
            key={`open-${slotNumber}`}
            className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground/70"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-border text-[11px] font-semibold">
              {slotNumber}
            </span>
            {t("slotOpen", { number: slotNumber })}
          </li>
        );
      })}
    </ul>
  );
}

type GranteeSearchResult = {
  did: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  alreadyEnrolled: boolean;
};

/**
 * The next open slot: search certified profiles by name and enroll one into
 * the program. Enrollment is what unlocks the grantee dashboard for that
 * account, so this is the program's front door — the server re-checks the
 * ten-slot cap on every add.
 */
function AddGranteeSlot({ slotNumber }: { slotNumber: number }) {
  const t = useTranslations("common.adminModeration.rewilding");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GranteeSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [addingDid, setAddingDid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced name search against the moderator-gated endpoint.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/admin/rewilding/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        const json = (await response.json().catch(() => null)) as
          | { results?: GranteeSearchResult[] }
          | null;
        if (!response.ok) throw new Error("search_failed");
        setResults(json?.results ?? []);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const add = async (result: GranteeSearchResult) => {
    if (addingDid) return;
    setAddingDid(result.did);
    setError(null);
    try {
      await postAction({ action: "addGrantee", subjectDid: result.did });
      setQuery("");
      setResults(null);
      // The row needs the server-side joins (milestones, badge, application
      // text), so re-render the page from the loader instead of guessing.
      router.refresh();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "save_failed";
      setError(code === "slots_full" ? t("slotsFull") : t("error"));
    } finally {
      setAddingDid(null);
    }
  };

  return (
    <li className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-primary/40 bg-primary/[0.03] px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-primary/40 text-[11px] font-semibold text-primary">
          {slotNumber}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <UserRoundPlusIcon className="size-3.5 text-primary" aria-hidden />
            {t("addTitle")}
          </span>
          <span className="text-xs text-muted-foreground">{t("addHint")}</span>
        </div>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("addTitle")}
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {searching ? (
        <p className="text-xs text-muted-foreground">{t("searching")}</p>
      ) : results !== null && results.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("searchEmpty", { query: query.trim() })}</p>
      ) : results !== null ? (
        <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-background">
          {results.map((result) => (
            <li key={result.did} className="flex items-center gap-2.5 px-3 py-2">
              <AdminAvatar url={result.avatarUrl} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{result.displayName}</span>
                {/* Several accounts share a display name — the handle is the
                    only thing distinguishing them in this list. */}
                <span className="truncate text-[11px] text-muted-foreground">
                  {result.handle ? `@${result.handle}` : shortDid(result.did)}
                </span>
              </span>
              {result.alreadyEnrolled ? (
                <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {t("alreadyEnrolled")}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => add(result)}
                  disabled={addingDid !== null}
                  className="shrink-0 rounded-full border border-primary/40 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {addingDid === result.did ? t("adding") : t("add")}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </li>
  );
}

function GranteeCard({
  grantee,
  slotNumber,
  documentStorageConfigured,
}: {
  grantee: RewildingAdminGrantee;
  slotNumber: number;
  documentStorageConfigured: boolean;
}) {
  const t = useTranslations("common.adminModeration.rewilding");
  const [open, setOpen] = useState(false);
  const [milestones, setMilestones] = useState(grantee.milestones);
  const [documents, setDocuments] = useState(grantee.documents);
  const doneCount = milestones.filter((milestone) => milestone.done).length;

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="grid size-5 shrink-0 place-items-center self-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
          {slotNumber}
        </span>
        <AdminAvatar url={grantee.avatarUrl} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-foreground">
              {grantee.displayName || t("unnamedGrantee")}
            </span>
            {/* Display names repeat across accounts, so the handle is what
                identifies which one holds this slot. */}
            {grantee.handle ? (
              <span className="truncate text-xs text-muted-foreground">@{grantee.handle}</span>
            ) : null}
            {grantee.hasGrantBadge ? (
              <span className="rounded-full border border-primary/40 px-2 py-px text-[10px] font-medium text-primary">
                {t("granteeBadge")}
              </span>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("summary", { done: doneCount, total: milestones.length, documents: documents.length })}
          </span>
        </span>
        <ChevronDownIcon
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-border/70 px-3.5 py-4">
          {grantee.applicationText ? (
            <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">{grantee.applicationText}</p>
          ) : null}

          <section className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("milestonesTitle")}
            </h4>
            <ol className="flex flex-col gap-1.5">
              {milestones.map((milestone) => (
                <MilestoneRow
                  key={milestone.id}
                  subjectDid={grantee.did}
                  milestone={milestone}
                  onChanged={(next) =>
                    setMilestones((current) =>
                      current.map((entry) => (entry.id === next.id ? next : entry)),
                    )
                  }
                />
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <LockIcon className="size-3" aria-hidden />
              {t("documentsTitle")}
            </h4>
            <p className="text-[11px] leading-5 text-muted-foreground">{t("documentsPrivateNote")}</p>
            <DocumentList
              documents={documents}
              onDeleted={(id) => setDocuments((current) => current.filter((entry) => entry.id !== id))}
            />
            {documentStorageConfigured ? (
              <DocumentUploadForm
                subjectDid={grantee.did}
                onUploaded={(document) => setDocuments((current) => [document, ...current])}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                {t("storageUnavailable")}
              </p>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={accountPath(grantee.did)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t("openProfile")}
            </Link>
            <RemoveGranteeButton grantee={grantee} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Frees the slot. Milestones and documents are kept — removal only takes
 *  away dashboard access and the seat, and it can be reversed by re-adding. */
function RemoveGranteeButton({ grantee }: { grantee: RewildingAdminGrantee }) {
  const t = useTranslations("common.adminModeration.rewilding");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const remove = async () => {
    if (pending) return;
    const name = grantee.displayName || t("unnamedGrantee");
    if (!window.confirm(t("removeConfirm", { name }))) return;
    setPending(true);
    try {
      await postAction({ action: "removeGrantee", subjectDid: grantee.did });
      router.refresh();
    } catch {
      window.alert(t("error"));
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? t("removing") : t("remove")}
    </button>
  );
}

function MilestoneRow({
  subjectDid,
  milestone,
  onChanged,
}: {
  subjectDid: string;
  milestone: RewildingAdminMilestone;
  onChanged: (milestone: RewildingAdminMilestone) => void;
}) {
  const t = useTranslations("common.adminModeration.rewilding");
  // Milestone names are program copy shared with the grantee's own page.
  const program = useTranslations("common.rewildingProgram.milestones");
  const format = useFormatter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await postAction({
        action: "setMilestone",
        subjectDid,
        milestoneId: milestone.id,
        done: !milestone.done,
      });
      onChanged({ ...milestone, done: !milestone.done, updatedAt: new Date().toISOString() });
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-2.5 rounded-xl border border-border px-3 py-2.5",
        milestone.done && "border-primary/30 bg-primary/[0.04]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-4.5 shrink-0 place-items-center rounded-md border",
          milestone.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
        )}
      >
        {milestone.done ? <CheckIcon className="size-3" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-[10px] font-semibold text-muted-foreground">{milestone.code}</span>
          <span className="text-sm font-medium text-foreground">
            {program(`${milestone.id}.title`)}
          </span>
          {milestone.payout ? (
            <span className="rounded-full border border-border px-2 py-px text-[10px] font-medium text-muted-foreground">
              {t("payout", {
                amount: format.number(milestone.payout.amountUsd),
                tranche: milestone.payout.tranche,
              })}
            </span>
          ) : null}
        </span>
        {milestone.done && milestone.updatedAt ? (
          <span className="text-[11px] text-muted-foreground">
            {t("confirmedAt", { date: formatRelative(milestone.updatedAt) })}
          </span>
        ) : null}
        {failed ? <span className="text-[11px] text-destructive">{t("error")}</span> : null}
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
          milestone.done
            ? "border-border bg-background text-muted-foreground hover:bg-muted"
            : "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {pending ? t("saving") : milestone.done ? t("reopen") : t("markDone")}
      </button>
    </li>
  );
}

function DocumentList({
  documents,
  onDeleted,
}: {
  documents: RewildingAdminDocument[];
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("common.adminModeration.rewilding");
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (documents.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("documentsEmpty")}</p>;
  }

  const remove = async (document: RewildingAdminDocument) => {
    if (pendingId) return;
    if (!window.confirm(t("deleteConfirm", { title: document.title }))) return;
    setPendingId(document.id);
    try {
      await postAction({ action: "deleteDocument", id: document.id });
      onDeleted(document.id);
    } catch {
      window.alert(t("error"));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <ul className="flex flex-col gap-1.5">
      {documents.map((document) => (
        <li
          key={document.id}
          className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2"
        >
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{document.title}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {document.fileName}
              {document.uploadedAt ? ` · ${formatRelative(document.uploadedAt)}` : null}
            </span>
          </span>
          <DocumentOpenButton document={document} />
          <button
            type="button"
            onClick={() => remove(document)}
            disabled={pendingId === document.id}
            aria-label={t("delete", { title: document.title })}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
          >
            <Trash2Icon className="size-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Documents have no public URL — open one by asking the server for a link
 *  that expires within minutes, then following it. */
function DocumentOpenButton({ document }: { document: RewildingAdminDocument }) {
  const t = useTranslations("common.adminModeration.rewilding");
  const [pending, setPending] = useState(false);

  const open = async () => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/rewilding/documents/${document.id}`);
      const json = (await response.json().catch(() => null)) as { url?: string } | null;
      if (!response.ok || !json?.url) throw new Error("link_failed");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      window.alert(t("error"));
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? t("opening") : t("open")}
    </button>
  );
}

function DocumentUploadForm({
  subjectDid,
  onUploaded,
}: {
  subjectDid: string;
  onUploaded: (document: RewildingAdminDocument) => void;
}) {
  const t = useTranslations("common.adminModeration.rewilding");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (next: File | null) => {
    setError(null);
    setFile(next);
    if (next && !title.trim()) {
      // Default the display name to the file name, minus its extension.
      setTitle(next.name.replace(/\.[^.]+$/, ""));
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || !file || !title.trim()) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(t("fileTooLarge"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await postAction({
        action: "addDocument",
        subjectDid,
        title: title.trim(),
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        dataBase64: toBase64(bytes),
      });
      onUploaded(result.document as RewildingAdminDocument);
      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "save_failed";
      setError(
        code === "file_too_large"
          ? t("fileTooLarge")
          : code === "file_type_unsupported"
            ? t("fileTypeUnsupported")
            : t("error"),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("uploadTitlePlaceholder")}
          aria-label={t("uploadTitleLabel")}
          maxLength={200}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          aria-label={t("uploadFileLabel")}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-foreground"
        />
        <button
          type="submit"
          disabled={pending || !file || !title.trim()}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        >
          <UploadIcon className="size-3.5" aria-hidden />
          {pending ? t("uploading") : t("upload")}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("uploadHint")}</p>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </form>
  );
}
