"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { isPdsBlobUrl, resolveBlobUrl } from "../_lib/pds";
import { cn } from "@/lib/utils";

/** Up-to-two-letter initials from a display name, for the avatar fallback. */
function initialsOf(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Avatar that prefers a ready image URL (the feed resolves these server-side),
 * otherwise resolves a PDS blob ref for the given DID, and finally falls back
 * to initials (or a supplied icon). Shared by the feed timeline, composer, and
 * comment threads so identity renders consistently everywhere.
 *
 * PDS blob URLs go through the Next image optimizer — avatars are often
 * multi-megabyte originals rendered at ~40px, so serving a resized, cached
 * variant is a huge win. Arbitrary external URLs stay `unoptimized` (their
 * hosts aren't ours to allowlist).
 */
export function ResolvedAvatar({
  did,
  avatarRef,
  imageUrl,
  name,
  fallbackIcon,
  className,
  sizes = "40px",
}: {
  did?: string | null;
  avatarRef?: string | null;
  imageUrl?: string | null;
  name?: string | null;
  fallbackIcon?: ReactNode;
  className?: string;
  sizes?: string;
}) {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    setResolved(null);
    if (imageUrl || !did || !avatarRef) return;
    const controller = new AbortController();
    resolveBlobUrl(did, avatarRef, controller.signal)
      .then((url) => setResolved(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolved(null);
      });
    return () => controller.abort();
  }, [did, avatarRef, imageUrl]);

  const src = imageUrl ?? resolved;
  const initials = initialsOf(name);

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-primary",
        className,
      )}
      aria-hidden
    >
      {src ? (
        <Image src={src} alt="" fill unoptimized={!isPdsBlobUrl(src)} sizes={sizes} className="object-cover" />
      ) : fallbackIcon ? (
        fallbackIcon
      ) : initials ? (
        <span className="text-xs font-semibold leading-none">{initials}</span>
      ) : null}
    </span>
  );
}
