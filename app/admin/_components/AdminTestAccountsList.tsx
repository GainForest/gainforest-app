"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, UndoIcon, UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { accountPath } from "@/app/account/_lib/account-route";
import type { FlaggedTestAccount } from "@/app/internal/badges/_lib/test-accounts";
import { AdminConfirmationModal } from "./AdminConfirmationModal";
import { AdminEmptyState } from "./AdminModerationDashboard";

export function AdminTestAccountsList({ accounts: initial }: { accounts: FlaggedTestAccount[] }) {
  const t = useTranslations("common.adminTestAccounts");
  const router = useRouter();
  const modal = useModal();
  const [accounts, setAccounts] = useState(initial);
  const [busyDid, setBusyDid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(did: string) {
    setBusyDid(did);
    setError(null);
    try {
      const response = await fetch("/api/internal/test-accounts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ did }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok || data?.error) throw new Error(t("error"));
      setAccounts((current) => current.filter((account) => account.did !== did));
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("error");
      setError(message);
      throw caught;
    } finally {
      setBusyDid(null);
    }
  }

  function requestRemove(account: FlaggedTestAccount, name: string) {
    modal.pushModal({
      id: `admin-test-account-remove-${account.did}`,
      content: (
        <AdminConfirmationModal
          title={t("confirmTitle")}
          description={t("confirmDescription", { name })}
          actionLabel={t("remove")}
          cancelLabel={t("cancel")}
          errorLabel={t("error")}
          onConfirm={() => remove(account.did)}
        />
      ),
    }, true);
    void modal.show();
  }

  // Heading, count and description come from the AdminPanel shell that wraps
  // this list on /admin — the component renders just the rows.
  return (
    <section>
      {error ? (
        <p aria-live="polite" className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {accounts.length === 0 ? (
        <AdminEmptyState>{t("empty")}</AdminEmptyState>
      ) : (
        <ul className="divide-y divide-border/70">
          {accounts.map((account) => {
            const name = account.displayName || t("unnamed");
            const busy = busyDid === account.did;
            return (
              <li key={account.did} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Link
                  href={accountPath(account.did)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                    {account.avatarUrl ? (
                      <Image src={account.avatarUrl} alt="" width={40} height={40} unoptimized className="size-full object-cover" />
                    ) : (
                      <UserRoundIcon className="size-5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="truncate font-medium text-foreground">{name}</span>
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => requestRemove(account, name)}
                  disabled={busy}
                  className="shrink-0 shadow-none"
                >
                  {busy ? <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" /> : <UndoIcon className="size-4" />}
                  {t("remove")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
