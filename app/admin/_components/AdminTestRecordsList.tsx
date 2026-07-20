"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUpRightIcon, Loader2Icon, UndoIcon } from "lucide-react";
import { formatCgsErrorMessage } from "@/app/_lib/cgs-errors";
import { formatRelative } from "@/app/_lib/format";
import { Button } from "@/components/ui/button";
import type { FlaggedTestRecord } from "@/app/internal/badges/_lib/test-records";
import { AdminAvatar, AdminEmptyState } from "./AdminModerationDashboard";

/** The individual posts / observations / other records admins hid from the
 *  public feed and catalogs, with a one-click way to make them visible again. */
export function AdminTestRecordsList({ records: initial }: { records: FlaggedTestRecord[] }) {
  const t = useTranslations("common.adminTestRecords");
  const router = useRouter();
  const [records, setRecords] = useState(initial);
  const [busyUri, setBusyUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(uri: string) {
    setBusyUri(uri);
    setError(null);
    try {
      const response = await fetch("/api/internal/test-records", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uri }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok || data?.error) throw new Error(formatCgsErrorMessage(data?.error, t("error")));
      setRecords((current) => current.filter((record) => record.uri !== uri));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error"));
    } finally {
      setBusyUri(null);
    }
  }

  return (
    <section>
      {error ? (
        <p aria-live="polite" className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {records.length === 0 ? (
        <AdminEmptyState>{t("empty")}</AdminEmptyState>
      ) : (
        <ul className="divide-y divide-border/70">
          {records.map((record) => {
            const ownerName = record.ownerName || t("unnamed");
            const busy = busyUri === record.uri;
            return (
              <li key={record.uri} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Link
                  href={record.href}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <AdminAvatar url={record.ownerAvatarUrl} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-medium text-foreground">
                        {t("itemLabel", { kind: t(`kinds.${record.kind}`), name: ownerName })}
                      </span>
                      <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground" />
                    </span>
                    {record.flaggedAt ? (
                      <span className="text-xs text-muted-foreground">
                        {t("hiddenAgo", { time: formatRelative(record.flaggedAt) })}
                      </span>
                    ) : null}
                  </span>
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void remove(record.uri)}
                  disabled={busy}
                  className="shrink-0 shadow-none"
                >
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : <UndoIcon className="size-4" />}
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
