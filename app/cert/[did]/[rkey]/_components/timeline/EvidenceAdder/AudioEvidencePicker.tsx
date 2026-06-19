"use client";

import { useState } from "react";
import { MicIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ManagedAudio } from "@/app/_lib/indexer";
import { formatDate } from "@/app/_lib/format";
import type { AttachmentDraft } from "../contextAttachmentMutations";
import { CheckRow } from "./CheckRow";
import { ListLayout, ManageLink, PickerEmpty } from "./ListHelpers";
import { OptionalNote } from "./OptionalNote";
import { SubmitButton } from "./SubmitButton";
import type { EvidenceSubmitter } from "./types";

export function AudioEvidencePicker({
  data,
  isSubmitting,
  submitDrafts,
}: {
  data: ManagedAudio[];
  isSubmitting: boolean;
  submitDrafts: EvidenceSubmitter;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const selectable = data.filter((item) => item.metadata.uri);

  function toggle(uri: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }

  if (selectable.length === 0) {
    return <PickerEmpty label={evidenceT("emptyLabels.audio")} href="/manage/audio" />;
  }

  const draft: AttachmentDraft = {
    title: evidenceT("attachmentTitles.audio"),
    contentType: "audio",
    contents: Array.from(selected),
    note,
  };

  return (
    <>
      <ListLayout>
        {selectable.map((item) => (
          <CheckRow
            key={item.metadata.uri}
            selected={selected.has(item.metadata.uri)}
            onToggle={() => toggle(item.metadata.uri)}
            icon={MicIcon}
            primary={item.record.name ?? evidenceT("untitledRecording")}
            secondary={formatDate(
              item.record.recordedAt ?? item.metadata.createdAt,
            )}
            disabled={isSubmitting}
          />
        ))}
      </ListLayout>
      <ManageLink
        href="/manage/audio"
        label={evidenceT("manageType", { type: evidenceT("emptyLabels.audio") })}
      />
      <OptionalNote value={note} onChange={setNote} disabled={isSubmitting} />
      <SubmitButton
        count={selected.size}
        isSubmitting={isSubmitting}
        onClick={() =>
          submitDrafts(draft, () => {
            setSelected(new Set());
            setNote("");
          })
        }
      />
    </>
  );
}
