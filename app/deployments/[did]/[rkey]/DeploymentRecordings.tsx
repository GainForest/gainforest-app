"use client";

/**
 * Recordings section on a deployment detail page: the `ac.audio` records
 * linked (via the companion `ac.deployment`) to this chime deployment event,
 * rendered with the shared spectrogram player list.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { UploadIcon } from "lucide-react";
import { resolvePdsHost } from "@/app/_lib/pds";
import { listAcDeployments } from "@/app/_lib/ac-deployment";
import { listRecordingsForDeployment, type AcAudioListItem } from "@/app/_lib/ac-audio";
import { RecordingsExplorer } from "@/app/_components/RecordingsExplorer";

export function DeploymentRecordings({
  did,
  eventUri,
  isOwner,
}: {
  did: string;
  eventUri: string;
  isOwner: boolean;
}) {
  const t = useTranslations("common.audiomoth.recordings");

  const [items, setItems] = useState<AcAudioListItem[] | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const [pdsHost, deployments] = await Promise.all([
          resolvePdsHost(did, ctrl.signal),
          listAcDeployments(did, ctrl.signal),
        ]);
        if (ctrl.signal.aborted) return;
        setHost(pdsHost);
        const deployment = deployments.find((d) => d.eventRef === eventUri) ?? null;
        if (!deployment) {
          setItems([]);
          return;
        }
        const recordings = await listRecordingsForDeployment(did, deployment.uri, ctrl.signal);
        if (!ctrl.signal.aborted) setItems(recordings);
      } catch {
        if (!ctrl.signal.aborted) {
          setItems([]);
          setLoadError(true);
        }
      }
    })();
    return () => ctrl.abort();
  }, [did, eventUri]);

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t("title")}
          {items && items.length > 0 ? (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] normal-case tracking-normal text-primary">
              {items.length}
            </span>
          ) : null}
        </p>
        {isOwner ? (
          <Link
            href="/audiomoth?tab=upload"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            <UploadIcon className="h-3.5 w-3.5" aria-hidden />
            {t("uploadCta")}
          </Link>
        ) : null}
      </div>

      {items === null ? (
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : loadError ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("loadError")}</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="mt-4">
          <RecordingsExplorer did={did} host={host} items={items} />
        </div>
      )}
    </section>
  );
}
