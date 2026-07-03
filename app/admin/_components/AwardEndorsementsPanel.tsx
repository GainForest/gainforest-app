"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AwardIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { formatCgsErrorMessage } from "@/app/_lib/cgs-errors";
import { formatRelative } from "@/app/_lib/format";
import { accountPath } from "@/app/account/_lib/account-route";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AwardEndorsementsData, EndorsementAwardRow } from "../_lib/award-endorsements";
import { AdminAvatar, AdminEmptyState } from "./AdminModerationDashboard";

const BADGE_AWARD_COLLECTION = "app.certified.badge.award";

type RecipientResult =
  | { kind: "email"; email: string }
  | { kind: "did"; did: string; handle: string | null; displayName: string | null; avatarUrl: string | null };

/**
 * The /admin "Award endorsements" tab body: GainForest org admins endorse
 * other organizations by signing an `app.certified.badge.award` (endorsement
 * badge) in the GainForest repo. Reads and writes go through the internal
 * badge API routes, which are gated to owners/admins of the GainForest org —
 * so a moderator who isn't one only sees the explanatory notice.
 */
export function AwardEndorsementsPanel({ data }: { data: AwardEndorsementsData }) {
  const t = useTranslations("common.adminAwardEndorsements");
  const [awards, setAwards] = useState<EndorsementAwardRow[]>(data.awards);
  const [identifier, setIdentifier] = useState("");
  const [note, setNote] = useState("");
  const [badgeUri, setBadgeUri] = useState(data.definitions[0]?.uri ?? "");
  const [awarding, setAwarding] = useState(false);
  const [removingRkey, setRemovingRkey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data.allowed) {
    return <AdminEmptyState>{t("notAllowed")}</AdminEmptyState>;
  }

  if (data.definitions.length === 0) {
    return (
      <AdminEmptyState>
        {t("noBadges")}{" "}
        <Link href="/internal/badges" className="font-medium text-foreground underline underline-offset-2">
          {t("manageBadges")}
        </Link>
      </AdminEmptyState>
    );
  }

  const selectedBadge = data.definitions.find((definition) => definition.uri === badgeUri) ?? data.definitions[0];
  const showBadgePicker = data.definitions.length > 1;

  const award = async (event: FormEvent) => {
    event.preventDefault();
    const value = identifier.trim();
    if (!value || awarding) return;
    setAwarding(true);
    setError(null);
    try {
      const params = new URLSearchParams({ identifier: value });
      const lookup = await fetch(`/api/internal/badges/recipient?${params.toString()}`, { cache: "no-store" });
      const recipient = (await lookup.json().catch(() => null)) as
        | (RecipientResult & { error?: string; message?: string })
        | null;
      if (!lookup.ok || !recipient || recipient.error) {
        throw new Error(recipient?.message ?? recipient?.error ?? t("awardError"));
      }
      if (recipient.kind !== "did") throw new Error(t("emailNotSupported"));
      if (awards.some((entry) => entry.subjectDid === recipient.did && entry.badgeUri === selectedBadge.uri)) {
        throw new Error(t("alreadyEndorsed"));
      }

      const response = await fetch("/api/internal/badges/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "createRecord",
          collection: BADGE_AWARD_COLLECTION,
          record: {
            $type: BADGE_AWARD_COLLECTION,
            badge: { uri: selectedBadge.uri, cid: selectedBadge.cid },
            subject: { $type: "app.certified.defs#did", did: recipient.did },
            note: note.trim() || undefined,
            createdAt: new Date().toISOString(),
          },
        }),
        cache: "no-store",
      });
      const created = (await response.json().catch(() => null)) as
        | { uri?: string; error?: string; message?: string }
        | null;
      if (!response.ok || !created?.uri || created.error) {
        throw new Error(formatCgsErrorMessage(created?.message ?? created?.error, t("awardError")));
      }

      const row: EndorsementAwardRow = {
        rkey: created.uri.split("/").pop() ?? "",
        badgeUri: selectedBadge.uri,
        badgeTitle: selectedBadge.title,
        subjectDid: recipient.did,
        displayName: recipient.displayName?.trim() || recipient.handle || null,
        avatarUrl: recipient.avatarUrl,
        note: note.trim() || null,
        createdAt: new Date().toISOString(),
      };
      setAwards((previous) => [row, ...previous]);
      setIdentifier("");
      setNote("");
    } catch (caught) {
      setError((caught as Error).message || t("awardError"));
    } finally {
      setAwarding(false);
    }
  };

  const remove = async (rkey: string) => {
    if (removingRkey) return;
    setRemovingRkey(rkey);
    setError(null);
    try {
      const response = await fetch("/api/internal/badges/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "deleteRecord", collection: BADGE_AWARD_COLLECTION, rkey }),
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok || result?.error) {
        throw new Error(formatCgsErrorMessage(result?.message ?? result?.error, t("removeError")));
      }
      setAwards((previous) => previous.filter((entry) => entry.rkey !== rkey));
    } catch (caught) {
      setError((caught as Error).message || t("removeError"));
    } finally {
      setRemovingRkey(null);
    }
  };

  return (
    <>
      <form onSubmit={award} className="mb-4 flex flex-col gap-2">
        {showBadgePicker ? (
          <Select value={selectedBadge.uri} onValueChange={setBadgeUri} disabled={awarding}>
            <SelectTrigger className="w-full sm:max-w-xs" aria-label={t("badgeLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.definitions.map((definition) => (
                <SelectItem key={definition.uri} value={definition.uri}>
                  {definition.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder={t("inputPlaceholder")}
            aria-label={t("inputLabel")}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <Button type="submit" disabled={awarding || !identifier.trim()} className="shrink-0 gap-1.5">
            {awarding ? <Loader2Icon className="size-4 animate-spin" /> : <AwardIcon className="size-4" />}
            {t("awardButton")}
          </Button>
        </div>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("notePlaceholder")}
          aria-label={t("noteLabel")}
          className="min-w-0 rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </form>

      {error ? (
        <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {awards.length === 0 ? (
        <AdminEmptyState>{t("empty")}</AdminEmptyState>
      ) : (
        <ul className="divide-y divide-border/70">
          {awards.map((entry) => (
            <li key={entry.rkey} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <AdminAvatar url={entry.avatarUrl} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-2">
                  <Link
                    href={accountPath(entry.subjectDid)}
                    className="truncate font-medium text-foreground hover:underline"
                  >
                    {entry.displayName || t("unnamed")}
                  </Link>
                  {entry.createdAt ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(entry.createdAt)}</span>
                  ) : null}
                </span>
                {showBadgePicker && entry.badgeTitle ? (
                  <span className="truncate text-xs text-muted-foreground">{entry.badgeTitle}</span>
                ) : null}
                {entry.note ? (
                  <span className="mt-0.5 line-clamp-1 text-sm leading-relaxed text-muted-foreground">{entry.note}</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => remove(entry.rkey)}
                disabled={Boolean(removingRkey)}
                aria-label={t("removeLabel", { name: entry.displayName || t("unnamed") })}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                {removingRkey === entry.rkey ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
