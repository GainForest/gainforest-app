"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AudioLinesIcon, ChevronLeftIcon, ChevronRightIcon, ImageOffIcon, XIcon } from "lucide-react";
import { isPdsBlobUrl } from "../../../../_lib/pds";
import { pauseOtherAudio } from "../../../../_lib/audio-coordinator";

export type ObservationViewerImage = { url: string; caption: string | null };

// iNaturalist-style media viewer for a single nature sighting: one large photo
// with a thumbnail strip beneath it, an optional field-sound player, and a
// click-to-zoom lightbox. Pure client so the photo can be swapped and zoomed
// without a round-trip.
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

  const hasImages = images.length > 0;
  const safeActive = Math.min(active, Math.max(images.length - 1, 0));
  const current = images[safeActive] ?? null;

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowRight") setActive((index) => (index + 1) % images.length);
      if (event.key === "ArrowLeft") setActive((index) => (index - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxOpen, images.length]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-border-soft bg-surface-sunken">
        <div className="relative aspect-square w-full sm:aspect-[4/3]">
          {current ? (
            <button
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

          {images.length > 1 && (
            <>
              <ArrowControl
                side="left"
                label={t("previous")}
                onClick={() => setActive((index) => (index - 1 + images.length) % images.length)}
              />
              <ArrowControl
                side="right"
                label={t("next")}
                onClick={() => setActive((index) => (index + 1) % images.length)}
              />
              <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur-sm">
                {safeActive + 1} / {images.length}
              </span>
            </>
          )}
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

      {lightboxOpen && current ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={current.caption || title}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label={t("close")}
            className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <XIcon className="h-5 w-5" aria-hidden />
          </button>
          {hasImages && images.length > 1 ? (
            <>
              <ArrowControl
                side="left"
                label={t("previous")}
                onClick={(event) => {
                  event.stopPropagation();
                  setActive((index) => (index - 1 + images.length) % images.length);
                }}
                large
              />
              <ArrowControl
                side="right"
                label={t("next")}
                onClick={(event) => {
                  event.stopPropagation();
                  setActive((index) => (index + 1) % images.length);
                }}
                large
              />
            </>
          ) : null}
          <div className="relative h-full max-h-[88vh] w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <Image
              src={current.url}
              alt={current.caption || title}
              fill
              sizes="100vw"
              unoptimized={!isPdsBlobUrl(current.url)}
              className="object-contain"
            />
          </div>
        </div>
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
  onClick: (event: React.MouseEvent) => void;
  large?: boolean;
}) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center rounded-full transition-colors ${
        side === "left" ? "left-2" : "right-2"
      } ${
        large
          ? "h-12 w-12 bg-white/15 text-white hover:bg-white/25"
          : "h-9 w-9 bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
      }`}
    >
      <Icon className={large ? "h-6 w-6" : "h-5 w-5"} aria-hidden />
    </button>
  );
}
