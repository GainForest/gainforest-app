"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copy-to-clipboard button for the arena's one-line agent prompt. */
export function CopyPromptButton({
  text,
  copyLabel,
  copiedLabel,
}: {
  text: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the prompt stays visible and selectable.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
      {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      {copied ? copiedLabel : copyLabel}
    </Button>
  );
}
