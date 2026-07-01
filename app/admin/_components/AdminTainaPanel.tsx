"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckIcon, ExternalLinkIcon, Loader2Icon, SendIcon } from "lucide-react";
import type { TainaAdminResident } from "@/app/_lib/taina-agent";
import { formatRelative } from "@/app/_lib/format";
import { accountPath } from "@/app/account/_lib/account-route";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AdminAvatar, AdminEmptyState } from "./AdminModerationDashboard";

/** A runtime resident enriched server-side with the owner's profile card. */
export type AdminTainaRow = TainaAdminResident & {
  displayName: string | null;
  avatarUrl: string | null;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Admin roster of every Tainá agent: who runs it, its Telegram bot, when it
 * was last used and what it has spent — plus a per-row composer that delivers
 * a message to the observer through their own agent, in Tainá's voice.
 */
export function AdminTainaPanel({
  rows,
  allowanceUsd,
}: {
  rows: AdminTainaRow[] | null;
  allowanceUsd: number;
}) {
  const t = useTranslations("common.adminTaina");

  if (rows === null) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {t("unavailable")}
      </div>
    );
  }
  if (rows.length === 0) return <AdminEmptyState>{t("empty")}</AdminEmptyState>;

  return (
    <ul className="divide-y divide-border/70">
      {rows.map((row) => (
        <TainaRow key={row.did} row={row} allowanceUsd={allowanceUsd} />
      ))}
    </ul>
  );
}

function TainaRow({ row, allowanceUsd }: { row: AdminTainaRow; allowanceUsd: number }) {
  const t = useTranslations("common.adminTaina");
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendState, setSendState] = useState<null | "sent" | "failed">(null);

  async function send() {
    const message = text.trim();
    if (!message) return;
    setSending(true);
    setSendState(null);
    try {
      const response = await fetch("/api/admin/taina/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ did: row.did, text: message }),
      });
      if (!response.ok) throw new Error();
      setSendState("sent");
      setText("");
    } catch {
      setSendState("failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={accountPath(row.did)}
          className="flex min-w-0 flex-1 basis-52 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AdminAvatar url={row.avatarUrl} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground" title={row.focus ?? undefined}>
              {row.displayName || t("unnamed")}
            </span>
            <span className="truncate text-xs text-muted-foreground">{row.handle}</span>
          </span>
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={!row.activated}
          title={row.activated ? undefined : t("notActivated")}
          onClick={() => {
            setComposing((open) => !open);
            setSendState(null);
          }}
        >
          <SendIcon />
          {t("message")}
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-13 text-xs text-muted-foreground">
        <a
          href={row.botUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-foreground/80 underline-offset-4 hover:underline"
        >
          {row.bot}
          <ExternalLinkIcon className="size-3" />
        </a>
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn("size-1.5 rounded-full", row.activated ? "bg-primary" : "bg-muted-foreground/50")}
          />
          {row.activated ? t("statusActive") : t("statusPending")}
        </span>
        <span>
          {row.lastUsedAt ? t("lastUsed", { when: formatRelative(row.lastUsedAt) }) : t("neverUsed")}
        </span>
        <span className="tabular-nums" title={t("creditsAllowance", { allowance: usd.format(allowanceUsd) })}>
          {t("credits", { used: usd.format(row.creditsUsedUsd) })}
        </span>
      </div>

      {composing ? (
        <div className="mt-3 rounded-2xl border border-border bg-muted/30 p-3 sm:ml-13">
          <Textarea
            value={text}
            maxLength={4000}
            rows={3}
            placeholder={t("messagePlaceholder")}
            onChange={(event) => {
              setText(event.target.value);
              setSendState(null);
            }}
            className="bg-background"
            autoFocus
          />
          <p className="mt-2 text-xs text-muted-foreground">{t("messageHint")}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <Button type="button" size="sm" disabled={sending || !text.trim()} onClick={() => void send()}>
              {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              {sending ? t("sending") : t("send")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sending}
              onClick={() => {
                setComposing(false);
                setText("");
                setSendState(null);
              }}
            >
              {t("cancel")}
            </Button>
            {sendState === "sent" ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-primary">
                <CheckIcon className="size-4" />
                {t("sent")}
              </span>
            ) : null}
          </div>
          {sendState === "failed" ? (
            <p className="mt-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {t("sendFailed")}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
