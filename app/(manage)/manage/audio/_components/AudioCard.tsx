"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2Icon, MoreVerticalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteRecord } from "../../_lib/mutations";
import type { ManagedAudio } from "@/app/_lib/indexer";

/** Map PDS-normalised MIME types to browser-playable equivalents. */
function toPlayable(mime: string | null | undefined): string | undefined {
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

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });
  } catch {
    return null;
  }
}

interface AudioCardProps {
  audio: ManagedAudio;
  onEdit: (rkey: string) => void;
  onDeleted: (rkey: string) => void;
}

export function AudioCard({ audio, onEdit, onDeleted }: AudioCardProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rkey = audio.metadata.rkey;
  const playableMime = toPlayable(audio.record.mimeType);
  const dateLabel = formatDate(audio.record.recordedAt);
  const sampleKhz = audio.record.sampleRate ? (audio.record.sampleRate / 1000).toFixed(1) : null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteRecord("app.gainforest.ac.audio", rkey);
      onDeleted(rkey);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete recording.");
      setIsDeleting(false);
      setIsConfirming(false);
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
      {audio.record.audioUrl ? (
        <div className="p-3 border-b border-border">
          <audio controls className="w-full h-10" preload="metadata">
            <source src={audio.record.audioUrl} type={playableMime} />
            Your browser does not support audio playback.
          </audio>
        </div>
      ) : (
        <div className="h-10 flex items-center justify-center border-b border-border text-xs text-muted-foreground">
          Audio unavailable
        </div>
      )}

      {/* Body */}
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-base leading-snug">
            {audio.record.name ?? <span className="text-muted-foreground">Untitled</span>}
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
              <DropdownMenuItem onClick={() => onEdit(rkey)} disabled={isDeleting}>
                <PencilIcon className="h-3.5 w-3.5 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setIsConfirming(true)}
                disabled={isDeleting}
              >
                <Trash2Icon className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {audio.record.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {audio.record.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>{dateLabel ?? ""}</span>
          {sampleKhz && <span>{sampleKhz} kHz</span>}
        </div>
      </div>

      {/* Delete confirmation */}
      {isConfirming && (
        <div className="mx-3 mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive font-medium mb-1">Delete recording?</p>
          <p className="text-xs text-muted-foreground mb-3">
            This permanently deletes the audio file and cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2Icon className="animate-spin h-3 w-3 mr-1" />}
              Delete
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirming(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {deleteError && !isConfirming && (
        <div className="mx-3 mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-xs text-destructive">{deleteError}</p>
        </div>
      )}
    </motion.div>
  );
}
