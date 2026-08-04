"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { InfoIcon, Loader2Icon, LockIcon, PlusIcon, ServerOffIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BlockedDomainAdminRow } from "@/app/_lib/blocked-domains";

export type BuiltinBlockedDomain = { domain: string; accountCount: number | null };

type ApiErrorCode =
  | "not_signed_in"
  | "forbidden"
  | "invalid_request"
  | "invalid_domain"
  | "builtin_domain"
  | "save_failed"
  | "delete_failed";

/**
 * Admin control for the blocked address list. Everything published by an
 * account on a blocked address stays out of the public site — the explorer,
 * search, the globe, the feed and every public count. Built-in addresses are
 * shown read-only; the ones an admin adds here can be removed again.
 */
export function AdminBlockedDomains({
  builtins,
  initial,
  canManage,
}: {
  builtins: BuiltinBlockedDomain[];
  /** null = the blocked list could not be loaded safely. */
  initial: BlockedDomainAdminRow[] | null;
  canManage: boolean;
}) {
  const t = useTranslations("common.adminBlockedDomains");
  const [domains, setDomains] = useState(initial ?? []);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingRkey, setRemovingRkey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...domains].sort((a, b) => a.domain.localeCompare(b.domain)),
    [domains],
  );

  function accountLabel(count: number | null): string {
    return count === null ? t("accountsUnknown") : t("accountCount", { count });
  }

  if (initial === null) {
    return (
      <div className="space-y-4">
        <Effect />
        <p role="alert" className="rounded-2xl border border-border/70 px-3.5 py-3 text-sm text-muted-foreground">
          {t("unavailable")}
        </p>
      </div>
    );
  }

  function errorMessage(code: string | null, fallback: "add" | "remove"): string {
    switch (code as ApiErrorCode | null) {
      case "not_signed_in":
        return t("errors.notSignedIn");
      case "forbidden":
        return t("errors.forbidden");
      case "invalid_request":
      case "invalid_domain":
        return t("errors.invalidDomain");
      case "builtin_domain":
        return t("errors.alreadyBuiltin");
      case "delete_failed":
        return t("errors.remove");
      case "save_failed":
        return t("errors.add");
      default:
        return fallback === "add" ? t("errors.add") : t("errors.remove");
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !draft.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/blocked-domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: draft }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | { blockedDomain?: BlockedDomainAdminRow; error?: string }
        | null;
      if (!response.ok || !data?.blockedDomain) {
        throw new Error(errorMessage(data?.error ?? null, "add"));
      }
      const added = data.blockedDomain;
      setDomains((previous) => [added, ...previous.filter((entry) => entry.domain !== added.domain)]);
      setDraft("");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(rkey: string) {
    if (!canManage || removingRkey) return;
    setRemovingRkey(rkey);
    setError(null);
    try {
      const response = await fetch(`/api/admin/blocked-domains/${encodeURIComponent(rkey)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(errorMessage(data?.error ?? null, "remove"));
      setDomains((previous) => previous.filter((entry) => entry.rkey !== rkey));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setRemovingRkey(null);
    }
  }

  return (
    <div className="space-y-4">
      <Effect />

      {canManage ? (
        <form
          onSubmit={add}
          className="grid gap-3 rounded-2xl border border-border/70 p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        >
          <label className="flex min-w-0 flex-col gap-1.5" htmlFor="blocked-domain-input">
            <span className="text-xs font-medium text-muted-foreground">{t("domainLabel")}</span>
            <input
              id="blocked-domain-input"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("domainPlaceholder")}
              className="h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <Button type="submit" disabled={adding || !draft.trim()} className="gap-1.5">
            {adding ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
            {adding ? t("adding") : t("add")}
          </Button>
        </form>
      ) : (
        <p className="rounded-2xl border border-border/70 px-3.5 py-3 text-sm text-muted-foreground">
          {t("permissionNotice")}
        </p>
      )}

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-border/70">
        {builtins.map((builtin) => (
          <li key={`builtin-${builtin.domain}`} className="flex items-center gap-3 py-3 first:pt-0">
            <DomainIcon />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-foreground">{builtin.domain}</span>
              <span className="truncate text-xs text-muted-foreground">
                {accountLabel(builtin.accountCount)}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <LockIcon className="size-3" />
              {t("builtinBadge")}
            </span>
          </li>
        ))}

        {sorted.map((row) => (
          <li key={row.rkey} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <DomainIcon />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-foreground">{row.domain}</span>
              <span className="truncate text-xs text-muted-foreground">
                {accountLabel(row.accountCount)}
              </span>
            </span>
            {canManage ? (
              <button
                type="button"
                onClick={() => remove(row.rkey)}
                disabled={Boolean(removingRkey)}
                aria-label={t("removeLabel", { domain: row.domain })}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {removingRkey === row.rkey ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {builtins.length === 0 && sorted.length === 0 ? (
        <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : null}
    </div>
  );
}

function Effect() {
  const t = useTranslations("common.adminBlockedDomains");
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-muted/40 px-3.5 py-3 text-sm text-muted-foreground">
      <InfoIcon className="mt-0.5 size-4 shrink-0" />
      <p className="leading-5">{t("effect")}</p>
    </div>
  );
}

function DomainIcon() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <ServerOffIcon className="size-5" />
    </span>
  );
}
