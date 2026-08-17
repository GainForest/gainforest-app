"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckIcon, PencilIcon, Share2Icon, Trash2Icon } from "lucide-react";
import { useAccountList } from "@/app/_lib/account-switcher";
import { canDeleteRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";
import { eventHref } from "@/app/_lib/urls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { deleteEvent } from "../../_lib/mutations";

const btn =
  "inline-flex size-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25";

/** Hero actions on the event detail card: Share (everyone) + Edit/Delete
 *  (personal host or org owner/admin). White, glassy, top-right of the card. */
export function EventHeroActions({
  eventDid,
  rkey,
  eventName,
  sessionDid,
}: {
  eventDid: string;
  rkey: string;
  eventName: string;
  sessionDid: string | null;
}) {
  const t = useTranslations("events");
  const router = useRouter();
  const { groups } = useAccountList(sessionDid);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const org = groups.find((g) => g.groupDid === eventDid);
  const canManage =
    Boolean(sessionDid && sessionDid === eventDid) ||
    Boolean(org && canDeleteRecord({ kind: "group", role: org.role }).allowed);

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: eventName, url });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function onDelete() {
    setBusy(true);
    try {
      await deleteEvent(rkey, org?.groupDid ? { repo: org.groupDid } : undefined);
      router.push("/events");
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onShare} className={btn} aria-label={copied ? t("detail.linkCopied") : t("detail.share")}>
        {copied ? <CheckIcon className="size-4" /> : <Share2Icon className="size-4" />}
      </button>

      {canManage ? (
        <>
          <Link href={`${eventHref(eventDid, rkey)}/edit`} className={btn} aria-label={t("edit.label")}>
            <PencilIcon className="size-4" />
          </Link>
          <Popover open={delOpen} onOpenChange={setDelOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={btn} aria-label={t("delete.label")}>
                <Trash2Icon className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <p className="text-sm font-medium">{t("delete.confirm")}</p>
              <div className="mt-3 flex justify-end gap-3 text-sm">
                <button onClick={() => setDelOpen(false)} className="text-muted-foreground hover:text-foreground" disabled={busy}>
                  {t("delete.cancel")}
                </button>
                <button onClick={onDelete} disabled={busy} className="font-semibold text-destructive hover:underline disabled:opacity-60">
                  {busy ? t("delete.deleting") : t("delete.confirmAction")}
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </>
      ) : null}
    </div>
  );
}
