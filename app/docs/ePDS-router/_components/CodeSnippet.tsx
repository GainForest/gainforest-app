"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon } from "lucide-react";

// A copy-pasteable command block with a copy button. The code itself is
// data (identical in every locale); only the labels are translated.
export function CodeSnippet({ code, label }: { code: string; label?: string }) {
  const t = useTranslations("common.epdsRouter.snippets");
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
    <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/30">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? t("copied") : t("copy")}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          {copied ? <CheckIcon className="h-3 w-3 text-primary" /> : <CopyIcon className="h-3 w-3" />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto px-4 py-3.5 text-[12px] leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}
