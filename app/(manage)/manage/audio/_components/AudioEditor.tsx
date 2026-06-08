"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { useTranslations } from "./audio-copy";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import FileInput from "@/components/ui/FileInput";
import { createAudioRecording, formatMutationError, updateAudioRecording } from "./audio-mutations";
import type { AudioMetadataDraft } from "./types";
import type { AudioRecordingItem } from "@/app/_lib/indexer";

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTO_CLOSE_MS = 3000;

const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/webm",
  "audio/flac",
  "audio/aac",
  "audio/x-m4a",
  "audio/aiff",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract duration from an audio file using the Web Audio API.
 * Returns a fallback "0" if extraction fails.
 */
async function extractAudioDuration(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(audio.duration) ? String(audio.duration) : "0");
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("0");
    };
  });
}

/** Clean a filename stem into a human-friendly name. */
function cleanFilename(filename: string, fallbackName: string): string {
  const lastDot = filename.lastIndexOf(".");
  let stem = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  stem = stem.replace(/[_\-.]/g, " ").trim();
  if (!stem) return fallbackName;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AudioEditorProps {
  mode: "add" | "edit";
  initialData: AudioRecordingItem | null;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AudioEditor({ mode, initialData, onClose }: AudioEditorProps) {
  const t = useTranslations("upload.audio");
  const tActions = useTranslations("upload.actions");

  const rkey = initialData?.metadata?.rkey;
  const initRecord = initialData?.record;

  const [name, setName] = useState(initRecord?.name ?? "");
  const [description, setDescription] = useState(() => {
    const desc = initRecord?.description;
    if (!desc || typeof desc !== "object") return "";
    return String((desc as Record<string, unknown>)["text"] ?? "");
  });
  const initMeta = initRecord?.metadata as Record<string, unknown> | null | undefined;
  const [recordedAt, setRecordedAt] = useState(() => {
    const recorded = initMeta?.["recordedAt"] as string | undefined;
    if (recorded) {
      return new Date(recorded).toISOString().slice(0, 16);
    }
    return new Date().toISOString().slice(0, 16);
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [countdownStarted, setCountdownStarted] = useState(false);

  const isNameValid = name.trim().length > 0;
  const disableSubmission =
    !isNameValid || (mode === "add" && audioFile === null);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const [isPending, setIsPending] = useState(false);

  // Auto-close after success
  useEffect(() => {
    if (!isCompleted) return;
    requestAnimationFrame(() => setCountdownStarted(true));
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [isCompleted, onClose]);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setError(null);
    setIsPending(true);

    try {
      if (mode === "add") {
        if (!audioFile) return;

        const duration = await extractAudioDuration(audioFile);
        await createAudioRecording({
          name: name.trim(),
          description: description.trim()
            ? { text: description.trim() }
            : undefined,
          audioFile,
          metadata: {
            codec: audioFile.type,
            channels: 1,
            duration,
            sampleRate: 44100,
            fileSizeBytes: audioFile.size,
            recordedAt: new Date(recordedAt).toISOString(),
          },
        });
      } else {
        if (!rkey || !initialData) return;

        let newAudioFile: File | undefined;
        let newTechnicalMetadata: AudioMetadataDraft | undefined;

        if (audioFile) {
          const duration = await extractAudioDuration(audioFile);
          newAudioFile = audioFile;
          newTechnicalMetadata = {
            codec: audioFile.type,
            channels: 1,
            duration,
            sampleRate: 44100,
            fileSizeBytes: audioFile.size,
          };
        }

        await updateAudioRecording({
          recording: initialData,
          data: {
            name: name.trim(),
            description: description.trim()
              ? { text: description.trim() }
              : undefined,
            metadata: {
              recordedAt: new Date(recordedAt).toISOString(),
            },
          },
          ...(newAudioFile ? { newAudioFile, newTechnicalMetadata } : {}),
        });
      }
      setIsCompleted(true);
    } catch (error) {
      setError(formatMutationError(error));
    } finally {
      setIsPending(false);
    }
  };

  // ── Success state ───────────────────────────────────────────────────────────

  if (isCompleted) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center mt-4">
        <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
          <CheckIcon className="size-6 text-white" />
        </div>
        <span className="text-lg font-medium mt-2">
          {mode === "add" ? t("uploadSuccess") : t("updateSuccess")}
        </span>
        <div className="w-full max-w-xs h-1 bg-muted rounded-full overflow-hidden mt-4">
          <div
            className="h-full bg-primary rounded-full"
            style={{
              width: countdownStarted ? "0%" : "100%",
              transition: countdownStarted
                ? `width ${AUTO_CLOSE_MS}ms linear`
                : "none",
            }}
          />
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  return (
    <div className="mt-4">
      <h3 className="font-medium text-lg mb-4">
        {mode === "edit"
          ? t("editTitle", { name: initRecord?.name ?? t("untitledShort") })
          : t("addTitle")}
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: File input */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-muted-foreground">
            {mode === "edit" ? t("replaceFile") : t("audioFile")}
            {mode === "add" && (
              <span className="text-destructive ml-0.5">*</span>
            )}
          </label>
          <FileInput
            placeholder={t("dropPlaceholder")}
            value={audioFile ?? undefined}
            supportedFileTypes={AUDIO_MIME_TYPES}
            maxSizeInMB={100}
            onFileChange={(file) => {
              setAudioFile(file ?? null);
              if (file && mode === "add" && !name.trim()) {
                setName(cleanFilename(file.name, t("untitledShort")));
              }
            }}
            className="min-h-[120px]"
          />
          <span className="text-xs text-muted-foreground">
            {t("fileRequirements")}
          </span>
        </div>

        {/* Right: Fields */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">
              {t("name")} <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">
              {t("descriptionOptional")}
            </label>
            <Textarea
              placeholder={t("descriptionPlaceholder")}
              value={description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">
              {t("recordedAt")}
            </label>
            <Input
              type="datetime-local"
              value={recordedAt}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setRecordedAt(e.target.value)
              }
            />
          </div>


        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive mt-4">{error}</p>
      )}

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          {tActions("cancel")}
        </Button>
        <Button
          onClick={() => void handleSubmit()}
          disabled={disableSubmission || isPending}
        >
          {isPending ? (
            <Loader2Icon className="animate-spin mr-2" />
          ) : null}
          {mode === "edit"
            ? isPending
              ? tActions("saving")
              : tActions("save")
            : isPending
              ? tActions("uploading")
              : tActions("upload")}
        </Button>
      </div>
    </div>
  );
}


