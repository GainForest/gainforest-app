"use client";

/**
 * Adding a soundscape to a project update.
 *
 * A soundscape is the 24-hour clock built from a run of recordings; it is
 * published once (from the AudioMoth tool) and then pointed at from anywhere
 * it belongs. So this picker lists what the project's account has already
 * published rather than analyzing anything here — the analysis is a
 * multi-gigabyte job, and an update composer is the wrong place for it.
 *
 * The attachment stores only the soundscape's AT-URI. The timeline reads that
 * record when a reader opens the entry and draws the playable dial in place,
 * so an update carries the sound of the place without carrying its audio.
 */

import { useEffect, useState } from "react";
import type { LeafletLinearDocument } from "@/app/_lib/leaflet-richtext";
import { Loader2Icon, MusicIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  listPublishedSoundscapes,
  type ListedSoundscape,
} from "@/app/_lib/soundscape-record";
import { formatDateRange, SOUNDSCAPE_ATTACHMENT_CONTENT_TYPE } from "@/lib/soundscape/record";
import type { AttachmentDraft } from "../contextAttachmentMutations";
import { CheckRow } from "./CheckRow";
import { ListLayout } from "./ListHelpers";
import { SubmitButton } from "./SubmitButton";
import type { EvidenceSubmitter } from "./types";

export function SoundscapeEvidencePicker({
  organizationDid,
  caption,
  captionDocument,
  captionTitle,
  isSubmitting,
  submitDrafts,
}: {
  organizationDid: string;
  caption: string;
  captionDocument: LeafletLinearDocument | null;
  captionTitle: string | null;
  isSubmitting: boolean;
  submitDrafts: EvidenceSubmitter;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const soundscapeT = useTranslations("common.soundscape.published");
  const [soundscapes, setSoundscapes] = useState<ListedSoundscape[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    setSoundscapes(null);
    setLoadFailed(false);
    listPublishedSoundscapes(organizationDid, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setSoundscapes(items);
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setLoadFailed(true);
        setSoundscapes([]);
      });
    return () => controller.abort();
  }, [organizationDid]);

  function toggle(uri: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }

  if (soundscapes === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-background/70 px-3 py-4 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        {evidenceT("loadingSources")}
      </div>
    );
  }

  if (loadFailed) {
    return (
      <p className="rounded-xl border border-warn/20 bg-warn/10 px-3 py-2 text-sm text-warn">
        {evidenceT("sourcesLoadError")}
      </p>
    );
  }

  // The button that opens this panel is only shown once the account has
  // published a soundscape, so an empty list here means every published one
  // was unreadable — say so plainly rather than showing an empty box.
  if (soundscapes.length === 0) {
    return (
      <p className="rounded-xl bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
        {evidenceT("soundscapeEmpty")}
      </p>
    );
  }

  const draft: AttachmentDraft = {
    title: captionTitle ?? evidenceT("attachmentTitles.soundscape"),
    contentType: SOUNDSCAPE_ATTACHMENT_CONTENT_TYPE,
    contents: Array.from(selected),
    note: caption,
    textDocument: captionDocument,
  };

  return (
    <>
      <p className="px-1 pb-1 text-xs text-muted-foreground">{evidenceT("soundscapeHelp")}</p>
      <ListLayout>
        {soundscapes.map((soundscape) => (
          <CheckRow
            key={soundscape.uri}
            selected={selected.has(soundscape.uri)}
            onToggle={() => toggle(soundscape.uri)}
            icon={MusicIcon}
            primary={soundscape.title.trim() || evidenceT("untitledSoundscape")}
            secondary={soundscapeT("summary", {
              count: soundscape.recordingCount,
              dates: formatDateRange(soundscape.dates),
            })}
            disabled={isSubmitting}
          />
        ))}
      </ListLayout>
      <SubmitButton
        count={selected.size}
        isSubmitting={isSubmitting}
        onClick={() =>
          submitDrafts(draft, () => {
            setSelected(new Set());
          })
        }
      />
    </>
  );
}
