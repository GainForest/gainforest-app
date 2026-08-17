"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { useAccountList } from "@/app/_lib/account-switcher";
import { canDeleteRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";
import { deleteEvent } from "../../_lib/mutations";

/**
 * Role-gated delete for an event. Shown only to those who may delete: the
 * personal host, or an organization owner/admin (per canDeleteRecord).
 * Uses a lightweight inline two-step confirm — no bordered/shadowed box.
 */
export function DeleteEventButton({
  eventDid,
  rkey,
  sessionDid,
}: {
  eventDid: string;
  rkey: string;
  sessionDid: string | null;
}) {
  const t = useTranslations("events");
  const router = useRouter();
  const { groups } = useAccountList(sessionDid);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const org = groups.find((g) => g.groupDid === eventDid);
  const canDelete =
    Boolean(sessionDid && sessionDid === eventDid) ||
    Boolean(org && canDeleteRecord({ kind: "group", role: org.role }).allowed);

  if (!canDelete) return null;

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteEvent(rkey, org?.groupDid ? { repo: org.groupDid } : undefined);
      router.push("/events");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("delete.error"));
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-destructive">{t("delete.confirm")}</span>
        <button
          onClick={onDelete}
          disabled={busy}
          className="font-semibold text-destructive hover:underline disabled:opacity-60"
        >
          {busy ? t("delete.deleting") : t("delete.confirmAction")}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="text-muted-foreground hover:text-foreground"
        >
          {t("delete.cancel")}
        </button>
        {error ? <span className="text-destructive">{error}</span> : null}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive"
    >
      <Trash2Icon className="size-4" /> {t("delete.label")}
    </button>
  );
}
