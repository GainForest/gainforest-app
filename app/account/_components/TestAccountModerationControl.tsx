"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EyeOffIcon, FlaskConicalIcon, Loader2Icon, UndoIcon } from "lucide-react";
import { formatCgsErrorMessage } from "@/app/_lib/cgs-errors";
import { Button } from "@/components/ui/button";

type Props = {
  did: string;
  accountName: string;
  initialFlagged: boolean;
};

/**
 * GainForest stewards (any member of the gainforest.certified.one group) can
 * hide an account as a "test" account: its projects, observations and feed
 * activity are removed from the public surfaces. Reversible at any time.
 */
export function TestAccountModerationControl({ did, accountName, initialFlagged }: Props) {
  const t = useTranslations("common.testAccount");
  const router = useRouter();
  const [flagged, setFlagged] = useState(initialFlagged);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal/test-accounts", {
        method: next ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ did }),
      });
      const data = (await response.json().catch(() => null)) as { flagged?: boolean; error?: string } | null;
      if (!response.ok || !data || data.error) {
        throw new Error(formatCgsErrorMessage(data?.error, t("genericError")));
      }
      setFlagged(Boolean(data.flagged));
      setConfirming(false);
      // Let server components re-read the (now changed) hidden set.
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`mb-4 rounded-2xl border p-4 text-sm ${
        flagged
          ? "border-amber-300/70 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10"
          : "border-border bg-muted/40"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
            {flagged ? <EyeOffIcon className="size-4" /> : <FlaskConicalIcon className="size-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t("eyebrow")}
            </p>
            <h2 className="mt-1 font-medium text-foreground">
              {flagged ? t("flaggedTitle") : t("visibleTitle")}
            </h2>
            <p className="mt-1 max-w-prose text-muted-foreground">
              {flagged
                ? t("flaggedDescription", { name: accountName })
                : t("visibleDescription", { name: accountName })}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {flagged ? (
            <Button type="button" variant="secondary" onClick={() => void submit(false)} disabled={busy} className="shadow-none">
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <UndoIcon className="size-4" />}
              {t("unhideAction")}
            </Button>
          ) : confirming ? (
            <>
              <Button type="button" variant="destructive" onClick={() => void submit(true)} disabled={busy} className="shadow-none">
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <EyeOffIcon className="size-4" />}
                {t("confirmHide")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                {t("cancel")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirming(true)} className="shadow-none">
              <EyeOffIcon className="size-4" />
              {t("hideAction")}
            </Button>
          )}
        </div>
      </div>

      {confirming && !flagged ? (
        <p className="mt-3 text-muted-foreground">{t("confirmDescription", { name: accountName })}</p>
      ) : null}

      {error ? (
        <p aria-live="polite" className="mt-3 text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
