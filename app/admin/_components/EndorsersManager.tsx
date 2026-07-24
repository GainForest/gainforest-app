"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Building2Icon, Loader2Icon, LockIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModal } from "@/components/ui/modal/context";
import { accountPath } from "@/app/account/_lib/account-route";
import type { BuiltinEndorser, EndorserRecord } from "@/app/_lib/endorsers";
import { AdminConfirmationModal } from "./AdminConfirmationModal";

export function EndorsersManager({
  builtins,
  initial,
}: {
  builtins: BuiltinEndorser[];
  initial: EndorserRecord[];
}) {
  const t = useTranslations("common.adminEndorsers");
  const modal = useModal();
  const [endorsers, setEndorsers] = useState<EndorserRecord[]>(initial);
  const [identifier, setIdentifier] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingRkey, setRemovingRkey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const value = identifier.trim();
    if (!value || adding) return;
    setAdding(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/endorsers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: value }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as { endorser?: EndorserRecord; error?: string } | null;
      if (!response.ok || data?.error || !data?.endorser) throw new Error(t("addError"));
      const endorser = data.endorser;
      setEndorsers((previous) =>
        previous.some((entry) => entry.subjectDid === endorser.subjectDid) ? previous : [endorser, ...previous],
      );
      setIdentifier("");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (rkey: string) => {
    if (removingRkey) return;
    setRemovingRkey(rkey);
    setError(null);
    try {
      const response = await fetch(`/api/admin/endorsers/${encodeURIComponent(rkey)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok || data?.error) throw new Error(t("removeError"));
      setEndorsers((previous) => previous.filter((entry) => entry.rkey !== rkey));
    } catch (caught) {
      setError((caught as Error).message);
      throw caught;
    } finally {
      setRemovingRkey(null);
    }
  };

  const requestRemove = (endorser: EndorserRecord) => {
    modal.pushModal({
      id: `admin-endorser-remove-${endorser.rkey}`,
      content: (
        <AdminConfirmationModal
          title={t("confirmTitle")}
          description={t("confirmDescription", { name: endorser.label })}
          actionLabel={t("removeLabel", { name: endorser.label })}
          cancelLabel={t("cancel")}
          errorLabel={t("removeError")}
          onConfirm={() => remove(endorser.rkey)}
        />
      ),
    }, true);
    void modal.show();
  };

  return (
    <>
      <form onSubmit={add} className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder={t("inputPlaceholder")}
          aria-label={t("inputLabel")}
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={adding || !identifier.trim()} className="shrink-0 gap-1.5">
          {adding ? <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" /> : <PlusIcon className="size-4" />}
          {t("addButton")}
        </Button>
      </form>

      {error ? (
        <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <ul className="divide-y divide-border/70">
        {builtins.map((builtin) => (
          <li key={builtin.did} className="flex items-center gap-3 py-3 first:pt-0">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
              <Building2Icon className="size-5 text-muted-foreground" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <Link href={accountPath(builtin.handle)} className="truncate font-medium text-foreground hover:underline">
                {builtin.label}
              </Link>
              <span className="truncate text-xs text-muted-foreground">{builtin.handle}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <LockIcon className="size-3" />
              {t("builtinChip")}
            </span>
          </li>
        ))}

        {endorsers.map((endorser) => (
          <li key={endorser.rkey} className="flex items-center gap-3 py-3 last:pb-0">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
              <Building2Icon className="size-5 text-muted-foreground" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <Link
                href={accountPath(endorser.handle ?? endorser.subjectDid)}
                className="truncate font-medium text-foreground hover:underline"
              >
                {endorser.label}
              </Link>
              {endorser.handle ? <span className="truncate text-xs text-muted-foreground">{endorser.handle}</span> : null}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => requestRemove(endorser)}
              disabled={Boolean(removingRkey)}
              aria-label={t("removeLabel", { name: endorser.label })}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              {removingRkey === endorser.rkey ? (
                <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
