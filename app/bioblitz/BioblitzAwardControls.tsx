"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangleIcon, BadgeCheckIcon, CheckIcon, Loader2Icon, MailIcon, MedalIcon } from "lucide-react";
import { AdminOnlyIndicator } from "../_components/AdminOnlyIndicator";
import { bioblitzRoundUsesPoints } from "../_lib/bioblitz";

/**
 * Moderator-only "Award winner badges" control shown per finished round in the
 * Past winners list on /bioblitz. Whether the viewer is a moderator — and which
 * rounds already have their badges — comes from one GET to the admin endpoint;
 * everyone else silently renders nothing. Awarding recomputes the winners
 * server-side, so this button only carries the round id.
 */

export type NotificationStatus = "sent" | "delayed" | "missing_email" | "lookup_failed" | "cannot_send" | "handled_manually" | "not_prepared" | "notification_setup_failed";
export type NotificationSummary = { status: NotificationStatus; canMarkHandled: boolean; canRetry: boolean };
type AwardAction = "award" | "retry-notification" | "mark-notification-handled";
export type RoundAwardState = {
  id: number;
  mostImages: boolean;
  bestPicture: boolean;
  mostImagesNotification?: NotificationSummary;
  bestPictureNotification?: NotificationSummary;
};

type AwardHook = {
  /** Null until (and unless) the viewer is confirmed as a moderator. */
  state: Map<number, RoundAwardState> | null;
  busyRound: number | null;
  busyAction: AwardAction | null;
  error: string | null;
  award: (roundId: number) => void;
  retryNotification: (roundId: number, prize: "most-observations" | "best-picture") => void;
  markHandled: (roundId: number, prize: "most-observations" | "best-picture") => void;
};

export function useBioblitzAwardState(): AwardHook {
  const [state, setState] = useState<Map<number, RoundAwardState> | null>(null);
  const [busyRound, setBusyRound] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<AwardAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch("/api/internal/bioblitz-awards", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json().catch(() => null)) as { rounds?: RoundAwardState[] } | null;
        return Array.isArray(data?.rounds) ? data.rounds : null;
      })
      .then((rounds) => {
        if (active && rounds) setState(new Map(rounds.map((round) => [round.id, round])));
      })
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const award = useCallback((roundId: number) => {
    setBusyRound(roundId);
    setBusyAction("award");
    setError(null);
    fetch("/api/internal/bioblitz-awards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as (RoundAwardState & { error?: string }) | null;
        if (!response.ok || !data || data.error) throw new Error(data?.error);
        setState((current) => {
          const next = new Map(current ?? []);
          next.set(roundId, {
            id: roundId,
            mostImages: data.mostImages,
            bestPicture: data.bestPicture,
            mostImagesNotification: data.mostImagesNotification,
            bestPictureNotification: data.bestPictureNotification,
          });
          return next;
        });
      })
      .catch(() => setError("failed"))
      .finally(() => {
        setBusyRound((current) => (current === roundId ? null : current));
        setBusyAction(null);
      });
  }, []);

  const retryNotification = useCallback((roundId: number, prize: "most-observations" | "best-picture") => {
    setBusyRound(roundId);
    setBusyAction("retry-notification");
    setError(null);
    fetch("/api/internal/bioblitz-awards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "retry-notification", roundId, prize }),
    }).then(async response => {
      const data = await response.json().catch(() => null) as { notification?: NotificationSummary; error?: string } | null;
      if (!response.ok || !data?.notification) throw new Error(data?.error);
      setState(current => {
        const next = new Map(current ?? []);
        const existing = next.get(roundId);
        if (existing) next.set(roundId, {
          ...existing,
          ...(prize === "most-observations"
            ? { mostImagesNotification: data.notification }
            : { bestPictureNotification: data.notification }),
        });
        return next;
      });
    }).catch(() => setError("failed"))
      .finally(() => {
        setBusyRound(current => current === roundId ? null : current);
        setBusyAction(null);
      });
  }, []);

  const markHandled = useCallback((roundId: number, prize: "most-observations" | "best-picture") => {
    setBusyRound(roundId);
    setBusyAction("mark-notification-handled");
    setError(null);
    fetch("/api/internal/bioblitz-awards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark-notification-handled", roundId, prize }),
    }).then(async response => {
      const data = await response.json().catch(() => null) as { notification?: NotificationSummary; error?: string } | null;
      if (!response.ok || !data?.notification) throw new Error(data?.error);
      setState(current => {
        const next = new Map(current ?? []);
        const existing = next.get(roundId);
        if (existing) next.set(roundId, {
          ...existing,
          ...(prize === "most-observations"
            ? { mostImagesNotification: data.notification }
            : { bestPictureNotification: data.notification }),
        });
        return next;
      });
    }).catch(() => setError("failed"))
      .finally(() => {
        setBusyRound(current => current === roundId ? null : current);
        setBusyAction(null);
      });
  }, []);

  return { state, busyRound, busyAction, error, award, retryNotification, markHandled };
}

export function BioblitzPrizeNotificationStatus({
  label,
  notification,
  busy,
  busyAction = null,
  onRetry,
  onMarkHandled,
}: {
  label: string;
  notification: NotificationSummary;
  busy: boolean;
  busyAction?: AwardAction | null;
  onRetry: () => void;
  onMarkHandled: () => void;
}) {
  const t = useTranslations("marketplace.bioblitz.winners.award");
  const attention = ["missing_email", "lookup_failed", "cannot_send", "not_prepared", "notification_setup_failed"].includes(notification.status);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className={attention ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>
        {attention ? <AlertTriangleIcon className="mr-1 inline size-3.5" aria-hidden /> : notification.status === "sent" || notification.status === "handled_manually" ? <CheckIcon className="mr-1 inline size-3.5" aria-hidden /> : <MailIcon className="mr-1 inline size-3.5" aria-hidden />}
        {label}: {t(`notification.${notification.status}`)}
      </span>
      {notification.canRetry ? (
        <button type="button" disabled={busy} onClick={onRetry} className="rounded-full border border-border px-2 py-0.5 font-medium text-foreground hover:bg-muted disabled:opacity-60">
          {busy && busyAction === "retry-notification" ? t("notification.retrying") : t("notification.retry")}
        </button>
      ) : null}
      {notification.canMarkHandled ? (
        <button type="button" disabled={busy} onClick={onMarkHandled} className="rounded-full border border-border px-2 py-0.5 font-medium text-foreground hover:bg-muted disabled:opacity-60">
          {busy && busyAction === "mark-notification-handled" ? t("notification.marking") : t("notification.markHandled")}
        </button>
      ) : null}
    </div>
  );
}

export function RoundAwardControl({
  roundId,
  hook,
  hasWinners,
}: {
  roundId: number;
  hook: AwardHook;
  /** Whether the round has at least one resolved winner to award. */
  hasWinners: boolean;
}) {
  const t = useTranslations("marketplace.bioblitz.winners.award");
  const roundState = hook.state?.get(roundId);
  if (!roundState) return null;

  const fullyAwarded = roundState.mostImages && roundState.bestPicture;
  if (!hasWinners && !fullyAwarded) return null;

  const busy = hook.busyRound === roundId;
  const partiallyAwarded = roundState.mostImages || roundState.bestPicture;
  return (
    <div className="mt-1.5 space-y-1.5">
      {fullyAwarded ? (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <BadgeCheckIcon className="size-3.5" aria-hidden />
          {t("done")}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => hook.award(roundId)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
        >
          {busy ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : <MedalIcon className="size-3.5" aria-hidden />}
          {partiallyAwarded ? t("actionMissing") : t("action")}
          <AdminOnlyIndicator />
        </button>
      )}
      {roundState.mostImages && roundState.mostImagesNotification ? (
        <BioblitzPrizeNotificationStatus
          label={t(
            bioblitzRoundUsesPoints(roundId)
              ? "notification.highestPoints"
              : "notification.mostObservations",
          )}
          notification={roundState.mostImagesNotification}
          busy={busy}
          busyAction={hook.busyAction}
          onRetry={() => hook.retryNotification(roundId, "most-observations")}
          onMarkHandled={() => hook.markHandled(roundId, "most-observations")}
        />
      ) : null}
      {roundState.bestPicture && roundState.bestPictureNotification ? (
        <BioblitzPrizeNotificationStatus
          label={t("notification.bestPicture")}
          notification={roundState.bestPictureNotification}
          busy={busy}
          busyAction={hook.busyAction}
          onRetry={() => hook.retryNotification(roundId, "best-picture")}
          onMarkHandled={() => hook.markHandled(roundId, "best-picture")}
        />
      ) : null}
      {hook.error && !busy ? <span aria-live="polite" className="text-[11px] text-destructive">{t("error")}</span> : null}
    </div>
  );
}
