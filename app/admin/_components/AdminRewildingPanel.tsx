"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  ListPlusIcon,
  LockIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundPlusIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/app/_lib/format";
import { REWILDING_GRANT_SLOTS } from "@/app/_lib/rewilding-grantees";
import {
  REWILDING_GRANT_AMOUNT_USD,
  REWILDING_MAX_PAYOUT_USD,
} from "@/app/_lib/rewilding-milestones";
import { isDueDatePast } from "@/app/grants/_components/rewilding/model";
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
 * Milestones are per grantee: every row takes its own due date, name and
 * description (program milestones fall back to the translated program copy
 * where blank), and beyond the shared program milestones an admin can add
 * and remove custom milestones that exist for this grantee only — numbered
 * on from the program's ("M5", "M6", …). The grantee sees the same plan —
 * names, descriptions, due dates, overdue state — on their grant page.
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
  const [customPayouts, setCustomPayouts] = useState(grantee.customPayouts);
  const doneCount = milestones.filter((milestone) => milestone.done).length;

  /** Custom milestones are numbered on from the program's, in plan order —
   *  adding or removing one renumbers the ones after it. */
  const renumberCustom = (list: RewildingAdminMilestone[]) => {
    const programCount = list.filter((entry) => !entry.isCustom).length;
    let index = 0;
    return list.map((entry) =>
      entry.isCustom ? { ...entry, code: `M${programCount + (index += 1)}` } : entry,
    );
  };

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
            <PayoutSplitControl
              subjectDid={grantee.did}
              custom={customPayouts}
              milestones={milestones}
              onChange={setCustomPayouts}
            />
            <ol className="flex flex-col gap-1.5">
              {milestones.map((milestone) => (
                <MilestoneRow
                  key={milestone.id}
                  subjectDid={grantee.did}
                  milestone={milestone}
                  customPayouts={customPayouts}
                  onChanged={(next) =>
                    setMilestones((current) =>
                      current.map((entry) => (entry.id === next.id ? next : entry)),
                    )
                  }
                  onRemoved={(id) =>
                    setMilestones((current) =>
                      renumberCustom(current.filter((entry) => entry.id !== id)),
                    )
                  }
                />
              ))}
            </ol>
            <AddMilestoneForm
              subjectDid={grantee.did}
              customPayouts={customPayouts}
              onAdded={(milestone) => setMilestones((current) => renumberCustom([...current, milestone]))}
            />
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

/**
 * The grantee's payout split: a checkbox that keeps the standard handbook
 * payments (the default) or switches this grantee to a custom split. In
 * custom mode it also shows the running total against the $1,000 grant, so an
 * admin can see at a glance whether the amounts still add up. Toggling writes
 * the mode through /api/admin/rewilding and updates the card optimistically;
 * the per-milestone amounts appear on each row only while custom is on.
 */
function PayoutSplitControl({
  subjectDid,
  custom,
  milestones,
  onChange,
}: {
  subjectDid: string;
  custom: boolean;
  milestones: RewildingAdminMilestone[];
  onChange: (custom: boolean) => void;
}) {
  const t = useTranslations("common.adminModeration.rewilding");
  const format = useFormatter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const total = REWILDING_GRANT_AMOUNT_USD;
  const allocated = milestones.reduce(
    (sum, milestone) => sum + (milestone.payoutUsd ?? milestone.defaultPayout?.amountUsd ?? 0),
    0,
  );
  const balanced = allocated === total;

  const toggle = async (nextCustom: boolean) => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    onChange(nextCustom);
    try {
      await postAction({ action: "setPayoutMode", subjectDid, custom: nextCustom });
    } catch {
      onChange(!nextCustom);
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={!custom}
          disabled={pending}
          onChange={(event) => void toggle(!event.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{t("payoutDefaultLabel")}</span>
          <span className="text-[11px] leading-4 text-muted-foreground">
            {t("payoutDefaultHint", { total: format.number(total) })}
          </span>
        </span>
      </label>
      {custom ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6">
          <span
            className={cn(
              "text-[11px] font-medium",
              balanced ? "text-primary" : "text-amber-700 dark:text-amber-400",
            )}
          >
            {t("payoutAllocated", {
              allocated: format.number(allocated),
              total: format.number(total),
            })}
          </span>
          {!balanced ? (
            <span className="text-[11px] text-muted-foreground">
              {t("payoutMismatch", { total: format.number(total) })}
            </span>
          ) : null}
        </div>
      ) : null}
      {failed ? <p className="pl-6 text-[11px] text-destructive">{t("error")}</p> : null}
    </div>
  );
}

function MilestoneRow({
  subjectDid,
  milestone,
  customPayouts,
  onChanged,
  onRemoved,
}: {
  subjectDid: string;
  milestone: RewildingAdminMilestone;
  /** When true this grantee is on a custom split, so the row shows an editable
   *  amount instead of the fixed handbook payout chip. */
  customPayouts: boolean;
  onChanged: (milestone: RewildingAdminMilestone) => void;
  /** A custom milestone was removed from this grantee's plan. */
  onRemoved: (id: string) => void;
}) {
  const t = useTranslations("common.adminModeration.rewilding");
  // The grant team's wording wins; program milestones fall back to the
  // translated program copy where nothing custom is written.
  const program = useTranslations("common.rewildingProgram.milestones");
  const format = useFormatter();
  const [pending, setPending] = useState(false);
  const [planPending, setPlanPending] = useState(false);
  // The inline due-date control saves on its own, apart from the name/
  // description edit form, so it tracks its own pending state.
  const [dueDatePending, setDueDatePending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(milestone.title ?? "");
  const [descriptionDraft, setDescriptionDraft] = useState(milestone.description ?? "");
  // The inline amount control, like the due date, saves on its own and keeps
  // its own pending flag so it never mislabels the edit form's Save button.
  const [amountPending, setAmountPending] = useState(false);
  const [failed, setFailed] = useState(false);

  // The payment in force under a custom split: the grantee's override, falling
  // back to the handbook amount (custom milestones start at zero). The draft
  // resyncs whenever that changes so a save elsewhere is reflected here.
  const effectivePayoutUsd = milestone.payoutUsd ?? milestone.defaultPayout?.amountUsd ?? 0;
  const [amountDraft, setAmountDraft] = useState(String(effectivePayoutUsd));
  useEffect(() => {
    setAmountDraft(String(effectivePayoutUsd));
  }, [effectivePayoutUsd]);

  const programTitle = milestone.isCustom ? "" : program(`${milestone.id}.title`);
  const programDescription = milestone.isCustom ? "" : program(`${milestone.id}.description`);
  const name = milestone.title ?? programTitle;
  const description = milestone.description ?? (programDescription || null);
  const overdue = !milestone.done && !!milestone.dueDate && isDueDatePast(milestone.dueDate);

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

  /** Write this milestone's plan. Every event carries the full state —
   *  name, description and due date — so the call always sends all three;
   *  blanks on a program milestone mean "use the standard wording". */
  const savePlan = async (next: { dueDate: string | null; title?: string; description?: string }) => {
    if (planPending) return;
    setPlanPending(true);
    setFailed(false);
    try {
      const title = next.title !== undefined ? next.title : (milestone.title ?? "");
      const nextDescription =
        next.description !== undefined ? next.description : (milestone.description ?? "");
      await postAction({
        action: "setMilestonePlan",
        subjectDid,
        milestoneId: milestone.id,
        title,
        description: nextDescription,
        dueDate: next.dueDate ?? "",
        // Carry the current payment so editing the name never clears it.
        payoutUsd: milestone.payoutUsd,
      });
      onChanged({
        ...milestone,
        title: title.trim() || null,
        description: nextDescription.trim() || null,
        dueDate: next.dueDate,
      });
      setEditing(false);
    } catch {
      setFailed(true);
    } finally {
      setPlanPending(false);
    }
  };

  /** Set (or clear) just the due date. It is a quick inline control, separate
   *  from the name/description edit form, so it saves on its own and leaves an
   *  open edit untouched. The new date is shown straight away — the controlled
   *  input would otherwise snap back to the stored value while the save is in
   *  flight — and it keeps its own pending flag so the edit form's Save button
   *  is never mislabelled "Saving…". On failure the previous date returns. */
  const saveDueDate = async (value: string | null) => {
    if (dueDatePending) return;
    // A native date input only fires this once a full date is entered, but
    // guard against a no-op save (re-picking the same day) all the same.
    if (value === (milestone.dueDate ?? null)) return;
    const previous = milestone;
    setDueDatePending(true);
    setFailed(false);
    onChanged({ ...milestone, dueDate: value });
    try {
      await postAction({
        action: "setMilestonePlan",
        subjectDid,
        milestoneId: milestone.id,
        title: milestone.title ?? "",
        description: milestone.description ?? "",
        dueDate: value ?? "",
        // Carry the current payment so setting a date never clears it.
        payoutUsd: milestone.payoutUsd,
      });
    } catch {
      onChanged(previous);
      setFailed(true);
    } finally {
      setDueDatePending(false);
    }
  };

  /** Set this milestone's custom payment (whole USD). Like the due date it is
   *  an inline control that saves on its own — on blur or Enter — carrying the
   *  current name, description and due date so none of them is disturbed. An
   *  empty box means zero. Shown only under a custom split. */
  const saveAmount = async () => {
    if (amountPending) return;
    const parsed = Math.round(Number(amountDraft));
    const value =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, REWILDING_MAX_PAYOUT_USD) : 0;
    // Normalise what's shown (e.g. "05" → "5", "" → "0") and skip a no-op save
    // when the amount already matches what is in force.
    setAmountDraft(String(value));
    if (value === effectivePayoutUsd) return;
    const previous = milestone;
    setAmountPending(true);
    setFailed(false);
    onChanged({ ...milestone, payoutUsd: value });
    try {
      await postAction({
        action: "setMilestonePlan",
        subjectDid,
        milestoneId: milestone.id,
        title: milestone.title ?? "",
        description: milestone.description ?? "",
        dueDate: milestone.dueDate ?? "",
        payoutUsd: value,
      });
    } catch {
      onChanged(previous);
      setAmountDraft(String(effectivePayoutUsd));
      setFailed(true);
    } finally {
      setAmountPending(false);
    }
  };

  const remove = async () => {
    if (planPending) return;
    if (!window.confirm(t("removeMilestoneConfirm", { title: name }))) return;
    setPlanPending(true);
    setFailed(false);
    try {
      await postAction({
        action: "setMilestonePlan",
        subjectDid,
        milestoneId: milestone.id,
        removed: true,
      });
      onRemoved(milestone.id);
    } catch {
      setFailed(true);
      setPlanPending(false);
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
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (milestone.isCustom && !titleDraft.trim()) return;
              void savePlan({
                dueDate: milestone.dueDate,
                title: titleDraft,
                description: descriptionDraft,
              });
            }}
            className="flex flex-col gap-1.5"
          >
            <input
              type="text"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              aria-label={t("milestoneNameLabel")}
              placeholder={milestone.isCustom ? t("milestoneNamePlaceholder") : programTitle}
              maxLength={200}
              autoFocus
              className="h-8 min-w-0 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <textarea
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              aria-label={t("milestoneDescriptionLabel")}
              placeholder={milestone.isCustom ? t("milestoneDescriptionPlaceholder") : programDescription}
              maxLength={2000}
              rows={2}
              className="min-w-0 resize-y rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs leading-5 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {!milestone.isCustom ? (
              <p className="text-[11px] text-muted-foreground">{t("programCopyHint")}</p>
            ) : null}
            <span className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={planPending || (milestone.isCustom && !titleDraft.trim())}
                className="shrink-0 rounded-full border border-primary/40 bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {planPending ? t("saving") : t("editSave")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setTitleDraft(milestone.title ?? "");
                  setDescriptionDraft(milestone.description ?? "");
                }}
                className="shrink-0 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                {t("editCancel")}
              </button>
            </span>
          </form>
        ) : (
          <>
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-mono text-[10px] font-semibold text-muted-foreground">{milestone.code}</span>
              <span className="text-sm font-medium text-foreground">{name}</span>
              {milestone.isCustom ? (
                <span className="rounded-full border border-border px-2 py-px text-[10px] font-medium text-muted-foreground">
                  {t("customMilestone")}
                </span>
              ) : null}
              {overdue ? (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-px text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  {t("overdue")}
                </span>
              ) : null}
              {!customPayouts && milestone.defaultPayout ? (
                <span className="rounded-full border border-border px-2 py-px text-[10px] font-medium text-muted-foreground">
                  {t("payout", {
                    amount: format.number(milestone.defaultPayout.amountUsd),
                    tranche: milestone.defaultPayout.tranche,
                  })}
                </span>
              ) : null}
            </span>
            {description ? (
              <span className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{description}</span>
            ) : null}
          </>
        )}
        {milestone.done && milestone.updatedAt ? (
          <span className="text-[11px] text-muted-foreground">
            {t("confirmedAt", { date: formatRelative(milestone.updatedAt) })}
          </span>
        ) : null}
        {failed ? <span className="text-[11px] text-destructive">{t("error")}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {customPayouts ? (
          <span className="flex items-center rounded-lg border border-border bg-background pl-2 focus-within:ring-2 focus-within:ring-ring">
            <span className="text-xs text-muted-foreground" aria-hidden>
              $
            </span>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={amountDraft}
              onChange={(event) => setAmountDraft(event.target.value)}
              onBlur={() => void saveAmount()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              disabled={planPending || dueDatePending || amountPending}
              aria-label={t("payoutAmountLabel", { title: name })}
              className="h-8 w-16 rounded-r-lg bg-transparent px-1.5 text-xs text-foreground focus-visible:outline-none disabled:opacity-50"
            />
          </span>
        ) : null}
        <input
          type="date"
          value={milestone.dueDate ?? ""}
          onChange={(event) => void saveDueDate(event.target.value || null)}
          disabled={planPending || dueDatePending || amountPending}
          aria-label={t("dueDateLabel", { title: name })}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => {
            setTitleDraft(milestone.title ?? "");
            setDescriptionDraft(milestone.description ?? "");
            setEditing((value) => !value);
          }}
          disabled={planPending || dueDatePending || amountPending}
          aria-label={t("editMilestone", { title: name })}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <PencilIcon className="size-3.5" aria-hidden />
        </button>
        {milestone.isCustom ? (
          <button
            type="button"
            onClick={remove}
            disabled={planPending || dueDatePending || amountPending}
            aria-label={t("removeMilestone", { title: name })}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
          >
            <Trash2Icon className="size-3.5" aria-hidden />
          </button>
        ) : null}
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
      </span>
    </li>
  );
}

/**
 * Adds a milestone that exists for this grantee only — a named step with an
 * optional description and due date, numbered on from the milestones before
 * it. It behaves like any other milestone afterwards: confirmable, datable,
 * editable, removable.
 */
function AddMilestoneForm({
  subjectDid,
  customPayouts,
  onAdded,
}: {
  subjectDid: string;
  /** When true the grantee is on a custom split, so the form offers a payment
   *  amount for the new milestone. */
  customPayouts: boolean;
  /** Receives the new row with a placeholder code — the list renumbers. */
  onAdded: (milestone: RewildingAdminMilestone) => void;
}) {
  const t = useTranslations("common.adminModeration.rewilding");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (pending || !trimmed) return;
    setPending(true);
    setFailed(false);
    try {
      // A payment only applies under a custom split; a positive amount becomes
      // an override, anything else leaves the milestone unpaid.
      const parsedAmount = Math.round(Number(amount));
      const payoutUsd =
        customPayouts && Number.isFinite(parsedAmount) && parsedAmount > 0
          ? Math.min(parsedAmount, REWILDING_MAX_PAYOUT_USD)
          : null;
      const result = await postAction({
        action: "setMilestonePlan",
        subjectDid,
        title: trimmed,
        description,
        dueDate,
        payoutUsd,
      });
      const plan = result.plan as {
        milestoneId: string;
        title: string | null;
        description: string | null;
        dueDate: string | null;
        payoutUsd: number | null;
      };
      onAdded({
        id: plan.milestoneId,
        code: "",
        title: plan.title ?? trimmed,
        description: plan.description,
        dueDate: plan.dueDate,
        isCustom: true,
        defaultPayout: null,
        payoutUsd: plan.payoutUsd,
        done: false,
        updatedAt: null,
      });
      setTitle("");
      setDescription("");
      setDueDate("");
      setAmount("");
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5 rounded-xl border border-dashed border-border p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("milestoneNamePlaceholder")}
          aria-label={t("milestoneNameLabel")}
          maxLength={200}
          className="h-8 min-w-0 flex-1 basis-40 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          aria-label={t("addMilestoneDueLabel")}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {customPayouts ? (
          <span className="flex items-center rounded-lg border border-border bg-background pl-2 focus-within:ring-2 focus-within:ring-ring">
            <span className="text-xs text-muted-foreground" aria-hidden>
              $
            </span>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-label={t("payoutAmountNewLabel")}
              placeholder="0"
              className="h-8 w-16 rounded-r-lg bg-transparent px-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
            />
          </span>
        ) : null}
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        >
          <ListPlusIcon className="size-3.5" aria-hidden />
          {pending ? t("addingMilestone") : t("addMilestone")}
        </button>
      </div>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        aria-label={t("milestoneDescriptionLabel")}
        placeholder={t("milestoneDescriptionPlaceholder")}
        maxLength={2000}
        rows={2}
        className="min-w-0 resize-y rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs leading-5 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p className="text-[11px] text-muted-foreground">{t("addMilestoneHint")}</p>
      {failed ? <p className="text-[11px] text-destructive">{t("error")}</p> : null}
    </form>
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
