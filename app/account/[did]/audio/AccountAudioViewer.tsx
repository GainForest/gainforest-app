"use client";

/**
 * The account profile's Audio tab: a simple, viewer-first gallery of the
 * repo's `ac.audio` recordings, grouped by recorder deployment and rendered
 * with the same spectrogram player used on deployment detail pages.
 *
 * Deliberately no forms here — deployments are created by the AudioMoth
 * page's acoustic chime and recordings by the SD-card upload, so this tab
 * only has to answer one question: "what did my recorders capture?"
 * The full record editor still exists for power users behind explicit
 * `?section=…`/`?mode=…` deep links (see ./page.tsx).
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowUpRightIcon, AudioLinesIcon, MapPinIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Container from "@/components/ui/container";
import { resolvePdsHost } from "@/app/_lib/pds";
import { listAcDeployments, type AcDeploymentItem } from "@/app/_lib/ac-deployment";
import { listAllRecordings, type AcAudioListItem } from "@/app/_lib/ac-audio";
import { deploymentDetailPath, parseAtUri } from "@/app/_lib/deployment-events";
import { formatDate } from "@/app/_lib/format";
import { RecordingsExplorer } from "@/app/_components/RecordingsExplorer";

type DeploymentGroup = {
  key: string;
  name: string;
  deployedAt: string | null;
  /** Local path of the deployment's detail page, when it has a chime event. */
  detailPath: string | null;
  items: AcAudioListItem[];
};

function groupRecordings(deployments: AcDeploymentItem[], recordings: AcAudioListItem[]): DeploymentGroup[] {
  const byUri = new Map(deployments.map((d) => [d.uri, d]));
  const grouped = new Map<string, AcAudioListItem[]>();
  for (const item of recordings) {
    const key = item.deploymentRef && byUri.has(item.deploymentRef) ? item.deploymentRef : "";
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  const groups: DeploymentGroup[] = [];
  for (const [key, items] of grouped) {
    if (!key) continue;
    const deployment = byUri.get(key)!;
    const eventParts = deployment.eventRef ? parseAtUri(deployment.eventRef) : null;
    groups.push({
      key,
      name: deployment.name,
      deployedAt: deployment.deployedAt ?? null,
      detailPath: eventParts ? deploymentDetailPath(eventParts.did, eventParts.rkey) : null,
      items,
    });
  }
  // Newest deployment first.
  groups.sort((a, b) => (b.deployedAt ?? "").localeCompare(a.deployedAt ?? ""));

  const ungrouped = grouped.get("");
  if (ungrouped?.length) {
    groups.push({ key: "", name: "", deployedAt: null, detailPath: null, items: ungrouped });
  }
  return groups;
}

export function AccountAudioViewer({
  did,
  showUploadCta,
}: {
  did: string;
  /** Whether to offer the personal SD-card upload flow (personal repos only). */
  showUploadCta: boolean;
}) {
  const t = useTranslations("common.audiomoth.recordings");

  const [host, setHost] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<AcDeploymentItem[] | null>(null);
  const [recordings, setRecordings] = useState<AcAudioListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const [pdsHost, deps, recs] = await Promise.all([
          resolvePdsHost(did, ctrl.signal),
          listAcDeployments(did, ctrl.signal),
          listAllRecordings(did, ctrl.signal),
        ]);
        if (ctrl.signal.aborted) return;
        setHost(pdsHost);
        setDeployments(deps);
        setRecordings(recs);
      } catch {
        if (!ctrl.signal.aborted) {
          setDeployments([]);
          setRecordings([]);
          setLoadError(true);
        }
      }
    })();
    return () => ctrl.abort();
  }, [did]);

  const groups = useMemo(
    () => (deployments && recordings ? groupRecordings(deployments, recordings) : []),
    [deployments, recordings],
  );

  const loading = recordings === null;
  const total = recordings?.length ?? 0;

  return (
    <Container className="pt-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">
            {t("title")}
            {total > 0 ? (
              <span className="ml-2.5 align-middle font-sans text-sm font-normal not-italic tracking-normal text-muted-foreground">
                {t("groupCount", { count: total })}
              </span>
            ) : null}
          </h1>
        </div>
        {showUploadCta ? (
          <Button asChild size="sm">
            <Link href="/audiomoth?tab=upload">
              <UploadIcon className="size-4" />
              {t("uploadCta")}
            </Link>
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-6 flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : loadError ? (
        <p className="mt-6 rounded-2xl border border-border bg-card/90 px-5 py-8 text-center text-sm text-muted-foreground">
          {t("loadError")}
        </p>
      ) : total === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <AudioLinesIcon className="size-6" />
          </span>
          <h2 className="mt-4 text-base font-medium text-foreground">{t("accountEmptyTitle")}</h2>
          <p className="mx-auto mt-1.5 max-w-[440px] text-sm text-muted-foreground">{t("accountEmptyBody")}</p>
          {showUploadCta ? (
            <Button asChild size="sm" className="mt-5">
              <Link href="/audiomoth?tab=upload">
                <UploadIcon className="size-4" />
                {t("uploadCta")}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.key || "other"} className="rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    {group.key ? <MapPinIcon className="size-4" /> : <AudioLinesIcon className="size-4" />}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-medium text-foreground">
                      {group.key ? group.name : t("otherGroup")}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {[group.deployedAt ? formatDate(group.deployedAt) : null, t("groupCount", { count: group.items.length })]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                {group.detailPath ? (
                  <Link
                    href={group.detailPath}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t("viewDeployment")}
                    <ArrowUpRightIcon className="size-3" aria-hidden />
                  </Link>
                ) : null}
              </div>
              <div className="mt-4">
                <RecordingsExplorer did={did} host={host} items={group.items} />
              </div>
            </section>
          ))}
        </div>
      )}
    </Container>
  );
}
