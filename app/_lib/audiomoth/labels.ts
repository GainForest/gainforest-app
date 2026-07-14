export const AUDIO_LABEL_CATEGORIES = ["bird", "frog", "insect", "other", "note"] as const;

export type AudioLabelCategory = (typeof AUDIO_LABEL_CATEGORIES)[number];

export type NormalizedSpectrogramBox = {
  /** 0–1, left to right. */
  startX: number;
  /** 0–1, left to right. */
  endX: number;
  /** 0–1, top to bottom. */
  topY: number;
  /** 0–1, top to bottom. */
  bottomY: number;
};

export type AudioLabel = {
  id: string;
  fileKey: string;
  fileName: string;
  category: AudioLabelCategory;
  species: string;
  note: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  minFrequencyHz: number;
  maxFrequencyHz: number;
  box: NormalizedSpectrogramBox;
  createdAt: string;
};

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function normalizeSpectrogramBox(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): NormalizedSpectrogramBox {
  return {
    startX: clampUnit(Math.min(startX, endX)),
    endX: clampUnit(Math.max(startX, endX)),
    topY: clampUnit(Math.min(startY, endY)),
    bottomY: clampUnit(Math.max(startY, endY)),
  };
}

export function spectrogramBoxToBounds(
  box: NormalizedSpectrogramBox,
  durationSeconds: number,
  maxFrequencyHz: number,
): Pick<AudioLabel, "startTimeSeconds" | "endTimeSeconds" | "minFrequencyHz" | "maxFrequencyHz"> {
  const duration = Math.max(0, durationSeconds);
  const maxFrequency = Math.max(0, maxFrequencyHz);
  return {
    startTimeSeconds: box.startX * duration,
    endTimeSeconds: box.endX * duration,
    minFrequencyHz: Math.round((1 - box.bottomY) * maxFrequency),
    maxFrequencyHz: Math.round((1 - box.topY) * maxFrequency),
  };
}

export function audioFileKey(file: Pick<File, "name" | "size" | "lastModified">): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function audioLabelsToCsv(labels: AudioLabel[]): string {
  const header = [
    "file",
    "category",
    "species",
    "note",
    "start_time_seconds",
    "end_time_seconds",
    "min_frequency_hz",
    "max_frequency_hz",
  ];
  const rows = labels.map((label) => [
    label.fileName,
    label.category,
    label.species,
    label.note,
    label.startTimeSeconds.toFixed(3),
    label.endTimeSeconds.toFixed(3),
    label.minFrequencyHz,
    label.maxFrequencyHz,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
