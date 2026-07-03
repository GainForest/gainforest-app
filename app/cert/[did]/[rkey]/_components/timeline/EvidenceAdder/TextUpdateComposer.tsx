"use client";

import { useId, useState } from "react";
import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AttachmentDraft } from "../contextAttachmentMutations";
import { CONTENT_TYPE_UPDATE, type EvidenceSubmitter } from "./types";

const MAX_TITLE_LENGTH = 256;

/**
 * Write a plain-text project update. Stored as an
 * `org.hypercerts.context.attachment` with `contentType: "update"` and the
 * body as a `pub.leaflet.pages.linearDocument` description — no files needed.
 */
export function TextUpdateComposer({
  isSubmitting,
  submitDrafts,
}: {
  isSubmitting: boolean;
  submitDrafts: EvidenceSubmitter;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const titleId = useId();
  const bodyId = useId();

  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  const draft: AttachmentDraft = {
    title: title.trim(),
    contentType: CONTENT_TYPE_UPDATE,
    contents: [],
    textBody: body,
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleId} className="text-sm font-medium">
          {evidenceT("update.titleLabel")}
        </label>
        <Input
          id={titleId}
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          placeholder={evidenceT("update.titlePlaceholder")}
          disabled={isSubmitting}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyId} className="text-sm font-medium">
          {evidenceT("update.bodyLabel")}
        </label>
        <Textarea
          id={bodyId}
          value={body}
          rows={6}
          placeholder={evidenceT("update.bodyPlaceholder")}
          disabled={isSubmitting}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={isSubmitting || !canSubmit}
        onClick={() =>
          submitDrafts(draft, () => {
            setTitle("");
            setBody("");
          })
        }
      >
        {isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
        {isSubmitting ? evidenceT("update.posting") : evidenceT("update.post")}
        {!isSubmitting ? <ArrowRightIcon /> : null}
      </Button>
    </div>
  );
}
