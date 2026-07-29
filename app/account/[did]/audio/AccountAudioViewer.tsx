"use client";

/**
 * The account profile's Audio tab: a simple, viewer-first gallery of the
 * repo's `ac.audio` recordings, grouped by recorder deployment and rendered
 * with the same spectrogram player used on deployment detail pages.
 *
 * Deliberately almost no forms here — deployments are created by the
 * AudioMoth page's acoustic chime and recordings by the SD-card upload, so
 * this tab only has to answer one question: "what did my recorders capture?"
 * The exceptions are the two things an owner can only fix after the fact:
 * renaming a folder and deleting one.
 * The full record editor still exists for power users behind explicit
 * `?section=…`/`?mode=…` deep links (see ./page.tsx).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  AudioLinesIcon,
  FolderInputIcon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Container from "@/components/ui/container";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { resolvePdsHost } from "@/app/_lib/pds";
import {
  applyAcDeploymentEdit,
  createAcDeployment,
  deleteAcDeployment,
  listAcDeployments,
  updateAcDeployment,
  type AcDeploymentItem,
} from "@/app/_lib/ac-deployment";
import { listAllRecordings, moveRecordings, type AcAudioListItem } from "@/app/_lib/ac-audio";
import { countIdentificationsOn, deleteRecordings } from "@/app/_lib/ac-audio-delete";
import {
  DeleteFolderModal,
  MoveRecordingsModal,
  RenameFolderModal,
} from "@/app/_components/RecordingFolderModals";
import { deploymentDetailPath, parseAtUri } from "@/app/_lib/deployment-events";
import { formatDate } from "@/app/_lib/format";
import { RecordingsExplorer } from "@/app/_components/RecordingsExplorer";

type DeploymentGroup = {
  key: string;
  name: string;
  deployedAt: string | null;
  /** The folder's own record — absent for the "other recordings" group. */
  deployment: AcDeploymentItem | null;
  /** Local path of the deployment's detail page, when it has a chime event. */
  detailPath: string | null;
  items: AcAudioListItem[];
};

function groupRecordings(
  deployments: AcDeploymentItem[],
  recordings: AcAudioListItem[],
  /**
   * Show folders that hold no recordings. Only the owner sees these: an
   * upload that failed after naming its folder leaves one behind, and it
   * would otherwise be invisible here while still cluttering the folder
   * picker on the next upload — with nowhere to delete it.
   */
  includeEmpty: boolean,
): DeploymentGroup[] {
  const byUri = new Map(deployments.map((d) => [d.uri, d]));
  const grouped = new Map<string, AcAudioListItem[]>();
  for (const item of recordings) {
    const key = item.deploymentRef && byUri.has(item.deploymentRef) ? item.deploymentRef : "";
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  const groups: DeploymentGroup[] = [];
  for (const deployment of deployments) {
    const items = grouped.get(deployment.uri) ?? [];
    if (items.length === 0 && !includeEmpty) continue;
    const eventParts = deployment.eventRef ? parseAtUri(deployment.eventRef) : null;
    groups.push({
      key: deployment.uri,
      name: deployment.name,
      deployedAt: deployment.deployedAt ?? null,
      deployment,
      detailPath: eventParts ? deploymentDetailPath(eventParts.did, eventParts.rkey) : null,
      items,
    });
  }
  // Newest deployment first.
  groups.sort((a, b) => (b.deployedAt ?? "").localeCompare(a.deployedAt ?? ""));

  const ungrouped = grouped.get("");
  if (ungrouped?.length) {
    groups.push({ key: "", name: "", deployedAt: null, deployment: null, detailPath: null, items: ungrouped });
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
  const tFolders = useTranslations("common.recordingFolders");
  const modal = useModal();

  const [host, setHost] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<AcDeploymentItem[] | null>(null);
  const [recordings, setRecordings] = useState<AcAudioListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  /* ── Drive-style selection + delete ───────────────────────────────────────
   * No separate "select mode": clicking a recording toggles its selection
   * (like Google Drive), shift-click selects the whole range since the last
   * plain click, and a toolbar with the count, Move and Delete replaces the
   * header actions while anything is selected. Escape or ✕ clears it. */
  const [selectedUris, setSelectedUris] = useState<ReadonlySet<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** Last plain-clicked row — the fixed end of a shift-click range. */
  const anchorUriRef = useRef<string | null>(null);

  const clearSelection = useCallback(() => {
    anchorUriRef.current = null;
    setSelectedUris(new Set());
  }, []);

  useEffect(() => {
    if (selectedUris.size === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedUris.size, clearSelection]);

  const performDelete = useCallback(
    async (onProgress: (done: number, total: number) => void) => {
      const items = (recordings ?? []).filter((item) => selectedUris.has(item.uri));
      const { deleted, failed } = await deleteRecordings({
        items,
        survivors: (recordings ?? []).filter((item) => !selectedUris.has(item.uri)),
        repo: mutationRepo,
        onProgress,
      });
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
      clearSelection();
    },
    [recordings, selectedUris, mutationRepo, clearSelection, t],
  );

  /**
   * Move the selection into another folder — an existing one, or a new one
   * named in the dialog. A card emptied into the wrong folder, or one card
   * holding two sites, was until now permanent.
   */
  const confirmMove = useCallback(() => {
    const items = (recordings ?? []).filter((item) => selectedUris.has(item.uri));
    if (items.length === 0) return;
    const counts = new Map<string, number>();
    for (const item of recordings ?? []) {
      if (item.deploymentRef) counts.set(item.deploymentRef, (counts.get(item.deploymentRef) ?? 0) + 1);
    }
    modal.pushModal(
      {
        id: "move-recordings",
        dialogWidth: "max-w-lg w-[calc(100%-2rem)]",
        content: (
          <MoveRecordingsModal
            count={items.length}
            folders={deployments}
            counts={counts}
            onMove={async (target, onProgress) => {
              let deploymentRef: string;
              if (target.kind === "existing") {
                deploymentRef = target.uri;
              } else {
                /* A folder named here is dated by the recordings going into
                   it, so it sorts with them rather than at today's date. */
                const times = items
                  .map((item) => new Date(item.recordedAt ?? item.createdAt).getTime())
                  .filter((time) => Number.isFinite(time));
                const created = await createAcDeployment(
                  {
                    name: target.name,
                    deployedAt: times.length ? new Date(Math.min(...times)) : new Date(),
                    remarks: tFolders("newFolderRemarks"),
                  },
                  { repo: mutationRepo },
                );
                deploymentRef = created.uri;
                const refreshed = await listAcDeployments(did).catch(() => null);
                if (refreshed) setDeployments(refreshed);
              }
              const { moved, failed } = await moveRecordings({
                items,
                deploymentRef,
                repo: mutationRepo,
                onProgress,
              });
              if (moved.size > 0) {
                setRecordings(
                  (current) =>
                    current?.map((item) => (moved.has(item.uri) ? { ...item, deploymentRef } : item)) ?? current,
                );
              }
              if (failed.size > 0) {
                // Keep the ones that stayed put selected, ready for a retry.
                setSelectedUris(failed);
                throw new Error(tFolders("movePartial", { count: failed.size }));
              }
              clearSelection();
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [clearSelection, deployments, did, modal, mutationRepo, recordings, selectedUris, tFolders]);

  const confirmDelete = useCallback(() => {
    const count = selectedUris.size;
    if (count === 0) return;
    const items = (recordings ?? []).filter((item) => selectedUris.has(item.uri));
    modal.pushModal(
      {
        id: "delete-recordings",
        content: (
          <DeleteRecordingsModal
            count={count}
            countIdentifications={() => countIdentificationsOn(items)}
            onConfirm={performDelete}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [modal, performDelete, recordings, selectedUris]);

  /* ── Folder rename / delete (owner or org admin) ────────────────────────
   * A folder is named while an SD card uploads, so its name is the thing most
   * often worth fixing. Deleting takes the recordings filed in it with it —
   * an empty folder record left behind would only strand them. */
  const renameFolder = useCallback(
    (deployment: AcDeploymentItem) => {
      modal.pushModal(
        {
          id: "rename-recording-folder",
          content: (
            <RenameFolderModal
              currentName={deployment.name}
              onSave={async (name) => {
                const { cid } = await updateAcDeployment(deployment, { name }, { repo: mutationRepo });
                const updated = applyAcDeploymentEdit(deployment, { name }, cid);
                setDeployments((current) =>
                  current?.map((item) => (item.uri === updated.uri ? updated : item)) ?? current,
                );
              }}
            />
          ),
        },
        true,
      );
      void modal.show();
    },
    [modal, mutationRepo],
  );

  const confirmDeleteFolder = useCallback(
    (group: DeploymentGroup) => {
      const deployment = group.deployment;
      if (!deployment) return;
      modal.pushModal(
        {
          id: "delete-recording-folder",
          content: (
            <DeleteFolderModal
              name={group.name}
              count={group.items.length}
              countIdentifications={() => countIdentificationsOn(group.items)}
              onConfirm={async (onProgress) => {
                const { deleted, failed } = await deleteRecordings({
                  items: group.items,
                  survivors: (recordings ?? []).filter((item) => item.deploymentRef !== deployment.uri),
                  repo: mutationRepo,
                  onProgress,
                });
                if (deleted.size > 0) {
                  setRecordings((current) => current?.filter((item) => !deleted.has(item.uri)) ?? current);
                }
                if (failed.size > 0) throw new Error(tFolders("deletePartial", { count: failed.size }));
                await deleteAcDeployment(deployment, { repo: mutationRepo });
                setDeployments((current) => current?.filter((item) => item.uri !== deployment.uri) ?? current);
              }}
            />
          ),
        },
        true,
      );
      void modal.show();
    },
    [modal, mutationRepo, recordings, tFolders],
  );

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
    () => (deployments && recordings ? groupRecordings(deployments, recordings, canDelete) : []),
    [canDelete, deployments, recordings],
  );

  /** Every recording's URI in on-screen order, for shift-click ranges. */
  const displayOrder = useMemo(() => groups.flatMap((group) => group.items.map((item) => item.uri)), [groups]);

  const toggleSelect = useCallback(
    (item: AcAudioListItem, shiftKey = false) => {
      const anchor = anchorUriRef.current;
      if (shiftKey && anchor && anchor !== item.uri) {
        const from = displayOrder.indexOf(anchor);
        const to = displayOrder.indexOf(item.uri);
        if (from !== -1 && to !== -1) {
          // Select everything between the anchor and the shift-clicked row,
          // inclusive. The anchor stays put so another shift-click just
          // resizes the range, like Drive/Finder.
          setSelectedUris((current) => {
            const next = new Set(current);
            for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) next.add(displayOrder[i]);
            return next;
          });
          return;
        }
      }
      anchorUriRef.current = item.uri;
      setSelectedUris((current) => {
        const next = new Set(current);
        if (next.has(item.uri)) next.delete(item.uri);
        else next.add(item.uri);
        return next;
      });
    },
    [displayOrder],
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
        {selectedCount > 0 ? (
          /* Drive-style selection toolbar — replaces the header actions. */
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1.5 pr-1.5 shadow-sm">
            <button
              type="button"
              onClick={clearSelection}
              aria-label={t("clearSelection")}
              className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
            <span className="px-0.5 text-sm font-medium tabular-nums text-foreground">
              {t("selectedCount", { count: selectedCount })}
            </span>
            <Button variant="outline" size="sm" onClick={confirmMove}>
              <FolderInputIcon className="size-4" />
              {tFolders("moveAction")}
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>
              <Trash2Icon className="size-4" />
              {t("deleteSelected")}
            </Button>
          </div>
        ) : showUploadCta ? (
          <Button asChild size="sm">
            <Link href="/audiomoth?tab=upload">
              <UploadIcon className="size-4" />
              {t("uploadCta")}
            </Link>
          </Button>
        ) : null}
      </div>

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
      ) : groups.length === 0 ? (
        /* Nothing at all — an owner whose only folders are empty still sees
           them below, so they can be cleaned up. */
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
          {groups.map((group) => {
            const folder = group.deployment;
            return (
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
                  <div className="flex shrink-0 items-center gap-1">
                    {group.detailPath ? (
                      <Link
                        href={group.detailPath}
                        className="inline-flex shrink-0 items-center gap-1 px-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {t("viewDeployment")}
                        <ArrowUpRightIcon className="size-3" aria-hidden />
                      </Link>
                    ) : null}
                    {canDelete && folder ? (
                      <>
                        <Button type="button" variant="ghost" size="sm" onClick={() => renameFolder(folder)}>
                          <PencilIcon className="size-4" />
                          {tFolders("renameAction")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => confirmDeleteFolder(group)}
                        >
                          <Trash2Icon className="size-4" />
                          {tFolders("deleteAction")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4">
                  {group.items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                      {tFolders("emptyFolder")}
                    </p>
                  ) : (
                    <RecordingsExplorer
                      did={did}
                      host={host}
                      items={group.items}
                      selectable={canDelete}
                      selectedUris={selectedUris}
                      onToggleSelect={toggleSelect}
                    />
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Container>
  );
}

/**
 * Warning dialog shown before recordings are removed. Deleting is permanent
 * — the records (and their playable previews, spectrograms and the
 * identifications drawn on them) disappear from the profile — so the dialog
 * leads with an explicit warning sign.
 */
function DeleteRecordingsModal({
  count,
  countIdentifications,
  onConfirm,
}: {
  count: number;
  /** Resolves how many identifications are drawn on the selected recordings. */
  countIdentifications?: () => Promise<number>;
  onConfirm: (onProgress: (done: number, total: number) => void) => Promise<void>;
}) {
  const t = useTranslations("common.audiomoth.recordings");
  const tFolders = useTranslations("common.recordingFolders");
  const modal = useModal();
  const [identifications, setIdentifications] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = async () => {
    await modal.hide();
    modal.popModal();
  };

  /* The count only ever adds a number to a warning that already says
     identifications go, so a slow or failed listing never gates the button. */
  useEffect(() => {
    if (!countIdentifications) return;
    let cancelled = false;
    countIdentifications()
      .then((value) => {
        if (!cancelled) setIdentifications(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [countIdentifications]);

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
      {identifications ? (
        <p className="rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75">
          {tFolders("identificationsIncluded", { count: identifications })}
        </p>
      ) : null}
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
