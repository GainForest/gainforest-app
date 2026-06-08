import type { AudioRecordingItem } from "@/app/_lib/indexer";
import type { AudioMetadataDraft } from "./types";

export type AudioBlobFile = {
  url: string;
  mimeType: string | undefined;
  size: number | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function textFromDescription(description: unknown): string {
  if (!description || typeof description !== "object") return "";
  const text = (description as Record<string, unknown>).text;
  return typeof text === "string" ? text : "";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function toDatetimeLocalString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" + pad(date.getMonth() + 1) +
    "-" + pad(date.getDate()) +
    "T" + pad(date.getHours()) +
    ":" + pad(date.getMinutes())
  );
}

export function datetimeLocal(value: string | null | undefined): string {
  if (!value) return toDatetimeLocalString(new Date());
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toDatetimeLocalString(new Date());
  return toDatetimeLocalString(date);
}

export function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function splitTags(value: string): string[] | undefined {
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 20);
  return tags.length > 0 ? tags : undefined;
}

function inferFormat(file: File): string {
  const extension = file.name.split(".").pop()?.toUpperCase();
  if (extension) return extension;
  if (file.type.includes("mpeg")) return "MP3";
  if (file.type.includes("wav")) return "WAV";
  if (file.type.includes("flac")) return "FLAC";
  if (file.type.includes("ogg")) return "OGG";
  return file.type || "audio";
}

function readAscii(view: DataView, start: number, length: number): string {
  let result = "";
  for (let index = start; index < start + length; index++) {
    result += String.fromCharCode(view.getUint8(index));
  }
  return result;
}

async function readWavMetadata(file: File): Promise<Partial<AudioMetadataDraft>> {
  const buffer = await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer();
  const view = new DataView(buffer);
  if (view.byteLength < 44 || readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    return {};
  }

  let offset = 12;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let bitDepth: number | undefined;
  let dataBytes: number | undefined;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (chunkId === "fmt " && chunkStart + 16 <= view.byteLength) {
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitDepth = view.getUint16(chunkStart + 14, true);
    }

    if (chunkId === "data") {
      dataBytes = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  const duration = dataBytes !== undefined && sampleRate !== undefined && channels !== undefined && bitDepth !== undefined
    ? dataBytes / (sampleRate * channels * (bitDepth / 8))
    : undefined;

  return {
    ...(channels !== undefined && { channels }),
    ...(sampleRate !== undefined && { sampleRate }),
    ...(bitDepth !== undefined && { bitDepth }),
    ...(duration !== undefined && { duration: String(Number(duration.toFixed(3))) }),
    ...(sampleRate !== undefined && { maxFrequencyHz: Math.floor(sampleRate / 2) }),
    codec: "PCM",
  };
}

async function readBrowserAudioMetadata(file: File): Promise<Partial<AudioMetadataDraft>> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        ...(Number.isFinite(audio.duration) && { duration: String(Number(audio.duration.toFixed(3))) }),
      });
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
  });
}

export async function extractAudioMetadata(file: File): Promise<AudioMetadataDraft> {
  const [browserMetadata, wavMetadata]: [Partial<AudioMetadataDraft>, Partial<AudioMetadataDraft>] = await Promise.all([
    readBrowserAudioMetadata(file),
    readWavMetadata(file).catch((): Partial<AudioMetadataDraft> => ({})),
  ]);
  const sampleRate = wavMetadata.sampleRate ?? 44100;
  return {
    codec: wavMetadata.codec ?? file.type,
    channels: wavMetadata.channels ?? 1,
    duration: wavMetadata.duration ?? browserMetadata.duration ?? "0",
    sampleRate,
    fileFormat: inferFormat(file),
    fileSizeBytes: file.size,
    maxFrequencyHz: wavMetadata.maxFrequencyHz ?? Math.floor(sampleRate / 2),
    ...(wavMetadata.bitDepth !== undefined && { bitDepth: wavMetadata.bitDepth }),
  };
}

export function cleanFilename(filename: string): string {
  const stem = filename.replace(/\.[^/.]+$/, "").replace(/[_\-.]/g, " ").trim();
  return stem.length > 0 ? stem.charAt(0).toUpperCase() + stem.slice(1) : "Untitled recording";
}

export function getAudioMeta(recording: AudioRecordingItem): Record<string, unknown> {
  const metadata = recording.record.metadata;
  return isRecord(metadata) ? metadata : {};
}

export function getAudioBlobFile(recording: AudioRecordingItem): AudioBlobFile | null {
  const blob = recording.record.blob;
  if (!isRecord(blob) || !isRecord(blob.file)) return null;
  const url = blob.file.uri;
  if (typeof url !== "string" || url.length === 0) return null;
  return {
    url,
    mimeType: typeof blob.file.mimeType === "string" ? blob.file.mimeType : undefined,
    size: typeof blob.file.size === "number" ? blob.file.size : undefined,
  };
}

export function formatBytes(value: number | undefined): string {
  if (value === undefined) return "Unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function getUriRkey(uri: string): string {
  return uri.split("/").pop() ?? uri;
}
