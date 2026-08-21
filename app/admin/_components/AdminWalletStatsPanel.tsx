"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  // Which row the keyboard is on: -1 means the search box, 0..n-1 a wallet row.
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLAnchorElement | null>>([]);

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

  // A new search restarts navigation at the search box, so the highlight never
  // points past the end of a shortened list.
  useEffect(() => {
    setActiveIndex(-1);
  }, [term]);

  function focusRow(index: number) {
    const clamped = Math.max(0, Math.min(index, filtered.length - 1));
    rowRefs.current[clamped]?.focus();
    setActiveIndex(clamped);
  }

  // ↑/↓ walk the list; ↑ from the first row returns to the search box, and ↓
  // from the search box steps into the list. Enter opens the focused account
  // through the row's own link, so it needs no handling here.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (filtered.length === 0) return;
    event.preventDefault();
    if (event.key === "ArrowDown") {
      focusRow(activeIndex + 1);
    } else if (activeIndex <= 0) {
      inputRef.current?.focus();
      setActiveIndex(-1);
    } else {
      focusRow(activeIndex - 1);
    }
  }

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
    <div className="space-y-4" onKeyDown={handleKeyDown}>
      <div>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setActiveIndex(-1)}
            placeholder={t("searchPlaceholder")}
            className="ps-9"
            aria-label={t("searchPlaceholder")}
          />
        </div>
        {filtered.length > 0 ? (
          <p className="mt-1.5 px-1 text-xs text-muted-foreground">{t("keyboardHint")}</p>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <AdminEmptyState>{t("noMatches")}</AdminEmptyState>
      ) : (
        <ul className="divide-y divide-border/70">
          {filtered.map((row, index) => (
            <WalletStatRowItem
              key={row.did}
              row={row}
              active={index === activeIndex}
              rowRef={(el) => {
                rowRefs.current[index] = el;
              }}
              onFocus={() => setActiveIndex(index)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function WalletStatRowItem({
  row,
  active,
  rowRef,
  onFocus,
}: {
  row: WalletStatRow;
  active: boolean;
  rowRef: (el: HTMLAnchorElement | null) => void;
  onFocus: () => void;
}) {
  const t = useTranslations("common.adminWalletStats");
  const format = useFormatter();
  const kindLabel = row.kind === "org" ? t("organization") : t("person");
  const KindIcon = row.kind === "org" ? Building2Icon : ShieldCheckIcon;
  const created = row.createdAt
    ? format.dateTime(new Date(row.createdAt), { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0",
        active && "bg-muted/40",
      )}
    >
      <Link
        ref={rowRef}
        href={accountPath(row.did)}
        onFocus={onFocus}
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
