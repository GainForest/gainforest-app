"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A record fragment with a copy button. The JSON itself is data — identical in
// every locale — so only the button labels are translated.
export function JsonBlock({ code, label, tone }: { code: string; label: string; tone?: "gainforest" | "maearth" | "advice" }) {
  const t = useTranslations("common.hypercerts.snippets");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — ignore.
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/25">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2">
        <span
          className={cn(
            "font-mono text-[10.5px] uppercase tracking-[0.12em]",
            tone === "advice" ? "text-primary" : "text-muted-foreground/70",
          )}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? t("copied") : t("copy")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          {copied ? <CheckIcon className="h-3 w-3 text-primary" /> : <CopyIcon className="h-3 w-3" />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto px-3.5 py-3 text-[11.5px] leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}
