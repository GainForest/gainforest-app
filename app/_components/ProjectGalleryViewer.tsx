"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import type { ProjectGalleryImage, ProjectImageGallery } from "../_lib/indexer";
import { isPdsBlobUrl } from "../_lib/pds";

type GalleryImageView = ProjectGalleryImage & {
  galleryTitle: string | null;
  projectTitle: string;
};

type ProjectOption = {
  uri: string;
  title: string;
  count: number;
};

export function ProjectGalleryViewer({
  galleries,
  variant = "default",
  showProjectFilter = true,
  hideWhenEmpty = false,
  compact = false,
}: {
  galleries: ProjectImageGallery[];
  variant?: "default" | "account" | "bumicert";
  showProjectFilter?: boolean;
  hideWhenEmpty?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("common.projectGallery");
  void variant;

  const projectOptions = useMemo<ProjectOption[]>(() => {
    const map = new Map<string, ProjectOption>();
    for (const gallery of galleries) {
      const existing = map.get(gallery.projectUri);
      const count = gallery.images.length;
      if (existing) {
        existing.count += count;
        continue;
      }
      map.set(gallery.projectUri, {
        uri: gallery.projectUri,
        title: gallery.projectTitle ?? gallery.attachmentTitle ?? t("defaultProjectTitle"),
        count,
      });
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }, [galleries, t]);

  const [selectedProjectUri, setSelectedProjectUri] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const visibleGalleries = useMemo(
    () => selectedProjectUri ? galleries.filter((gallery) => gallery.projectUri === selectedProjectUri) : galleries,
    [galleries, selectedProjectUri],
  );
  const images = useMemo<GalleryImageView[]>(
    () => visibleGalleries.flatMap((gallery) => gallery.images.map((image) => ({
      ...image,
      galleryTitle: gallery.attachmentTitle,
      projectTitle: gallery.projectTitle ?? gallery.attachmentTitle ?? t("defaultProjectTitle"),
    }))),
    [t, visibleGalleries],
  );
  const activeImage = activeIndex !== null ? images[activeIndex] ?? null : null;

  if (galleries.length === 0 && hideWhenEmpty) return null;

  function closeLightbox() {
    setActiveIndex(null);
  }

  function stepLightbox(direction: -1 | 1) {
    if (activeIndex === null || images.length === 0) return;
    setActiveIndex((activeIndex + direction + images.length) % images.length);
  }

  return (
    <section className={compact ? "mt-10 border-t border-border-soft pt-6" : "py-6"}>
      {showProjectFilter && projectOptions.length > 0 ? (
        <div className="scrollbar-hidden -mx-1 overflow-x-auto px-1">
          <div className="flex min-w-max items-center gap-1.5 pb-1">
            <button
              type="button"
              onClick={() => setSelectedProjectUri(null)}
              aria-pressed={selectedProjectUri === null}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${selectedProjectUri === null ? "border-primary/35 bg-primary/[0.08] text-primary" : "border-border-soft bg-surface text-muted-foreground hover:text-foreground"}`}
            >
              {t("allProjects")}
            </button>
            {projectOptions.map((project) => (
              <button
                key={project.uri}
                type="button"
                onClick={() => setSelectedProjectUri(project.uri)}
                aria-pressed={selectedProjectUri === project.uri}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${selectedProjectUri === project.uri ? "border-primary/35 bg-primary/[0.08] text-primary" : "border-border-soft bg-surface text-muted-foreground hover:text-foreground"}`}
              >
                {project.title}
                <span className="ml-1 text-xs opacity-70">{t("projectImageCount", { count: project.count })}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {images.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-border-soft bg-surface/70 p-8 text-center">
          <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("emptyBody")}</p>
        </div>
      ) : (
        <ul role="list" className="mt-6 grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                className="group relative aspect-square w-full overflow-hidden rounded-lg bg-surface-sunken text-left outline-none transition-all duration-300 hover:z-10 hover:shadow-[0_18px_40px_-22px_rgba(20,30,15,0.55)] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-label={t("openImage", { projectTitle: image.projectTitle })}
              >
                <Image
                  src={image.url}
                  alt={t("imageAlt", { projectTitle: image.projectTitle, index: index + 1 })}
                  fill
                  sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, (max-width:1280px) 25vw, 220px"
                  unoptimized={!isPdsBlobUrl(image.url)}
                  className="scale-[1.04] object-cover transition-transform duration-500 group-hover:scale-100"
                />
                {showProjectFilter && !selectedProjectUri && projectOptions.length > 1 ? (
                  <span className="pointer-events-none absolute inset-x-2 bottom-2 truncate rounded-full bg-black/45 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-md">
                    {image.projectTitle}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeImage ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/88 p-4" onClick={closeLightbox}>
          <button type="button" onClick={closeLightbox} className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/20" aria-label={t("closeImage")}>
            <XIcon className="h-5 w-5" aria-hidden />
          </button>
          {images.length > 1 ? (
            <>
              <button type="button" onClick={(event) => { event.stopPropagation(); stepLightbox(-1); }} className="absolute left-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/20" aria-label={t("previousImage")}>
                <ChevronLeftIcon className="h-5 w-5" aria-hidden />
              </button>
              <button type="button" onClick={(event) => { event.stopPropagation(); stepLightbox(1); }} className="absolute right-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/20" aria-label={t("nextImage")}>
                <ChevronRightIcon className="h-5 w-5" aria-hidden />
              </button>
            </>
          ) : null}
          <div className="w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <div className="relative h-[78vh] w-full">
              <Image src={activeImage.url} alt={t("imageAlt", { projectTitle: activeImage.projectTitle, index: (activeIndex ?? 0) + 1 })} fill sizes="90vw" unoptimized={!isPdsBlobUrl(activeImage.url)} className="object-contain" />
            </div>
            <div className="mt-3 text-center text-sm text-white/78">
              <span className="font-medium text-white">{activeImage.projectTitle}</span>
              {activeImage.galleryTitle ? <span className="text-white/60"> · {activeImage.galleryTitle}</span> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
