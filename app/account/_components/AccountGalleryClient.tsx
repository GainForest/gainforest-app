"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ManageTarget } from "@/lib/links";
import type { ProjectImageGallery } from "../../_lib/indexer";
import { canCreateRecord, canDeleteRecord } from "../../(manage)/manage/_lib/cgs-permissions";
import { EmptyHeroBanner } from "../../_components/EmptyHeroBanner";
import { ProjectGalleryViewer } from "../../_components/ProjectGalleryViewer";
import { AccountGalleryUploader, type GalleryProjectOption } from "./AccountGalleryUploader";
import { OrphanedGalleryCleanup } from "./OrphanedGalleryCleanup";

export function AccountGalleryClient({
  initialGalleries,
  orphanedGalleries,
  projects,
  target,
  accountName,
}: {
  initialGalleries: ProjectImageGallery[];
  // Galleries pinned to a project that no longer exists; only managers who can
  // delete records see the cleanup controls for these.
  orphanedGalleries: ProjectImageGallery[];
  projects: GalleryProjectOption[];
  // null when the viewer has no rights to manage this account (read-only).
  target: ManageTarget | null;
  accountName: string;
}) {
  const router = useRouter();
  const t = useTranslations("common.projectGallery");
  const [galleries, setGalleries] = useState<ProjectImageGallery[]>(initialGalleries);
  const [orphaned, setOrphaned] = useState<ProjectImageGallery[]>(orphanedGalleries);

  const canUpload = target ? canCreateRecord(target).allowed : false;
  const canDelete = target ? canDeleteRecord(target).allowed : false;

  // Orphaned photos are surfaced only to a manager who can actually delete the
  // leftover records; everyone else simply never sees deleted-project images.
  const cleanup = target && canDelete && orphaned.length > 0 ? (
    <OrphanedGalleryCleanup
      galleries={orphaned}
      target={target}
      onRemoved={(galleryId) => {
        setOrphaned((prev) => prev.filter((gallery) => gallery.id !== galleryId));
        // Re-sync from the indexer in the background once a record is gone.
        router.refresh();
      }}
    />
  ) : null;

  // While the gallery is empty we either offer the uploader (to managers who can
  // add images) or a bare "nothing here yet" banner (to read-only visitors).
  // Once the first images land we fall through to the read-only viewer.
  if (galleries.length === 0) {
    if (canUpload && target) {
      return (
        <>
          {cleanup}
          <AccountGalleryUploader
            target={target}
            projects={projects}
            accountName={accountName}
            onUploaded={(gallery) => {
              setGalleries([gallery]);
              // Re-sync from the indexer in the background; the optimistic gallery
              // keeps the just-uploaded images visible until it catches up.
              router.refresh();
            }}
          />
        </>
      );
    }

    return (
      <>
        {cleanup}
        <div className="py-2">
          <EmptyHeroBanner description={t("emptyBody")} />
        </div>
      </>
    );
  }

  return (
    <>
      {cleanup}
      <ProjectGalleryViewer galleries={galleries} variant="account" />
    </>
  );
}
