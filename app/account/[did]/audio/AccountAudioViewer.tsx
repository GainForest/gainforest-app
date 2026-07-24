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

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  AudioLinesIcon,
  ListChecksIcon,
  Loader2Icon,
  MapPinIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Container from "@/components/ui/container";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { deleteRecord } from "@/app/(manage)/manage/_lib/mutations";
import { resolvePdsHost } from "@/app/_lib/pds";
import { listAcDeployments, type AcDeploymentItem } from "@/app/_lib/ac-deployment";
import { AC_AUDIO_COLLECTION, listAllRecordings, type AcAudioListItem } from "@/app/_lib/ac-audio";
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
  canDelete = false,
  mutationRepo = null,
}: {
  did: string;
  /** Whether to offer the personal SD-card upload flow (personal repos only). */
  showUploadCta: boolean;
  /** Whether the viewer may delete recordings (owner / org admin). */
  canDelete?: boolean;
  /** Group repo DID for mutations, when the profile is an organization. */
  mutationRepo?: string | null;
}) {
  const t = useTranslations("common.audiomoth.recordings");
  const modal = useModal();

  const [host, setHost] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<AcDeploymentItem[] | null>(null);
  const [recordings, setRecordings] = useState<AcAudioListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  /* ── Multi-select + delete ─────────────────────────────────────────────── */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<ReadonlySet<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const toggleSelect = useCallback((item: AcAudioListItem) => {
    setSelectedUris((current) => {
      const next = new Set(current);
      if (next.has(item.uri)) next.delete(item.uri);
      else next.add(item.uri);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedUris(new Set());
  }, []);

  const performDelete = useCallback(
    async (onProgress: (done: number, total: number) => void) => {
      const items = (recordings ?? []).filter((item) => selectedUris.has(item.uri));
      const repoOptions = mutationRepo ? { repo: mutationRepo } : undefined;
      const deleted = new Set<string>();
      const failed = new Set<string>();
      let done = 0;
      for (const item of items) {
        try {
          await deleteRecord(AC_AUDIO_COLLECTION, item.rkey, repoOptions);
          deleted.add(item.uri);
        } catch {
          failed.add(item.uri);
        }
        done += 1;
        onProgress(done, items.length);
      }
      if (deleted.size > 0) {
        setRecordings((current) => current?.filter((item) => !deleted.has(item.uri)) ?? current);
      }
      if (failed.size > 0) {
        // Keep the failed ones selected so the user can retry immediately.
        setSelectedUris(failed);
        setDeleteError(t("deleteFailed", { count: failed.size }));
        throw new Error(t("deleteFailed", { count: failed.size }));
      }
      setDeleteError(null);
      exitSelectMode();
    },
    [recordings, selectedUris, mutationRepo, exitSelectMode, t],
  );

  const confirmDelete = useCallback(() => {
    const count = selectedUris.size;
    if (count === 0) return;
    modal.pushModal(
      {
        id: "delete-recordings",
        content: <DeleteRecordingsModal count={count} onConfirm={performDelete} />,
      },
      true,
    );
    void modal.show();
  }, [modal, performDelete, selectedUris.size]);

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
  const selectedCount = selectedUris.size;

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
        <div className="flex flex-wrap items-center gap-2">
          {canDelete && total > 0 && !selectMode ? (
            <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
              <ListChecksIcon className="size-4" />
              {t("selectCta")}
            </Button>
          ) : null}
          {selectMode ? (
            <>
              <span className="text-sm tabular-nums text-muted-foreground">
                {t("selectedCount", { count: selectedCount })}
              </span>
              <Button variant="destructive" size="sm" disabled={selectedCount === 0} onClick={confirmDelete}>
                <Trash2Icon className="size-4" />
                {t("deleteSelected")}
              </Button>
              <Button variant="outline" size="sm" onClick={exitSelectMode}>
                <XIcon className="size-4" />
                {t("selectCancel")}
              </Button>
            </>
          ) : showUploadCta ? (
            <Button asChild size="sm">
              <Link href="/audiomoth?tab=upload">
                <UploadIcon className="size-4" />
                {t("uploadCta")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {selectMode ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-warn" />
          {t("selectHint")}
        </p>
      ) : null}

      {deleteError ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-warn/10 px-3 py-2 text-xs font-medium text-foreground/75">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-warn" />
          {deleteError}
        </p>
      ) : null}

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
                <RecordingsExplorer
                  did={did}
                  host={host}
                  items={group.items}
                  selectable={selectMode}
                  selectedUris={selectedUris}
                  onToggleSelect={toggleSelect}
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </Container>
  );
}

/**
 * Warning dialog shown before recordings are removed. Deleting is permanent
 * — the records (and their playable previews and spectrograms) disappear
 * from the profile — so the dialog leads with an explicit warning sign.
 */
function DeleteRecordingsModal({
  count,
  onConfirm,
}: {
  count: number;
  onConfirm: (onProgress: (done: number, total: number) => void) => Promise<void>;
}) {
  const t = useTranslations("common.audiomoth.recordings");
  const modal = useModal();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = async () => {
    await modal.hide();
    modal.popModal();
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm((done, total) => setProgress({ done, total }));
      await close();
    } catch (deleteRecordingsError) {
      setError(
        deleteRecordingsError instanceof Error ? deleteRecordingsError.message : t("deleteFailed", { count }),
      );
      setPending(false);
      setProgress(null);
    }
  };

  return (
    <ModalContent dismissible={!pending} className="space-y-4">
      <ModalHeader>
        <ModalTitle className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlertIcon className="size-4.5" />
          </span>
          {t("deleteConfirmTitle", { count })}
        </ModalTitle>
        <ModalDescription>{t("deleteConfirmBody", { count })}</ModalDescription>
      </ModalHeader>
      {error ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-warn" /> {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void close()}>
          {t("deleteConfirmCancel")}
        </Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => void confirm()}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
          {pending && progress
            ? t("deleteProgress", { done: progress.done, total: progress.total })
            : t("deleteConfirmAction", { count })}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
