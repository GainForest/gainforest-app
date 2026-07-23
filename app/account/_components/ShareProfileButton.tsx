"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type ShareProfileButtonProps = {
  /** Absolute, locale-prefixed path to the profile, e.g. "/en/account/handle". */
  profilePath: string;
  label: string;
  copiedLabel: string;
  errorLabel?: string;
};

export function ShareProfileButton({ profilePath, label, copiedLabel, errorLabel }: ShareProfileButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  const handleCopy = async () => {
    const url =
      typeof window !== "undefined"
        ? new URL(profilePath, window.location.origin).toString()
        : profilePath;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setState("error");
      window.setTimeout(() => setState("idle"), 2000);
      return;
    }
    setState("copied");
    window.setTimeout(() => setState("idle"), 2000);
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
      {state === "copied" ? <CheckIcon /> : state === "error" ? <TriangleAlertIcon /> : <LinkIcon />}
      {state === "copied" ? copiedLabel : state === "error" ? errorLabel ?? label : label}
    </Button>
  );
}
