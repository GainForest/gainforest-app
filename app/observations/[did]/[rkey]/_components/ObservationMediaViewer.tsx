"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AudioLinesIcon, ChevronLeftIcon, ChevronRightIcon, ImageOffIcon, XIcon } from "lucide-react";
import { isPdsBlobUrl } from "../../../../_lib/pds";
import { pauseOtherAudio } from "../../../../_lib/audio-coordinator";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPlaceholder,
  DialogTitle,
} from "@/components/ui/modal/dialog";

export type ObservationViewerImage = { url: string; caption: string | null };

export function ObservationMediaViewer({
  images,
  audioUrl,
  title,
}: {
  images: ObservationViewerImage[];
  audioUrl: string | null;
  title: string;
}) {
  const t = useTranslations("marketplace.observationPage");
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement | null>(null);

  const safeActive = Math.min(active, Math.max(images.length - 1, 0));
  const current = images[safeActive] ?? null;

  const showPrevious = () => setActive((index) => (index - 1 + images.length) % images.length);
  const showNext = () => setActive((index) => (index + 1) % images.length);
  const handleGalleryKeyDown = (event: React.KeyboardEvent) => {
    if (images.length <= 1) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showNext();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPrevious();
    }
  };

  return (
    <div className="space-y-3" onKeyDown={handleGalleryKeyDown}>
      <div className="relative overflow-hidden rounded-2xl border border-border-soft bg-surface-sunken">
        <div className="relative aspect-square w-full sm:aspect-[4/3]">
          {current ? (
            <button
              ref={zoomTriggerRef}
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label={t("zoom")}
              className="group absolute inset-0 cursor-zoom-in"
            >
              <Image
                src={current.url}
                alt={current.caption || title}
                fill
                priority
                sizes="(min-width: 1024px) 640px, 100vw"
                unoptimized={!isPdsBlobUrl(current.url)}
                className="object-contain"
              />
            </button>
          ) : (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <ImageOffIcon className="h-16 w-16 opacity-40" strokeWidth={1.25} aria-hidden />
            </div>
          )}

          {images.length > 1 ? (
            <>
              <ArrowControl side="left" label={t("previous")} onClick={showPrevious} />
              <ArrowControl side="right" label={t("next")} onClick={showNext} />
              <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur-sm">
                {safeActive + 1} / {images.length}
              </span>
            </>
          ) : null}
        </div>

        {current?.caption ? (
          <p className="border-t border-border-soft px-4 py-2.5 text-[13px] leading-snug text-muted-foreground">
            {current.caption}
          </p>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              aria-label={t("showPhoto", { number: index + 1 })}
              aria-pressed={index === safeActive}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                index === safeActive ? "border-primary" : "border-transparent hover:border-border"
              }`}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="64px"
                unoptimized={!isPdsBlobUrl(image.url)}
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {audioUrl ? (
        <div className="rounded-2xl border border-border-soft bg-surface/60 p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
            <AudioLinesIcon className="h-4 w-4 text-primary" aria-hidden />
            {t("fieldSound")}
          </div>
          <audio
            ref={audioRef}
            controls
            preload="metadata"
            src={audioUrl}
            onPlay={() => pauseOtherAudio(audioRef.current)}
            className="h-10 w-full accent-primary"
          >
            {t("audioUnsupported")}
          </audio>
        </div>
      ) : null}

      {current ? (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogPlaceholder
            fullscreen
            className="gap-0 overflow-hidden bg-black/95 p-0 text-white"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              closeButtonRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              zoomTriggerRef.current?.focus();
            }}
          >
            <DialogTitle className="sr-only">{current.caption || title}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("showPhoto", { number: safeActive + 1 })}
            </DialogDescription>
            <DialogClose asChild>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label={t("close")}
                className="absolute right-4 top-4 z-20 grid size-11 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
              >
                <XIcon className="h-5 w-5" aria-hidden />
              </button>
            </DialogClose>
            {images.length > 1 ? (
              <>
                <ArrowControl side="left" label={t("previous")} onClick={showPrevious} large />
                <ArrowControl side="right" label={t("next")} onClick={showNext} large />
              </>
            ) : null}
            <div className="relative h-full w-full">
              <Image
                src={current.url}
                alt={current.caption || title}
                fill
                sizes="100vw"
                unoptimized={!isPdsBlobUrl(current.url)}
                className="object-contain"
              />
            </div>
          </DialogPlaceholder>
        </Dialog>
      ) : null}
    </div>
  );
}

function ArrowControl({
  side,
  label,
  onClick,
  large = false,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
  large?: boolean;
}) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={`absolute top-1/2 z-10 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full transition-colors ${
        side === "left" ? "left-2" : "right-2"
      } ${
        large
          ? "h-12 w-12 bg-white/15 text-white hover:bg-white/25"
          : "h-11 w-11 bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
      }`}
    >
      <Icon className={large ? "h-6 w-6" : "h-5 w-5"} aria-hidden />
    </button>
  );
}
