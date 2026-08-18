"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Building2Icon, SearchIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";
import type { WalletStatRow } from "@/app/admin/_lib/wallet-stats";
import { accountPath } from "@/app/account/_lib/account-route";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AdminAvatar, AdminEmptyState } from "./AdminPanel";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Admin statistics — "Wallets created": the accounts that have created a
 * donation wallet in the app, newest first. The data is loaded server-side by
 * the statistics page (the whole set is a couple of small indexer queries);
 * `rows: null` means that load failed.
 */
export function AdminWalletStatsPanel({ rows }: { rows: WalletStatRow[] | null }) {
  const t = useTranslations("common.adminWalletStats");
  const [query, setQuery] = useState("");

  // The full set is already in the browser (a few dozen rows), so filtering by
  // name or handle is instant and needs no server round-trip.
  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return rows ?? [];
    return (rows ?? []).filter((row) => {
      const name = row.displayName?.toLowerCase() ?? "";
      const handle = row.handle?.toLowerCase() ?? "";
      return name.includes(term) || handle.includes(term);
    });
  }, [rows, term]);

  if (rows === null) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {t("unavailable")}
      </div>
    );
  }

  if (rows.length === 0) {
    return <AdminEmptyState>{t("empty")}</AdminEmptyState>;
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
          aria-label={t("searchPlaceholder")}
        />
      </div>

      {filtered.length === 0 ? (
        <AdminEmptyState>{t("noMatches")}</AdminEmptyState>
      ) : (
        <ul className="divide-y divide-border/70">
          {filtered.map((row) => (
            <WalletStatRowItem key={row.did} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function WalletStatRowItem({ row }: { row: WalletStatRow }) {
  const t = useTranslations("common.adminWalletStats");
  const format = useFormatter();
  const kindLabel = row.kind === "org" ? t("organization") : t("person");
  const KindIcon = row.kind === "org" ? Building2Icon : ShieldCheckIcon;
  const created = row.createdAt
    ? format.dateTime(new Date(row.createdAt), { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <li className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
      <Link
        href={accountPath(row.did)}
        className="flex min-w-0 flex-1 basis-52 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AdminAvatar url={row.avatarUrl} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium text-foreground">
              {row.displayName || row.handle || t("unnamed")}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                row.kind === "org"
                  ? "border-primary/20 bg-primary/[0.08] text-primary"
                  : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              <KindIcon className="size-2.5" />
              {kindLabel}
            </span>
          </span>
          <span className="truncate text-xs text-muted-foreground">{row.handle || row.did}</span>
        </span>
      </Link>

      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <WalletIcon className="size-3.5 text-primary" />
        {row.address ? (
          <code className="font-mono text-foreground/80" title={row.address}>
            {shortAddress(row.address)}
          </code>
        ) : null}
        {row.walletName ? <span title={row.walletName}>· {row.walletName}</span> : null}
        {row.signerCount !== null ? <span>· {t("signers", { count: row.signerCount })}</span> : null}
        {row.legacy ? <span>· {t("legacy")}</span> : null}
        {created ? (
          <span>
            · {t("created", { date: created })}
          </span>
        ) : null}
      </span>
    </li>
  );
}
