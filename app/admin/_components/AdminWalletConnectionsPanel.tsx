"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Building2Icon,
  Loader2Icon,
  SearchIcon,
  ShieldCheckIcon,
  WalletIcon,
} from "lucide-react";
import type { WalletConnectionsSearchResult } from "@/app/admin/_lib/wallet-connections";
import { MIN_WALLET_SEARCH_LENGTH } from "@/app/_lib/wallet-domain";
import { accountPath } from "@/app/account/_lib/account-route";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AdminAvatar, AdminEmptyState } from "./AdminPanel";

type Row = WalletConnectionsSearchResult["rows"][number];

const DEBOUNCE_MS = 350;

function shortAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Admin "Wallet connections": search for an account by name, handle or DID,
 * and see which wallets it has connected (a donation vault and/or linked EVM
 * wallets). Runs a cheap on-demand lookup on the server (no full PDS scan).
 */
export function AdminWalletConnectionsPanel() {
  const t = useTranslations("common.adminWalletConnections");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [searched, setSearched] = useState(false);

  // Debounce the input so we don't fire a lookup on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const term = debounced.toLowerCase();
    if (term && term.length < MIN_WALLET_SEARCH_LENGTH) {
      setRows([]);
      setSearched(false);
      return;
    }
    if (!term) {
      setRows([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch(`/api/admin/wallets?q=${encodeURIComponent(term)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const json = (await response.json()) as WalletConnectionsSearchResult;
        if (!cancelled) {
          setRows(json.rows ?? []);
          setSearched(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const tooShort = query.trim().length > 0 && query.trim().length < MIN_WALLET_SEARCH_LENGTH;

  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="ps-9"
          aria-label={t("searchPlaceholder")}
          autoFocus
        />
      </div>

      {query.trim().length === 0 ? (
        <AdminEmptyState>{t("prompt")}</AdminEmptyState>
      ) : null}

      {tooShort ? (
        <p className="text-sm text-muted-foreground">
          {t("minChars", { count: MIN_WALLET_SEARCH_LENGTH })}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          {t("searching")}
        </div>
      ) : null}

      {failed ? (
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t("unavailable")}
        </div>
      ) : null}

      {!loading && !failed && searched && rows.length === 0 ? (
        <AdminEmptyState>{t("noMatches")}</AdminEmptyState>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y divide-border/70">
          {rows.map((row) => (
            <WalletConnectionRow key={row.did} row={row} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WalletConnectionRow({ row }: { row: Row }) {
  const t = useTranslations("common.adminWalletConnections");
  const kindLabel = row.kind === "org" ? t("organization") : t("person");
  const KindIcon = row.kind === "org" ? Building2Icon : ShieldCheckIcon;
  const hasAny = Boolean(row.vault) || row.linkedEvm.length > 0;

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-3">
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
      </div>

      {hasAny ? (
        <div className="mt-2.5 flex flex-col gap-1.5 ps-13 text-xs">
          {row.vault ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
              <WalletIcon className="size-3.5 text-primary" />
              <span className="font-medium text-foreground">{t("vaultWallet")}</span>
              <code className="font-mono text-foreground/80" title={row.vault.address}>
                {shortAddress(row.vault.address)}
              </code>
              {row.vault.name ? <span title={row.vault.name}>· {row.vault.name}</span> : null}
              <span>· {t("signers", { count: row.vault.signerCount })}</span>
              {row.vault.legacy ? <span>· {t("legacy")}</span> : null}
            </span>
          ) : null}
          {row.linkedEvm.map((link) => (
            <span
              key={`${link.address}-${link.createdAt ?? ""}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground"
            >
              <WalletIcon className="size-3.5 text-muted-foreground/70" />
              <span className="font-medium text-foreground">{t("linkedWallet")}</span>
              <code className="font-mono text-foreground/80" title={link.address}>
                {shortAddress(link.address)}
              </code>
              {link.name ? <span title={link.name}>· {link.name}</span> : null}
              {!link.valid ? <span>· {t("unverified")}</span> : null}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 ps-13 text-xs text-muted-foreground">{t("noWallet")}</p>
      )}
    </li>
  );
}