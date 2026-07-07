/**
 * Client-side AudioMoth WAV header parsing.
 *
 * AudioMoth firmware writes a RIFF `LIST INFO` chunk into every recording
 * with an `ICMT` comment like:
 *
 *   "Recorded at 19:00:00 15/04/2024 (UTC) by AudioMoth 24F3190361DA539A
 *    at medium gain while battery was 4.1V and temperature was 23.3C.
 *    ... during deployment 0FE081F80FE081F8."
 *
 * and an `IART` artist tag ("AudioMoth 24F3190361DA539A"). The deployment ID
 * in the comment is the 16-hex-char acoustic chime ID — the same value this
 * app stores in `dwc.event.eventID`, which lets an inserted SD card be
 * matched back to its deployment automatically.
 *
 * Everything here works on a small slice of the file (headers only) except
 * `buildPreviewWav`, which reads just enough PCM to build a compact
 * downsampled preview suitable for a PDS blob.
 */

export interface WavHeaderInfo {
  /** Sample rate in Hz from the fmt chunk. */
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Byte offset of the first PCM sample (start of data chunk contents). */
  dataOffset: number;
  /** Byte length of the data chunk. */
  dataLength: number;
  /** Recording length in seconds. */
  durationSeconds: number;
  /** Raw ICMT comment, when present. */
  comment: string | null;
  /** Raw IART artist, when present. */
  artist: string | null;
}

export interface AudioMothRecordingInfo extends WavHeaderInfo {
  /** AudioMoth device ID (16 hex chars), when present. */
  deviceId: string | null;
  /** Acoustic chime deployment ID (16 hex chars, lowercase), when present. */
  deploymentId: string | null;
  /** Recording start time parsed from the comment, when present. */
  recordedAt: Date | null;
  /** e.g. "medium" | "medium-high" — gain named in the comment. */
  gain: string | null;
  /** e.g. "4.1V" */
  batteryState: string | null;
  /** e.g. "23.3C" */
  temperature: string | null;
}

const HEADER_SLICE_BYTES = 32 * 1024;

function ascii(view: DataView, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

/**
 * Walk the RIFF chunks in the header slice. Returns null when the file is
 * not a readable PCM WAV.
 */
export function parseWavHeader(buffer: ArrayBuffer): WavHeaderInfo | null {
  const view = new DataView(buffer);
  if (buffer.byteLength < 44) return null;
  if (ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WAVE") return null;

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;
  let comment: string | null = null;
  let artist: string | null = null;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = ascii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt ") {
      if (offset + 8 + 16 > buffer.byteLength) return null;
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === "LIST" && offset + 12 <= buffer.byteLength && ascii(view, offset + 8, 4) === "INFO") {
      // Walk INFO sub-chunks (ICMT comment, IART artist, …)
      let sub = offset + 12;
      const listEnd = Math.min(offset + 8 + chunkSize, buffer.byteLength);
      while (sub + 8 <= listEnd) {
        const subId = ascii(view, sub, 4);
        const subSize = view.getUint32(sub + 4, true);
        const textEnd = Math.min(sub + 8 + subSize, listEnd);
        if (subId === "ICMT") comment = ascii(view, sub + 8, textEnd - (sub + 8)).replace(/\0+$/, "");
        if (subId === "IART") artist = ascii(view, sub + 8, textEnd - (sub + 8)).replace(/\0+$/, "");
        sub += 8 + subSize + (subSize % 2); // chunks are word-aligned
      }
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break; // header chunks always precede the data chunk
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (!sampleRate || !channels || !bitsPerSample || dataOffset < 0) return null;

  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  return {
    sampleRate,
    channels,
    bitsPerSample,
    dataOffset,
    dataLength,
    durationSeconds: bytesPerSecond > 0 ? dataLength / bytesPerSecond : 0,
    comment,
    artist,
  };
}

/* ── AudioMoth comment field extraction ──────────────────────────────────── */

export function extractDeviceId(comment: string | null, artist: string | null): string | null {
  const fromArtist = artist?.match(/AudioMoth\s+([0-9A-F]{16})/i);
  if (fromArtist) return fromArtist[1]!.toUpperCase();
  const fromComment = comment?.match(/by AudioMoth\s+([0-9A-F]{16})/i);
  return fromComment ? fromComment[1]!.toUpperCase() : null;
}

export function extractDeploymentId(comment: string | null): string | null {
  const match = comment?.match(/during deployment\s+([0-9A-F]{16})/i);
  return match ? match[1]!.toLowerCase() : null;
}

/** "19:00:00 15/04/2024 (UTC)" (with optional UTC±H[:MM] offset) → Date. */
export function extractRecordedAt(comment: string | null): Date | null {
  if (!comment) return null;
  const match = comment.match(
    /Recorded at (\d{2}):(\d{2}):(\d{2}) (\d{2})\/(\d{2})\/(\d{4})(?:\s*\(UTC([+-]\d{1,2})?(?::(\d{2}))?\))?/,
  );
  if (!match) return null;
  const [, hh, mm, ss, dd, mo, yyyy, tzH, tzM] = match;
  const offsetMinutes = (Number(tzH ?? 0) || 0) * 60 + (Number(tzH ?? 0) < 0 ? -1 : 1) * (Number(tzM ?? 0) || 0);
  const utcMillis = Date.UTC(Number(yyyy), Number(mo) - 1, Number(dd), Number(hh), Number(mm), Number(ss));
  return new Date(utcMillis - offsetMinutes * 60_000);
}

export function extractGain(comment: string | null): string | null {
  const match = comment?.match(/at (low-medium|medium-low|medium-high|low|medium|high) gain/i);
  return match ? match[1]!.toLowerCase() : null;
}

export function extractBatteryState(comment: string | null): string | null {
  // Older firmware writes "battery state was 4.1V", 1.12+ writes "battery was 4.9V".
  const match = comment?.match(/battery(?: state)? was\s+([<>]?\s?\d+(?:\.\d+)?V)/i);
  return match ? match[1]!.replace(/\s+/, "") : null;
}

export function extractTemperature(comment: string | null): string | null {
  const match = comment?.match(/temperature was\s+(-?\d+(?:\.\d+)?C)/i);
  return match ? match[1]! : null;
}

/** Parse the header slice of a File into full AudioMoth recording info. */
export async function readAudioMothInfo(file: File): Promise<AudioMothRecordingInfo | null> {
  const slice = await file.slice(0, HEADER_SLICE_BYTES).arrayBuffer();
  const header = parseWavHeader(slice);
  if (!header) return null;
  return {
    ...header,
    deviceId: extractDeviceId(header.comment, header.artist),
    deploymentId: extractDeploymentId(header.comment),
    recordedAt: extractRecordedAt(header.comment),
    gain: extractGain(header.comment),
    batteryState: extractBatteryState(header.comment),
    temperature: extractTemperature(header.comment),
  };
}

/* ── Preview generation ──────────────────────────────────────────────────── */

export const PREVIEW_SAMPLE_RATE = 8000;
export const PREVIEW_MAX_SECONDS = 60;

/**
 * Extract mono 8 kHz 16-bit preview samples (first 60 s) from the original
 * recording. Downsampling uses a boxcar average per output sample — a cheap
 * low-pass that is plenty for an audible preview and a spectrogram. Only the
 * bytes needed are read from the file. Returns null for non-16-bit files.
 */
export async function extractPreviewSamples(file: File, info: WavHeaderInfo): Promise<Int16Array | null> {
  if (info.bitsPerSample !== 16 || info.channels < 1) return null;
  const bytesPerFrame = info.channels * 2;
  const sourceFrames = Math.min(
    Math.floor(info.dataLength / bytesPerFrame),
    info.sampleRate * PREVIEW_MAX_SECONDS,
  );
  if (sourceFrames <= 0) return null;

  const byteLength = sourceFrames * bytesPerFrame;
  const pcmBuffer = await file.slice(info.dataOffset, info.dataOffset + byteLength).arrayBuffer();
  const source = new Int16Array(pcmBuffer, 0, Math.floor(pcmBuffer.byteLength / 2));

  const ratio = info.sampleRate / PREVIEW_SAMPLE_RATE;
  const outFrames = Math.max(1, Math.floor(sourceFrames / ratio));
  const out = new Int16Array(outFrames);

  for (let i = 0; i < outFrames; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(sourceFrames, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let f = start; f < end; f += 1) {
      // Average channels down to mono on the fly.
      let frame = 0;
      for (let c = 0; c < info.channels; c += 1) frame += source[f * info.channels + c] ?? 0;
      sum += frame / info.channels;
    }
    out[i] = Math.max(-32768, Math.min(32767, Math.round(sum / (end - start))));
  }

  return out;
}

/** Build a compact preview WAV (see `extractPreviewSamples`). */
export async function buildPreviewWav(file: File, info: WavHeaderInfo): Promise<Uint8Array | null> {
  const samples = await extractPreviewSamples(file, info);
  return samples ? encodeWav(samples, PREVIEW_SAMPLE_RATE) : null;
}

/** Minimal mono 16-bit PCM WAV encoder. */
export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  new Int16Array(buffer, 44).set(samples);
  return new Uint8Array(buffer);
}
