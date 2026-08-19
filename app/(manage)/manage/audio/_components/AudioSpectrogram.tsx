"use client";

import { useEffect, useState } from "react";
import { ActivityIcon, WavesIcon } from "lucide-react";
import { computeSpectrogram, type SpectrogramData } from "@/app/_lib/audiomoth/spectrogram";
import { Spectrogram, type SpectrogramSource } from "@/app/_components/Spectrogram";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type AudioSource =
  | { kind: "file"; file: File }
  | { kind: "url"; url: string; mimeType?: string };

/** FFT settings for the upload preview — matches the stored spectrogram look. */
const FFT_SIZE = 1_024;
const MAX_COLUMNS = 800;

async function readSource(source: AudioSource): Promise<ArrayBuffer> {
  if (source.kind === "file") return source.file.arrayBuffer();
  const response = await fetch(source.url);
  if (!response.ok) throw new Error("Audio file could not be loaded");
  return response.arrayBuffer();
}

/** Decode a file/URL and compute its spectrogram magnitudes off the main path. */
async function computeFromSource(source: AudioSource): Promise<SpectrogramData | null> {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  try {
    const buffer = await readSource(source);
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    const samples = new Int16Array(channel.length);
    for (let index = 0; index < channel.length; index += 1) {
      samples[index] = Math.round(Math.max(-1, Math.min(1, channel[index]!)) * 32_767);
    }
    const hopSize = Math.max(256, Math.ceil(Math.max(1, samples.length - FFT_SIZE) / MAX_COLUMNS));
    const data = computeSpectrogram(samples, { fftSize: FFT_SIZE, hopSize });
    return data.columns < 2 ? null : data;
  } finally {
    void context.close();
  }
}

export function AudioSpectrogram(props: { source: AudioSource | null; title?: string }) {
  const [data, setData] = useState<SpectrogramData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const source = props.source;
    if (!source) {
      setData(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setData(null);
    setFailed(false);
    computeFromSource(source)
      .then((next) => {
        if (cancelled) return;
        if (next) setData(next);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [props.source]);

  if (!props.source) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <WavesIcon className="size-4" /> Spectrogram preview
        </div>
        <p className="mt-2">Choose an audio file to preview its frequency pattern before saving.</p>
      </div>
    );
  }

  const source: SpectrogramSource = failed
    ? { kind: "failed" }
    : data
      ? { kind: "data", data }
      : { kind: "pending" };

  return (
    <figure className="overflow-hidden rounded-2xl border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <ActivityIcon className="size-4 text-primary" />
          {props.title ?? "Spectrogram preview"}
        </div>
        <span className="text-xs text-muted-foreground">frequency over time</span>
      </div>
      <Spectrogram
        source={source}
        className="h-[180px] w-full bg-[#06040b]"
        ariaLabel="Audio spectrogram preview"
        failedLabel="This audio could not be turned into a spectrogram."
      />
      <figcaption className="border-t px-4 py-2 text-xs text-muted-foreground">
        Brighter bands indicate stronger frequencies in the selected recording.
      </figcaption>
    </figure>
  );
}
