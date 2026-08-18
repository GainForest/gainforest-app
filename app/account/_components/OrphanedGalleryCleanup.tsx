"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ManageTarget } from "@/lib/links";
import type { ProjectImageGallery } from "../../_lib/indexer";
import { isPdsBlobUrl } from "../../_lib/pds";
import { deleteRecord } from "../../(manage)/manage/_lib/mutations";

const ATTACHMENT_COLLECTION = "org.hypercerts.context.attachment";

function rkeyFromUri(uri: string): string | null {
  const rkey = uri.split("/").pop();
  return rkey && rkey.length > 0 ? rkey : null;
}

// A cleanup panel for galleries left behind when their project was deleted.
// Each orphaned gallery belonged to one removed project, so deletion is record
// level: removing it deletes the whole leftover attachment and all its photos.
export function OrphanedGalleryCleanup({
  galleries,
  target,
  onRemoved,
}: {
  galleries: ProjectImageGallery[];
  target: ManageTarget;
  onRemoved: (galleryId: string) => void;
}) {
  const t = useTranslations("common.projectGallery.cleanup");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repoOptions = target.kind === "group" ? { repo: target.did } : undefined;
  const busy = pendingId !== null || busyAll;

  async function removeGallery(gallery: ProjectImageGallery) {
    const rkey = rkeyFromUri(gallery.attachmentUri);
    if (!rkey) throw new Error(t("error"));
    await deleteRecord(ATTACHMENT_COLLECTION, rkey, repoOptions);
    onRemoved(gallery.id);
  }

  async function handleRemoveOne(gallery: ProjectImageGallery) {
    if (busy) return;
    setConfirmId(null);
    setPendingId(gallery.id);
    setError(null);
    try {
      await removeGallery(gallery);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : t("error"));
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemoveAll() {
    if (busy) return;
    setConfirmAll(false);
    setBusyAll(true);
    setError(null);
    try {
      for (const gallery of [...galleries]) {
        await removeGallery(gallery);
      }
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : t("error"));
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <section className="mb-6 rounded-3xl border border-warn/25 bg-warn/5 p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-warn/15 text-warn">
            <TriangleAlertIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-instrument text-2xl italic leading-none text-foreground">{t("title")}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{t("body")}</p>
          </div>
        </div>
        {galleries.length > 1 ? (
          <div className="flex shrink-0 items-center gap-2">
            {confirmAll ? (
              <>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setConfirmAll(false)}>
                  {t("cancel")}
                </Button>
                <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void handleRemoveAll()}>
                  {busyAll ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
                  {t("confirmRemove")}
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setConfirmAll(true); setConfirmId(null); }}>
                <Trash2Icon className="size-4" />
                {t("removeAll")}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 flex items-center gap-2 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-foreground">
          <TriangleAlertIcon className="size-4 shrink-0 text-warn" />
          {error}
        </p>
      ) : null}

      <ul role="list" className="mt-5 space-y-3">
        {galleries.map((gallery) => {
          const removing = pendingId === gallery.id || busyAll;
          const confirming = confirmId === gallery.id;
          return (
            <li
              key={gallery.id}
              className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-surface px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <ul role="list" className="flex shrink-0 -space-x-2">
                  {gallery.images.slice(0, 4).map((image, index) => (
                    <li key={image.id} className="relative size-12 overflow-hidden rounded-lg ring-2 ring-surface">
                      <Image
                        src={image.url}
                        alt={t("imageAlt", { index: index + 1 })}
                        fill
                        sizes="48px"
                        unoptimized={!isPdsBlobUrl(image.url)}
                        className="object-cover"
                      />
                    </li>
                  ))}
                </ul>
                <p className="min-w-0 truncate text-sm font-medium text-foreground">
                  {t("groupLabel", { count: gallery.images.length })}
                </p>
              </div>
              <div className={cn("flex shrink-0 items-center gap-2", removing && "opacity-90")}>
                {confirming ? (
                  <>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setConfirmId(null)}>
                      {t("cancel")}
                    </Button>
                    <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void handleRemoveOne(gallery)}>
                      {removing ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
                      {t("confirmRemove")}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => { setConfirmId(gallery.id); setConfirmAll(false); }}
                    className="text-destructive hover:text-destructive"
                  >
                    {removing ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
                    {t("remove")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
