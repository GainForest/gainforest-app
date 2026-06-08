"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "./audio-copy";

/**
 * Map PDS-normalised MIME types back to canonical browser-playable equivalents.
 * The PDS normalises on blob upload (e.g. "audio/wav" → "audio/vnd.wave"), but
 * browsers don't recognise non-standard types in <source type="...">, causing
 * them to skip the source and refuse to play.
 */
function toPlayableMimeType(mime: string | undefined): string | undefined {
  if (!mime) return undefined;
  const map: Record<string, string> = {
    "audio/vnd.wave": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/mp3": "audio/mpeg",
    "audio/x-m4a": "audio/mp4",
    "audio/x-flac": "audio/flac",
    "audio/x-aiff": "audio/aiff",
  };
  return map[mime] ?? mime;
}
import {
  Loader2Icon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteAudioRecording, formatMutationError } from "./audio-mutations";
import type { AudioRecordingItem } from "@/app/_lib/indexer";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AudioCardProps {
  audio: AudioRecordingItem;
  /** Called when the user wants to edit this recording. */
  onEdit: (rkey: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AudioCard({ audio, onEdit }: AudioCardProps) {
  const t = useTranslations("upload.audio");
  const tActions = useTranslations("upload.actions");
  const format = useFormatter();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const rkey = audio.metadata?.rkey;
  const record = audio.record;
  const blob = record?.blob as { file?: Record<string, unknown> } | null | undefined;
  const meta = record?.metadata as Record<string, unknown> | null | undefined;
  const audioUrl = blob?.file?.["uri"] as string | undefined;
  const mimeType = toPlayableMimeType((blob?.file?.["mimeType"] as string) ?? undefined);
  const name = record?.name ?? t("untitled");
  const description =
    record?.description &&
    typeof record.description === "object" &&
    "text" in record.description
      ? String((record.description as Record<string, unknown>)["text"])
      : null;
  const recordedAt = (meta?.["recordedAt"] as string) ?? null;
  const sampleRate = (meta?.["sampleRate"] as number) ?? null;

  const handleEdit = () => {
    if (rkey) onEdit(rkey);
  };

  const handleDelete = async () => {
    if (!rkey) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteAudioRecording(rkey);
      setIsConfirmingDelete(false);
    } catch (error) {
      setIsConfirmingDelete(false);
      setDeleteError(formatMutationError(error));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="rounded-xl border border-border overflow-hidden bg-background hover:border-primary/30 hover:shadow-md transition-all duration-300"
    >
      {/* Audio player */}
      {audioUrl ? (
        <div className="p-3 border-b border-border">
          <audio controls className="w-full h-10" preload="metadata">
            <source src={audioUrl} type={mimeType} />
            {t("browserUnsupported")}
          </audio>
        </div>
      ) : (
        <div className="h-10 flex items-center justify-center border-b border-border text-xs text-muted-foreground">
          {t("unavailable")}
        </div>
      )}

      {/* Card body */}
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="font-medium text-base leading-snug"
            style={{ fontFamily: "var(--font-garamond-var)" }}
          >
            {name}
          </h3>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MoreVerticalIcon className="h-3.5 w-3.5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit} disabled={isDeleting}>
                <PencilIcon className="h-3.5 w-3.5 mr-2" />
                {tActions("edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setIsConfirmingDelete(true)}
                disabled={isDeleting}
              >
                <Trash2Icon className="h-3.5 w-3.5 mr-2" />
                {tActions("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {description}
          </p>
        )}

        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          {recordedAt ? (
            <span>
              {format.dateTime(new Date(recordedAt), { dateStyle: "medium" })}
            </span>
          ) : (
            <span />
          )}
          {sampleRate ? (
            <span>
              {format.number(sampleRate / 1000, { maximumFractionDigits: 1 })}
              kHz
            </span>
          ) : null}
        </div>
      </div>

      {/* Delete confirmation */}
      {isConfirmingDelete && (
        <div className="mx-3 mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive font-medium mb-1">
            {t("deleteConfirmTitle")}
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            {t("deleteConfirmDescription")}
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2Icon className="animate-spin h-3 w-3 mr-1" />
              ) : null}
              {tActions("delete")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmingDelete(false)}
              disabled={isDeleting}
            >
              {tActions("cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Delete error display */}
      {deleteError && !isConfirmingDelete && (
        <div className="mx-3 mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-xs text-destructive">{deleteError}</p>
        </div>
      )}
    </motion.div>
  );
}
