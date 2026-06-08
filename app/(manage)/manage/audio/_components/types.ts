import type { AudioRecordingItem } from "@/app/_lib/indexer";
import type { AudioDeploymentItem } from "@/app/_lib/indexer";
import type { AudioEventItem } from "@/app/_lib/indexer";

export const SECTIONS = ["events", "deployments", "recordings"] as const;
export const MODES = ["list", "detail", "new"] as const;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const TELEGRAM_BOT_URL = "https://t.me/TheTainaBot";
export const AUDIO_MIME_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/aiff",
  "audio/x-aiff",
];

export type Section = (typeof SECTIONS)[number];

export type AudioMetadataDraft = {
  codec: string;
  channels: number;
  duration: string;
  sampleRate: number;
  bitDepth?: number;
  fileFormat?: string;
  fileSizeBytes: number;
  maxFrequencyHz?: number;
};

export type OperationStep = "event" | "deployment" | "audio" | "occurrence" | "complete";

export type AudioWorkspaceData = {
  events: AudioEventItem[];
  deployments: AudioDeploymentItem[];
  recordings: AudioRecordingItem[];
};
