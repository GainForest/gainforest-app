"use client";

/**
 * First-time consent modal for Bluesky cross-posting.
 *
 * Cross-posting is strictly opt-in: nothing is ever written to the
 * app.bsky.* collections until the user confirms here once (the consent
 * timestamp is persisted in app.gainforest.actor.preferences, so the modal
 * doesn't reappear on later toggles). The copy leads with the upside —
 * being discovered by the wider Bluesky network — and is explicit about
 * creating a Bluesky profile from the GainForest profile when the account
 * doesn't have one yet.
 *
 * The caller owns the side effects: `onConfirm` typically runs
 * ensureBlueskyProfile() + saveBlueskyCrosspostPref(true).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlledModal } from "@/components/ui/modal/controlled-modal";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { BlueskyIcon } from "./BlueskyIcon";

export function BlueskyConsentModal({
  open,
  needsProfile,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  /** true = no Bluesky profile yet (one will be created); null = unknown. */
  needsProfile: boolean | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("common.bluesky.consent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ControlledModal
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      dialogWidth="max-w-md"
    >
      <ModalContent dismissible={!busy} className="space-y-4">
        <div className="space-y-2">
          <ModalTitle className="flex items-center gap-2 pr-10">
            <BlueskyIcon className="size-5 shrink-0 text-[#1185fe]" />
            {t("title")}
          </ModalTitle>
          <ModalDescription className="space-y-2.5">
            <span className="block">{t("body")}</span>
            <span className="block">{t("discovery")}</span>
            {/* Definite copy only when we KNOW the profile is missing;
                conditional copy while the check is unresolved. */}
            {needsProfile === true ? (
              <span className="block">{t("profileNote")}</span>
            ) : needsProfile === null ? (
              <span className="block">{t("profileNoteMaybe")}</span>
            ) : null}
            <span className="block text-xs text-muted-foreground/80">{t("optOutNote")}</span>
          </ModalDescription>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <ModalFooter className="sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={busy}>
            {busy ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("confirm")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </ControlledModal>
  );
}
