"use client";

import { useEffect, useRef } from "react";
import { ActivityIcon, WavesIcon } from "lucide-react";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type AudioSource =
  | { kind: "file"; file: File }
  | { kind: "url"; url: string; mimeType?: string };

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 180;
const FREQUENCY_BINS = 72;
const TIME_SLICES = 180;
const WINDOW_SIZE = 1024;

function clearCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "hsl(210 40% 14%)");
  gradient.addColorStop(0.55, "hsl(166 36% 13%)");
  gradient.addColorStop(1, "hsl(38 32% 17%)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

async function readSource(source: AudioSource): Promise<ArrayBuffer> {
  if (source.kind === "file") return source.file.arrayBuffer();
  const response = await fetch(source.url);
  if (!response.ok) throw new Error("Audio file could not be loaded");
  return response.arrayBuffer();
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  context.strokeStyle = "rgb(255 255 255 / 0.08)";
  context.lineWidth = 1;
  for (let index = 1; index < 6; index++) {
    const y = (height / 6) * index;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let index = 1; index < 8; index++) {
    const x = (width / 8) * index;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
}

function magnitudeAt(samples: Float32Array, start: number, bin: number): number {
  let real = 0;
  let imaginary = 0;
  for (let sampleIndex = 0; sampleIndex < WINDOW_SIZE; sampleIndex++) {
    const sample = samples[start + sampleIndex] ?? 0;
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * sampleIndex) / (WINDOW_SIZE - 1));
    const angle = (2 * Math.PI * bin * sampleIndex) / WINDOW_SIZE;
    real += sample * window * Math.cos(angle);
    imaginary -= sample * window * Math.sin(angle);
  }
  return Math.sqrt(real * real + imaginary * imaginary) / WINDOW_SIZE;
}

function colorForEnergy(value: number): string {
  const scaled = Math.min(1, Math.max(0, Math.log10(1 + value * 80)));
  const hue = 198 - scaled * 162;
  const lightness = 16 + scaled * 60;
  return `hsl(${hue} 82% ${lightness}%)`;
}

function drawSpectrogram(canvas: HTMLCanvasElement, samples: Float32Array) {
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return;
  clearCanvas(canvas);
  drawGrid(context, canvas.width, canvas.height);

  const usableLength = Math.max(0, samples.length - WINDOW_SIZE);
  const cellWidth = canvas.width / TIME_SLICES;
  const cellHeight = canvas.height / FREQUENCY_BINS;

  for (let column = 0; column < TIME_SLICES; column++) {
    const start = Math.floor((usableLength * column) / Math.max(1, TIME_SLICES - 1));
    for (let row = 0; row < FREQUENCY_BINS; row++) {
      const bin = row + 1;
      const energy = magnitudeAt(samples, start, bin);
      context.fillStyle = colorForEnergy(energy);
      context.fillRect(
        column * cellWidth,
        canvas.height - (row + 1) * cellHeight,
        Math.ceil(cellWidth) + 0.5,
        Math.ceil(cellHeight) + 0.5,
      );
    }
  }

  context.fillStyle = "rgb(255 255 255 / 0.72)";
  context.font = "12px sans-serif";
  context.fillText("low", 12, canvas.height - 12);
  context.fillText("high", 12, 18);
}

export function AudioSpectrogram(props: { source: AudioSource | null; title?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = props.source;
    if (!canvas || !source) return;

    let cancelled = false;
    clearCanvas(canvas);

    async function render(targetCanvas: HTMLCanvasElement, targetSource: AudioSource) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      try {
        const buffer = await readSource(targetSource);
        const decoded = await context.decodeAudioData(buffer.slice(0));
        if (cancelled) return;
        drawSpectrogram(targetCanvas, decoded.getChannelData(0));
      } catch {
        if (!cancelled) clearCanvas(targetCanvas);
      } finally {
        void context.close();
      }
    }

    void render(canvas, source);
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

  return (
    <figure className="overflow-hidden rounded-2xl border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <ActivityIcon className="size-4 text-primary" />
          {props.title ?? "Spectrogram preview"}
        </div>
        <span className="text-xs text-muted-foreground">frequency over time</span>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block h-[180px] w-full"
        aria-label="Audio spectrogram preview"
      />
      <figcaption className="border-t px-4 py-2 text-xs text-muted-foreground">
        Brighter bands indicate stronger frequencies in the selected recording.
      </figcaption>
    </figure>
  );
}
