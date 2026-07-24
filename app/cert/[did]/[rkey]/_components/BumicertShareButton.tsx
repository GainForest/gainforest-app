"use client";

import { useState } from "react";
import { CheckIcon, Share2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function BumicertShareButton({ className }: { className?: string }) {
  const t = useTranslations("bumicert.detail.headerTabs");
  const [copied, setCopied] = useState(false);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 backdrop-blur-sm transition-colors hover:bg-muted/60 motion-reduce:transition-none",
        className,
      )}
      aria-label={copied ? t("copied") : t("share")}
      aria-live="polite"
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Share2Icon className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
      <span className={copied ? "text-xs font-medium text-primary" : "text-xs font-medium text-foreground/60"}>
        {copied ? t("copied") : t("share")}
      </span>
    </button>
  );
}
