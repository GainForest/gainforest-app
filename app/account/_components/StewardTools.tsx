"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  ShieldCheckIcon,
} from "lucide-react";
import { AdminOnlyIndicator } from "@/app/_components/AdminOnlyIndicator";
import { formatCgsErrorMessage } from "@/app/_lib/cgs-errors";
import { MANUAL_RECOGNITION_BADGE_KEYS, type ManualRecognitionBadgeKey } from "@/app/_lib/recognition-badges";
import { cn } from "@/lib/utils";
import { recognitionBadgeIcon } from "./RecognitionBadges";

type Props = {
  did: string;
  accountName: string;
  initialTestFlagged: boolean;
  initialAwarded: ManualRecognitionBadgeKey[];
};

/**
 * Compact, collapsible steward panel for GainForest moderators, shown above a
 * profile. Folds the two stewardship actions — hiding an account as a test
 * account, and awarding recognition badges — into one minimal card so it never
 * dominates the profile. Collapsed by default; the header surfaces current
 * state (hidden status + awarded badges) at a glance.
 */
export function StewardTools({ did, accountName, initialTestFlagged, initialAwarded }: Props) {
  const t = useTranslations("common.steward");
  const tt = useTranslations("common.testAccount");
  const rt = useTranslations("common.recognition");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [flagged, setFlagged] = useState(initialTestFlagged);
  const [confirming, setConfirming] = useState(false);
  const [awarded, setAwarded] = useState<Set<ManualRecognitionBadgeKey>>(new Set(initialAwarded));
  const [busyTest, setBusyTest] = useState(false);
  const [busyBadge, setBusyBadge] = useState<ManualRecognitionBadgeKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleTest(next: boolean) {
    setBusyTest(true);
    setError(null);
    try {
      const response = await fetch("/api/internal/test-accounts", {
        method: next ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ did }),
      });
      const data = (await response.json().catch(() => null)) as { flagged?: boolean; error?: string } | null;
      if (!response.ok || !data || data.error) throw new Error(formatCgsErrorMessage(data?.error, tt("genericError")));
      setFlagged(Boolean(data.flagged));
      setConfirming(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("genericError"));
    } finally {
      setBusyTest(false);
    }
  }

  async function toggleBadge(key: ManualRecognitionBadgeKey, next: boolean) {
    setBusyBadge(key);
    setError(null);
    try {
      const response = await fetch("/api/internal/recognition", {
        method: next ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ did, badge: key }),
      });
      const data = (await response.json().catch(() => null)) as { awarded?: boolean; error?: string } | null;
      if (!response.ok || !data || data.error) throw new Error(formatCgsErrorMessage(data?.error, rt("genericError")));
      setAwarded((current) => {
        const updated = new Set(current);
        if (next) updated.add(key);
        else updated.delete(key);
        return updated;
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : rt("genericError"));
    } finally {
      setBusyBadge(null);
    }
  }

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? t("hide") : t("show")}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ShieldCheckIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{t("title")}</span>
        <AdminOnlyIndicator className="text-muted-foreground" />

        {/* At-a-glance status: hidden flag + awarded badge icons. */}
        <span className="flex items-center gap-1.5">
          {flagged ? (
            <span
              title={tt("flaggedTitle")}
              className="flex size-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
            >
              <EyeOffIcon className="size-3.5" />
            </span>
          ) : null}
          {MANUAL_RECOGNITION_BADGE_KEYS.filter((key) => awarded.has(key)).map((key) => {
            const Icon = recognitionBadgeIcon(key);
            return (
              <span
                key={key}
                title={rt(`badges.${key}.label`)}
                className="flex size-6 items-center justify-center rounded-full bg-primary/12 text-primary"
              >
                <Icon className="size-3.5" />
              </span>
            );
          })}
        </span>

        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border/70 px-3.5 py-3.5">
          {/* Visibility */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {flagged ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{flagged ? tt("flaggedTitle") : t("public")}</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {flagged ? tt("flaggedDescription", { name: accountName }) : tt("visibleDescription", { name: accountName })}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {flagged ? (
                <button
                  type="button"
                  onClick={() => void toggleTest(false)}
                  disabled={busyTest}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {busyTest ? <Loader2Icon className="size-3.5 animate-spin" /> : <EyeIcon className="size-3.5" />}
                  {tt("unhideAction")}
                </button>
              ) : confirming ? (
                <>
                  <button
                    type="button"
                    onClick={() => void toggleTest(true)}
                    disabled={busyTest}
                    className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {busyTest ? <Loader2Icon className="size-3.5 animate-spin" /> : <EyeOffIcon className="size-3.5" />}
                    {tt("confirmHide")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={busyTest}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    {tt("cancel")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                >
                  <EyeOffIcon className="size-3.5" />
                  {tt("hideAction")}
                </button>
              )}
            </div>
          </div>

          {/* Recognition badges */}
          <div>
            <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("badges")}</p>
            <div className="flex flex-wrap gap-2">
              {MANUAL_RECOGNITION_BADGE_KEYS.map((key) => {
                const Icon = recognitionBadgeIcon(key);
                const isAwarded = awarded.has(key);
                const busy = busyBadge === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void toggleBadge(key, !isAwarded)}
                    disabled={busy}
                    title={rt(`badges.${key}.description`)}
                    aria-pressed={isAwarded}
                    aria-label={`${isAwarded ? rt("remove") : rt("award")} · ${rt(`badges.${key}.label`)}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                      isAwarded
                        ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                        : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
                    )}
                  >
                    {busy ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : isAwarded ? (
                      <CheckIcon className="size-3.5" />
                    ) : (
                      <Icon className="size-3.5" />
                    )}
                    {rt(`badges.${key}.label`)}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? (
            <p aria-live="polite" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
