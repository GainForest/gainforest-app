"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type ShareProfileButtonProps = {
  /** Absolute, locale-prefixed path to the profile, e.g. "/en/account/handle". */
  profilePath: string;
  label: string;
  copiedLabel: string;
};

export function ShareProfileButton({ profilePath, label, copiedLabel }: ShareProfileButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url =
      typeof window !== "undefined"
        ? new URL(profilePath, window.location.origin).toString()
        : profilePath;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="bg-background/70"
      onClick={handleCopy}
      aria-live="polite"
    >
      {copied ? <CheckIcon /> : <LinkIcon />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
