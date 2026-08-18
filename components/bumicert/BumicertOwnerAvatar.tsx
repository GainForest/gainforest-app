"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { isPdsBlobUrl, resolveBlobUrl } from "@/app/_lib/pds";
import { cn } from "@/lib/utils";

function firstInitial(label: string): string {
  return Array.from(label.trim())[0]?.toUpperCase() ?? "?";
}

export function BumicertOwnerAvatar({
  did,
  avatarUrl,
  avatarRef,
  label,
  className,
  fallbackClassName,
}: {
  did?: string | null;
  avatarUrl?: string | null;
  avatarRef?: string | null;
  label: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setResolvedUrl(null);
    if (avatarUrl || !did || !avatarRef) return;

    const controller = new AbortController();
    resolveBlobUrl(did, avatarRef, controller.signal)
      .then((url) => setResolvedUrl(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolvedUrl(null);
      });

    return () => controller.abort();
  }, [avatarRef, avatarUrl, did]);

  const src = !failed ? (avatarUrl ?? resolvedUrl) : null;

  return (
    <span className={cn("relative block overflow-hidden rounded-full bg-white", className)} aria-hidden>
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes="32px"
          unoptimized={!isPdsBlobUrl(src)}
          onError={() => setFailed(true)}
          className="object-cover"
        />
      ) : (
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-muted text-[8px] font-bold text-muted-foreground",
            fallbackClassName,
          )}
        >
          {firstInitial(label)}
        </span>
      )}
    </span>
  );
}
