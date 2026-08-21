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
  ChevronDownIcon,
  FolderInputIcon,
  FolderKanbanIcon,
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
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  applyDeploymentEdit,
  listDeploymentEvents,
  updateDeploymentEvent,
  type DeploymentEventItem,
} from "@/app/_lib/deployment-events";
import {
  companionFolderDraft,
  eventRenameEdit,
  isChimeEventUri,
  renameLinkedEvent,
  setDeploymentLocation,
  unifyDeployments,
} from "@/app/_lib/unified-deployments";
import { listAllRecordings, moveRecordings, type AcAudioListItem } from "@/app/_lib/ac-audio";
import { countIdentificationsOn, deleteRecordings } from "@/app/_lib/ac-audio-delete";
import { deleteSoundscapeRecord } from "@/app/_lib/soundscape-record";
import { rkeyOfUri } from "@/lib/soundscape/auto-publish";
import {
  DeleteFolderModal,
  MoveRecordingsModal,
  RenameFolderModal,
  SetDeploymentLocationModal,
} from "@/app/_components/RecordingFolderModals";
import { AddDeploymentToProjectModal } from "@/app/_components/AddDeploymentToProjectModal";
import { formatDate } from "@/app/_lib/format";
import { RecordingsExplorer } from "@/app/_components/RecordingsExplorer";
import { DeploymentLocationMap } from "@/app/_components/DeploymentLocationMap";

type DeploymentGroup = {
  key: string;
  name: string;
  deployedAt: string | null;
  /** Where the recorder stood — the folder's coordinates, falling back to
   *  the chime's. Null until someone sets them. */
  coords: { lat: number; lon: number } | null;
  /** The record recordings are filed under — absent for a chime nobody has
   *  uploaded to yet, and for the "other recordings" group. */
  deployment: AcDeploymentItem | null;
  /** The chime played in the field, when the deployment has one. */
  event: DeploymentEventItem | null;
  /** Local path of the deployment's detail page, when it has a chime event. */
  detailPath: string | null;
  items: AcAudioListItem[];
};

/** A deployment's stored coordinates — the folder record's, falling back to
 *  the chime event's — as numbers, when both parse. */
function deploymentCoords(
  deployment: AcDeploymentItem | null,
  event: DeploymentEventItem | null,
): { lat: number; lon: number } | null {
  const latRaw = deployment?.decimalLatitude ?? event?.decimalLatitude;
  const lonRaw = deployment?.decimalLongitude ?? event?.decimalLongitude;
  if (!latRaw || !lonRaw) return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function groupRecordings(
  deployments: AcDeploymentItem[],
  events: DeploymentEventItem[],
  recordings: AcAudioListItem[],
  /**
   * Show deployments that hold no recordings — folders left behind by a
   * failed upload, and chime deployments waiting for their first card. Only
   * the owner sees these: they would otherwise be invisible here while
   * still appearing in the destination picker on the next upload.
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

  // Each deployment exactly once: a folder and its chime are one row, and a
  // chime with no folder yet is a row of its own (empty until an upload).
  const groups: DeploymentGroup[] = [];
  for (const unified of unifyDeployments(deployments, events)) {
    const items = unified.folder ? (grouped.get(unified.folder.uri) ?? []) : [];
    if (items.length === 0 && !includeEmpty) continue;
    groups.push({
      key: unified.uri,
      name: unified.name,
      deployedAt: unified.deployedAt,
      coords: deploymentCoords(unified.folder, unified.event),
      deployment: unified.folder,
      event: unified.event,
      detailPath: unified.detailPath,
      items,
    });
  }

  const ungrouped = grouped.get("");
  if (ungrouped?.length) {
    groups.push({
      key: "",
      name: "",
      deployedAt: null,
      coords: null,
      deployment: null,
      event: null,
      detailPath: null,
      items: ungrouped,
    });
  }
  return groups;
}

export function AccountAudioViewer({
  did,
  showUploadCta,
  canDelete = false,
  mutationRepo = null,
  embedded = false,
  showEmptyDeployments,
  onStats,
}: {
  did: string;
  /** Whether to offer the personal SD-card upload flow (personal repos only). */
  showUploadCta: boolean;
  /** Whether the viewer may delete recordings (owner / org admin). */
  canDelete?: boolean;
  /** Group repo DID for mutations, when the profile is an organization. */
  mutationRepo?: string | null;
  /** Drop the page container chrome when hosted inside another surface
   *  (the Audio hub's Files tab), which brings its own width and padding. */
  embedded?: boolean;
  /** Also list deployments that hold no recordings yet. Defaults to
   *  `canDelete` — owners see their empty folders so they can clean them up
   *  — while the Audio hub's Recordings tab always shows them: deployments
   *  are created there, and a fresh chime starts with no recordings. */
  showEmptyDeployments?: boolean;
  /** Reports the listed deployment and recording counts once loaded, so an
   *  embedding surface (the hub's Deployments overview card) can show them
   *  in its own header instead of this component repeating them. */
  onStats?: (stats: { deploymentCount: number; recordingCount: number }) => void;
}) {
  const t = useTranslations("common.audiomoth.recordings");
  const tFolders = useTranslations("common.recordingFolders");
  const modal = useModal();

  const [host, setHost] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<AcDeploymentItem[] | null>(null);
  const [events, setEvents] = useState<DeploymentEventItem[] | null>(null);
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
    // The move picker offers every deployment exactly once — including chime
    // deployments nothing has been uploaded to yet.
    const moveTargets = deployments
      ? unifyDeployments(deployments, events ?? []).map((unified) => ({
          uri: unified.uri,
          name: unified.name,
          deployedAt: unified.deployedAt ?? undefined,
        }))
      : null;
    modal.pushModal(
      {
        id: "move-recordings",
        dialogWidth: "max-w-lg w-[calc(100%-2rem)]",
        content: (
          <MoveRecordingsModal
            count={items.length}
            folders={moveTargets}
            counts={counts}
            onMove={async (target, onProgress) => {
              let deploymentRef: string;
              if (target.kind === "existing" && isChimeEventUri(target.uri)) {
                /* Moving into a chime deployment nobody has uploaded to yet:
                   its folder record is created now, linked to the chime, and
                   the recordings are filed under it. */
                const event = (events ?? []).find((item) => item.uri === target.uri);
                if (!event) throw new Error(tFolders("moveFailed"));
                const created = await createAcDeployment(
                  companionFolderDraft(event, tFolders("newFolderRemarks")),
                  { repo: mutationRepo },
                );
                deploymentRef = created.uri;
                const refreshed = await listAcDeployments(did).catch(() => null);
                if (refreshed) setDeployments(refreshed);
              } else if (target.kind === "existing") {
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
  }, [clearSelection, deployments, did, events, modal, mutationRepo, recordings, selectedUris, tFolders]);

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
   * A deployment is named while an SD card uploads, so its name is the thing
   * most often worth fixing. One deployment can stand on two records — the
   * folder recordings are filed under and the chime played in the field — so
   * a rename writes the same name to both; a chime nobody has uploaded to
   * yet has only its event record to rename. Deleting takes the recordings
   * filed in it with it — an empty folder record left behind would only
   * strand them. */
  const renameDeployment = useCallback(
    (group: DeploymentGroup) => {
      const { deployment, event } = group;
      if (!deployment && !event) return;
      modal.pushModal(
        {
          id: "rename-recording-folder",
          content: (
            <RenameFolderModal
              currentName={group.name}
              onSave={async (name) => {
                if (deployment) {
                  const { cid } = await updateAcDeployment(deployment, { name }, { repo: mutationRepo });
                  const updated = applyAcDeploymentEdit(deployment, { name }, cid);
                  setDeployments((current) =>
                    current?.map((item) => (item.uri === updated.uri ? updated : item)) ?? current,
                  );
                  // The same name goes to the chime, so the Deployments tab
                  // never shows a stale one. Best-effort — the rename above
                  // already stands, and the next rename re-syncs the pair.
                  try {
                    const syncedEvent = await renameLinkedEvent(deployment, event, name, {
                      repo: mutationRepo,
                    });
                    if (syncedEvent) {
                      setEvents((current) =>
                        current?.map((item) => (item.uri === syncedEvent.uri ? syncedEvent : item)) ?? current,
                      );
                    }
                  } catch (syncError) {
                    console.warn("[audio-library] chime rename sync failed", syncError);
                  }
                } else if (event) {
                  const edit = eventRenameEdit(event, name);
                  const { cid } = await updateDeploymentEvent(event, edit, { repo: mutationRepo });
                  const updated = applyDeploymentEdit(event, edit, cid);
                  setEvents((current) =>
                    current?.map((item) => (item.uri === updated.uri ? updated : item)) ?? current,
                  );
                }
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

  /**
   * Manual location override: set or correct where the recorder stood.
   * Deployments created by uploading past SD-card audio carry no coordinates
   * at all — the chime flow asks up front, an upload never does — so this is
   * the only way theirs can ever be filled in. The override lands on every
   * record standing behind the deployment, so the labeling flow, the forms
   * and a chime's detail-page map all follow.
   */
  const setLocationFor = useCallback(
    (group: DeploymentGroup) => {
      const { deployment, event } = group;
      if (!deployment && !event) return;
      modal.pushModal(
        {
          id: "set-deployment-location",
          content: (
            <SetDeploymentLocationModal
              name={group.name}
              initial={group.coords}
              onSave={async (location) => {
                const updated = await setDeploymentLocation({ folder: deployment, event }, location, {
                  repo: mutationRepo,
                });
                if (updated.folder) {
                  const folder = updated.folder;
                  setDeployments((current) =>
                    current?.map((item) => (item.uri === folder.uri ? folder : item)) ?? current,
                  );
                }
                if (updated.event) {
                  const changedEvent = updated.event;
                  setEvents((current) =>
                    current?.map((item) => (item.uri === changedEvent.uri ? changedEvent : item)) ?? current,
                  );
                }
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
                /* The folder's auto-published soundscape (kept at the folder's
                   own rkey) would otherwise survive its recordings. Best
                   effort — it may never have existed. */
                const soundscapeRkey = rkeyOfUri(deployment.uri);
                if (soundscapeRkey) {
                  void deleteSoundscapeRecord(
                    soundscapeRkey,
                    mutationRepo ? { repo: mutationRepo } : undefined,
                  ).catch(() => {});
                }
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

  /**
   * Right-click → "Add to project": the folder joins a project's evidence
   * timeline (an existing project, or one named in the dialog). The folder
   * and its recordings stay exactly where they are — the project only gains
   * a timeline entry pointing at them.
   */
  const addFolderToProject = useCallback(
    (group: DeploymentGroup) => {
      const deployment = group.deployment;
      if (!deployment) return;
      const detailUrl = group.detailPath ? new URL(group.detailPath, window.location.origin).toString() : null;
      modal.pushModal(
        {
          id: "add-deployment-to-project",
          dialogWidth: "max-w-lg w-[calc(100%-2rem)]",
          content: (
            <AddDeploymentToProjectModal
              folderName={deployment.name}
              detailUrl={detailUrl}
              recordingUris={group.items.map((item) => item.uri)}
              did={did}
              mutationRepo={mutationRepo}
            />
          ),
        },
        true,
      );
      void modal.show();
    },
    [did, modal, mutationRepo],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const [pdsHost, deps, evts, recs] = await Promise.all([
          resolvePdsHost(did, ctrl.signal),
          listAcDeployments(did, ctrl.signal),
          // Chime deployments are additive — losing them must not hide the
          // uploaded recordings.
          listDeploymentEvents(did, ctrl.signal).catch(() => [] as DeploymentEventItem[]),
          listAllRecordings(did, ctrl.signal),
        ]);
        if (ctrl.signal.aborted) return;
        setHost(pdsHost);
        setDeployments(deps);
        setEvents(evts);
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

  const includeEmpty = showEmptyDeployments ?? canDelete;
  const groups = useMemo(
    () =>
      deployments && recordings ? groupRecordings(deployments, events ?? [], recordings, includeEmpty) : [],
    [includeEmpty, deployments, events, recordings],
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

  /* The counts the header (or the embedding card) speaks of: deployments as
     listed — including empty ones when they are shown — and every recording,
     grouped or not. */
  const deploymentCount = useMemo(() => groups.filter((group) => group.key).length, [groups]);
  useEffect(() => {
    if (loading || loadError) return;
    onStats?.({ deploymentCount, recordingCount: total });
  }, [deploymentCount, loadError, loading, onStats, total]);

  /* Embedded, the host surface owns the headline, counts and CTAs (the
     hub's Deployments overview card), so this row only appears when the
     selection toolbar needs somewhere to stand. The empty state below keeps
     its own upload CTA either way. */
  const showHeaderRow = !embedded || selectedCount > 0;
  /* The embedded Recordings tab already has the overview-card gap. When the
     selection toolbar appears, don't add a second large gap before the first
     deployment card; the standalone profile viewer keeps its original space. */
  const contentMargin = showHeaderRow && !embedded ? "mt-6" : undefined;

  return (
    <Container className={embedded ? "max-w-none p-0" : "pt-4 pb-10"}>
      {showHeaderRow ? (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {embedded ? null : (
            <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">
              {t("title")}
              {total > 0 ? (
                <span className="ms-2.5 align-middle font-sans text-sm font-normal not-italic tracking-normal text-muted-foreground">
                  {t("groupCount", { count: total })}
                </span>
              ) : null}
            </h1>
          )}
        </div>
        {selectedCount > 0 ? (
          /* Drive-style selection toolbar — replaces the header actions. */
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 ps-1.5 pe-1.5 shadow-sm">
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
        ) : showUploadCta && !embedded ? (
          <Button asChild size="sm">
            <Link href="/observations/audio?tab=upload">
              <UploadIcon className="size-4" />
              {t("uploadCta")}
            </Link>
          </Button>
        ) : null}
      </div>
      ) : null}

      {deleteError ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-warn/10 px-3 py-2 text-xs font-medium text-foreground/75">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-warn" />
          {deleteError}
        </p>
      ) : null}

      {loading ? (
        <div className={cn("flex flex-col gap-2", contentMargin)}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : loadError ? (
        <p className={cn("rounded-2xl border border-border bg-card/90 px-5 py-8 text-center text-sm text-muted-foreground", contentMargin)}>
          {t("loadError")}
        </p>
      ) : groups.length === 0 ? (
        /* Nothing at all — an owner whose only folders are empty still sees
           them below, so they can be cleaned up. */
        <div className={cn("rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center", contentMargin)}>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <AudioLinesIcon className="size-6" />
          </span>
          <h2 className="mt-4 text-base font-medium text-foreground">{t("accountEmptyTitle")}</h2>
          <p className="mx-auto mt-1.5 max-w-[440px] text-sm text-muted-foreground">{t("accountEmptyBody")}</p>
          {showUploadCta ? (
            <Button asChild size="sm" className="mt-5">
              <Link href="/observations/audio?tab=upload">
                <UploadIcon className="size-4" />
                {t("uploadCta")}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className={cn("flex flex-col gap-4", contentMargin)}>
          {groups.map((group) => {
            const folder = group.deployment;
            const section = (
              <section className="rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
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
                        {[
                          group.deployedAt ? formatDate(group.deployedAt) : null,
                          t("groupCount", { count: group.items.length }),
                          group.coords ? `${group.coords.lat.toFixed(5)}, ${group.coords.lon.toFixed(5)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {group.detailPath ? (
                      <Link
                        href={group.detailPath}
                        className="inline-flex shrink-0 items-center gap-1 px-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {t("viewDeployment")}
                        <ArrowUpRightIcon className="size-3" aria-hidden />
                      </Link>
                    ) : null}
                    {canDelete && (folder || group.event) ? (
                      /* Every folder action in one always-visible menu — the
                         right-click context menu below offers the same, but
                         only for those who think to try it. */
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="sm">
                            <PencilIcon className="size-4" />
                            {tFolders("editAction")}
                            <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {folder ? (
                            <DropdownMenuItem onSelect={() => addFolderToProject(group)}>
                              <FolderKanbanIcon />
                              {tFolders("addToProject.action")}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onSelect={() => setLocationFor(group)}>
                            <MapPinIcon />
                            {tFolders(group.coords ? "editLocationAction" : "locationAction")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => renameDeployment(group)}>
                            <PencilIcon />
                            {tFolders("renameAction")}
                          </DropdownMenuItem>
                          {folder ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => confirmDeleteFolder(group)}
                              >
                                <Trash2Icon />
                                {tFolders("deleteAction")}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4">
                  {group.items.length === 0 ? (
                    /* No recordings yet — but a deployment can already know
                       where its recorder stood (the chime flow asks up front,
                       and the owner can set it by hand). Show that place as a
                       small pinned map thumbnail beside the note, so an empty
                       folder still reads as a real spot without the full-height
                       map a populated deployment carries. */
                    group.coords ? (
                      <div className="flex items-center gap-4 rounded-xl border border-border p-3">
                        <DeploymentLocationMap
                          compact
                          lat={group.coords.lat}
                          lon={group.coords.lon}
                          label={group.name}
                          className="w-28 shrink-0 border-border/70"
                          heightClass="h-[72px]"
                        />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-foreground">{tFolders("emptyFolder")}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPinIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
                            <span className="tabular-nums">
                              {group.coords.lat.toFixed(5)}, {group.coords.lon.toFixed(5)}
                            </span>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                        {tFolders("emptyFolder")}
                      </p>
                    )
                  ) : (
                    <RecordingsExplorer
                      did={did}
                      host={host}
                      items={group.items}
                      location={group.coords ? { ...group.coords, label: group.name } : null}
                      selectable={canDelete}
                      selectedUris={selectedUris}
                      onToggleSelect={toggleSelect}
                    />
                  )}
                </div>
              </section>
            );
            // Owners and org admins also get a right-click menu on the
            // folder — the same actions as the header's Edit menu.
            if (!canDelete || !folder) {
              return <div key={group.key || "other"}>{section}</div>;
            }
            return (
              <ContextMenu key={group.key}>
                <ContextMenuTrigger asChild>{section}</ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => addFolderToProject(group)}>
                    <FolderKanbanIcon />
                    {tFolders("addToProject.action")}
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => setLocationFor(group)}>
                    <MapPinIcon />
                    {tFolders(group.coords ? "editLocationAction" : "locationAction")}
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => renameDeployment(group)}>
                    <PencilIcon />
                    {tFolders("renameAction")}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onSelect={() => confirmDeleteFolder(group)}>
                    <Trash2Icon />
                    {tFolders("deleteAction")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
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
