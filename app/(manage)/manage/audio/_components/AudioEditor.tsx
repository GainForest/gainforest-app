"use client";

import { useState, useEffect } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createRecord, putRecord, uploadBlob } from "../../_lib/mutations";
import type { ManagedAudio } from "@/app/_lib/indexer";

const AUTO_CLOSE_MS = 2500;
const ACCEPTED_AUDIO = ".mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.webm,.aiff";

async function extractDuration(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Audio(url);
    el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(el.duration) ? String(el.duration) : "0"); };
    el.onerror = () => { URL.revokeObjectURL(url); resolve("0"); };
  });
}

function cleanFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem.replace(/[_\-.]+/g, " ").trim().replace(/^./, (c) => c.toUpperCase()) || "Untitled";
}

interface AudioEditorProps {
  mode: "add" | "edit";
  initialData: ManagedAudio | null;
  onClose: () => void;
  onSaved: (audio: ManagedAudio) => void;
}

export function AudioEditor({ mode, initialData, onClose, onSaved }: AudioEditorProps) {
  const [name, setName] = useState(initialData?.record.name ?? "");
  const [description, setDescription] = useState(initialData?.record.description ?? "");
  const [recordedAt, setRecordedAt] = useState(() => {
    const r = initialData?.record.recordedAt;
    return r ? new Date(r).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16);
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [countdown, setCountdown] = useState(false);

  const isValid = name.trim().length > 0 && (mode === "edit" || audioFile !== null);

  useEffect(() => {
    if (!isCompleted) return;
    requestAnimationFrame(() => setCountdown(true));
    const t = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [isCompleted, onClose]);

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsPending(true);
    setError(null);

    try {
      let blobRef: unknown = initialData ? (initialData.record as Record<string, unknown>)["blob"] : undefined;
      let mimeType = initialData?.record.mimeType ?? null;

      if (audioFile) {
        const duration = await extractDuration(audioFile);
        const uploaded = await uploadBlob(audioFile);
        mimeType = audioFile.type;
        blobRef = {
          $type: "app.gainforest.common.defs#audio",
          file: { $type: "blob", ...uploaded, mimeType: audioFile.type },
        };
        void duration;
      }

      const record: Record<string, unknown> = {
        $type: "app.gainforest.ac.audio",
        name: name.trim(),
        ...(description.trim() ? {
          description: { $type: "app.gainforest.common.defs#richtext", text: description.trim() },
        } : {}),
        ...(blobRef ? { blob: blobRef } : {}),
        metadata: {
          $type: "app.gainforest.ac.audio#metadata",
          recordedAt: new Date(recordedAt).toISOString(),
          codec: mimeType ?? "audio/mpeg",
          channels: 1,
          duration: audioFile ? await extractDuration(audioFile) : "0",
          sampleRate: 44100,
        },
        createdAt: initialData?.metadata.createdAt ?? new Date().toISOString(),
      };

      let uri: string;
      let cid: string;
      if (mode === "add") {
        const res = await createRecord("app.gainforest.ac.audio", record);
        uri = res.uri;
        cid = res.cid;
      } else {
        const res = await putRecord("app.gainforest.ac.audio", initialData!.metadata.rkey, record);
        uri = res.uri;
        cid = res.cid;
      }

      const rkey = uri.split("/").pop() ?? initialData?.metadata.rkey ?? "unknown";
      const saved: ManagedAudio = {
        metadata: {
          did: initialData?.metadata.did ?? "",
          uri,
          rkey,
          cid,
          createdAt: initialData?.metadata.createdAt ?? new Date().toISOString(),
        },
        record: {
          name: name.trim(),
          description: description.trim() || null,
          audioUrl: audioFile ? URL.createObjectURL(audioFile) : (initialData?.record.audioUrl ?? null),
          mimeType,
          recordedAt: new Date(recordedAt).toISOString(),
          sampleRate: 44100,
          duration: null,
        },
      };
      onSaved(saved);
      setIsCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recording.");
    } finally {
      setIsPending(false);
    }
  };

  if (isCompleted) {
    return (
      <div className="flex flex-col items-center justify-center h-36 text-center gap-3">
        <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
          <CheckIcon className="size-6 text-primary-foreground" />
        </div>
        <span className="text-base font-medium">
          {mode === "add" ? "Recording added" : "Recording updated"}
        </span>
        <div className="w-full max-w-xs h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{
              width: countdown ? "0%" : "100%",
              transition: countdown ? `width ${AUTO_CLOSE_MS}ms linear` : "none",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h3 className="font-semibold text-lg">
        {mode === "add" ? "Add recording" : `Edit: ${initialData?.record.name ?? "recording"}`}
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: file input */}
        <div className="space-y-1.5">
          <Label htmlFor="audio-file">
            Audio file{mode === "add" && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <label
            htmlFor="audio-file"
            className={`flex flex-col items-center justify-center min-h-[120px] rounded-xl border-2 border-dashed transition-colors cursor-pointer text-sm text-muted-foreground gap-2 px-4 py-6
              ${audioFile ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
          >
            {audioFile ? (
              <>
                <CheckIcon className="h-5 w-5 text-primary" />
                <span className="text-foreground font-medium truncate max-w-full">{audioFile.name}</span>
                <span className="text-xs">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</span>
              </>
            ) : (
              <>
                <span className="font-medium">Click or drag to select</span>
                <span className="text-xs">MP3, WAV, OGG, FLAC, M4A — max 100 MB</span>
              </>
            )}
            <input
              id="audio-file"
              type="file"
              accept={ACCEPTED_AUDIO}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setAudioFile(file);
                if (file && !name.trim()) setName(cleanFilename(file.name));
                setError(null);
              }}
            />
          </label>
        </div>

        {/* Right: fields */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="audio-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="audio-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="e.g. Dawn chorus survey"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audio-desc">Description (optional)</Label>
            <Textarea
              id="audio-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes about this recording…"
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audio-recorded-at">Recorded at</Label>
            <Input
              id="audio-recorded-at"
              type="datetime-local"
              value={recordedAt}
              onChange={(e) => setRecordedAt(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button onClick={() => void handleSubmit()} disabled={!isValid || isPending}>
          {isPending && <Loader2Icon className="animate-spin h-3.5 w-3.5" />}
          {mode === "add" ? (isPending ? "Adding…" : "Add") : (isPending ? "Saving…" : "Save")}
        </Button>
      </div>
    </div>
  );
}
