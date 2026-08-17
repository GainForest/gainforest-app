"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, LinkIcon, StarIcon } from "lucide-react";
import { listRsvpsForDid, type RsvpStatus } from "@/app/_lib/events";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createRsvp, removeRsvp } from "../../_lib/mutations";

type EventRef = { uri: string; cid: string | null; name: string };

export function RsvpControls({ event, sessionDid }: { event: EventRef; sessionDid: string | null }) {
  const t = useTranslations("events");
  const [status, setStatus] = useState<RsvpStatus | null>(null);
  const [rkey, setRkey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<RsvpStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionDid) return;
    const controller = new AbortController();
    listRsvpsForDid(sessionDid, controller.signal)
      .then((rsvps) => {
        const mine = rsvps.find((r) => r.subjectUri === event.uri && r.status !== "notgoing");
        if (mine) {
          setStatus(mine.status);
          setRkey(mine.rkey);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [sessionDid, event.uri]);

  async function choose(next: RsvpStatus) {
    if (!sessionDid || busy) return;
    setError(null);
    setBusy(true);
    try {
      // Remove any existing RSVP first (toggle off, or switch levels).
      if (rkey) {
        await removeRsvp(rkey);
        setRkey(null);
      }
      if (status === next) {
        // Clicking the active choice clears the RSVP.
        setStatus(null);
      } else {
        const created = await createRsvp(event, next);
        setStatus(next);
        setRkey(created.rkey);
        setConfirmFor(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("rsvp.error"));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (!sessionDid) {
    return <p className="text-sm text-muted-foreground">{t("rsvp.signInRequired")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button
          onClick={() => choose("going")}
          disabled={busy}
          variant={status === "going" ? "default" : "outline"}
          className={cn("flex-1", status === "going" && "ring-2 ring-primary/40")}
        >
          <CheckIcon className="size-4" /> {status === "going" ? t("rsvp.going") : t("rsvp.goingAction")}
        </Button>
        <Button
          onClick={() => choose("interested")}
          disabled={busy}
          variant={status === "interested" ? "default" : "outline"}
          className="flex-1"
        >
          <StarIcon className="size-4" /> {status === "interested" ? t("rsvp.interested") : t("rsvp.interestedAction")}
        </Button>
      </div>

      {status ? (
        <p className="text-xs text-muted-foreground">{t("rsvp.tapToRemove")}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <AnimatePresence>
        {confirmFor ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-sm font-medium">
              {confirmFor === "going" ? t("rsvp.confirmGoing") : t("rsvp.confirmInterested")}
            </span>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <LinkIcon className="size-3.5" />
              {copied ? t("rsvp.copied") : t("rsvp.copyLink")}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
