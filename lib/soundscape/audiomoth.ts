/**
 * AudioMoth import helpers: parse recording timestamps from AudioMoth file
 * names and read samples out of the uncompressed WAV files the devices write.
 *
 * Everything in this module is pure and browser/node agnostic so it can be
 * unit tested without a DOM.
 */

/**
 * A "wall clock" moment as written on the recorder — deliberately not a JS
 * `Date` so we never re-interpret the device's clock through the viewer's
 * timezone. AudioMoth names files with the device clock (usually UTC).
 */
export type WallClockTime = {
  year: number;
  /** 1-based month */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** e.g. "2024-04-04" — used to group recordings by day. */
export function wallClockDateKey(time: WallClockTime): string {
  const mm = String(time.month).padStart(2, "0");
  const dd = String(time.day).padStart(2, "0");
  return `${time.year}-${mm}-${dd}`;
}

/** Minutes since local midnight (0..1439). */
export function wallClockMinuteOfDay(time: WallClockTime): number {
  return time.hour * 60 + time.minute;
}

/** e.g. "15:30" */
export function formatMinuteOfDay(minuteOfDay: number): string {
  const clamped = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Modern AudioMoth firmware names files `YYYYMMDD_HHMMSS.WAV` (optionally with
 * a trailing marker such as `T` for triggered recordings). Early firmware used
 * eight hex digits encoding a Unix timestamp, e.g. `5E92B380.WAV`.
 */
export function parseAudioMothTimestamp(fileName: string): WallClockTime | null {
  const base = fileName.replace(/\.[^.]+$/, "");

  const standard = base.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})[A-Za-z]?$/);
  if (standard) {
    const [, year, month, day, hour, minute, second] = standard;
    const time: WallClockTime = {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second),
    };
    return isPlausibleWallClock(time) ? time : null;
  }

  const legacyHex = base.match(/^([0-9A-Fa-f]{8})$/);
  if (legacyHex) {
    const epochSeconds = Number.parseInt(legacyHex[1], 16);
    return wallClockFromEpochMillis(epochSeconds * 1000, "utc");
  }

  return null;
}

/**
 * Fallback for files without a parsable name: derive a wall-clock time from an
 * epoch timestamp (e.g. `File.lastModified`, interpreted in the viewer's
 * local timezone, or UTC for legacy hex names).
 */
export function wallClockFromEpochMillis(epochMillis: number, zone: "utc" | "local"): WallClockTime | null {
  if (!Number.isFinite(epochMillis)) return null;
  const date = new Date(epochMillis);
  if (Number.isNaN(date.getTime())) return null;
  const time: WallClockTime =
    zone === "utc"
      ? {
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1,
          day: date.getUTCDate(),
          hour: date.getUTCHours(),
          minute: date.getUTCMinutes(),
          second: date.getUTCSeconds(),
        }
      : {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          hour: date.getHours(),
          minute: date.getMinutes(),
          second: date.getSeconds(),
        };
  return isPlausibleWallClock(time) ? time : null;
}

function isPlausibleWallClock(time: WallClockTime): boolean {
  return (
    time.year >= 2000 &&
    time.year <= 2100 &&
    time.month >= 1 &&
    time.month <= 12 &&
    time.day >= 1 &&
    time.day <= 31 &&
    time.hour >= 0 &&
    time.hour <= 23 &&
    time.minute >= 0 &&
    time.minute <= 59 &&
    time.second >= 0 &&
    time.second <= 60
  );
}

// ---------------------------------------------------------------------------
// WAV reading
// ---------------------------------------------------------------------------

export type WavRecording = {
  sampleRate: number;
  channels: number;
  /** Samples per channel. */
  totalSamples: number;
  durationSeconds: number;
  /**
   * Copies `out.length` mono samples (channel 0, normalized to [-1, 1])
   * starting at `startSample` into `out`. Out-of-range samples are zero.
   */
  readWindow: (startSample: number, out: Float32Array) => void;
};

export class WavDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WavDecodeError";
  }
}

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_IEEE_FLOAT = 3;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

function fourCc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Opens an uncompressed RIFF/WAVE buffer (what AudioMoth writes: 16-bit PCM
 * mono, though other PCM widths and float formats are supported too) without
 * materializing the whole file as Float32 — windows are decoded on demand.
 */
export function openWav(buffer: ArrayBuffer): WavRecording {
  const view = new DataView(buffer);
  if (buffer.byteLength < 44 || fourCc(view, 0) !== "RIFF" || fourCc(view, 8) !== "WAVE") {
    throw new WavDecodeError("Not a RIFF/WAVE file");
  }

  let formatCode = 0;
  let channels = 0;
  let sampleRate = 0;
  let blockAlign = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;

  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const chunkId = fourCc(view, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (chunkId === "fmt " && chunkStart + 16 <= buffer.byteLength) {
      formatCode = view.getUint16(chunkStart, true);
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      blockAlign = view.getUint16(chunkStart + 12, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
      if (formatCode === WAVE_FORMAT_EXTENSIBLE && chunkStart + 26 <= buffer.byteLength && chunkSize >= 40) {
        // First two bytes of the sub-format GUID hold the real format code.
        formatCode = view.getUint16(chunkStart + 24, true);
      }
    } else if (chunkId === "data") {
      dataOffset = chunkStart;
      dataLength = Math.min(chunkSize, buffer.byteLength - chunkStart);
    }

    // Chunks are word-aligned; sizes can be odd on disk.
    offset = chunkStart + chunkSize + (chunkSize % 2);
    if (chunkSize === 0) break;
  }

  if (dataOffset < 0) throw new WavDecodeError("Missing data chunk");
  if (channels < 1 || sampleRate <= 0) throw new WavDecodeError("Malformed fmt chunk");
  if (formatCode !== WAVE_FORMAT_PCM && formatCode !== WAVE_FORMAT_IEEE_FLOAT) {
    throw new WavDecodeError(`Unsupported WAV format code ${formatCode}`);
  }

  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample < 1 || bytesPerSample > 8) {
    throw new WavDecodeError(`Unsupported bit depth ${bitsPerSample}`);
  }
  const stride = blockAlign > 0 ? blockAlign : bytesPerSample * channels;
  const totalSamples = Math.floor(dataLength / stride);
  if (totalSamples <= 0) throw new WavDecodeError("Empty data chunk");

  const decodeSample = makeSampleDecoder(view, formatCode, bitsPerSample);

  return {
    sampleRate,
    channels,
    totalSamples,
    durationSeconds: totalSamples / sampleRate,
    readWindow: (startSample, out) => {
      for (let index = 0; index < out.length; index++) {
        const sampleIndex = startSample + index;
        if (sampleIndex < 0 || sampleIndex >= totalSamples) {
          out[index] = 0;
          continue;
        }
        out[index] = decodeSample(dataOffset + sampleIndex * stride);
      }
    },
  };
}

function makeSampleDecoder(
  view: DataView,
  formatCode: number,
  bitsPerSample: number,
): (byteOffset: number) => number {
  if (formatCode === WAVE_FORMAT_IEEE_FLOAT) {
    if (bitsPerSample === 32) return (at) => view.getFloat32(at, true);
    if (bitsPerSample === 64) return (at) => view.getFloat64(at, true);
    throw new WavDecodeError(`Unsupported float bit depth ${bitsPerSample}`);
  }
  switch (bitsPerSample) {
    case 8:
      return (at) => (view.getUint8(at) - 128) / 128;
    case 16:
      return (at) => view.getInt16(at, true) / 32768;
    case 24:
      return (at) => {
        const raw = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16);
        const signed = raw > 0x7fffff ? raw - 0x1000000 : raw;
        return signed / 8388608;
      };
    case 32:
      return (at) => view.getInt32(at, true) / 2147483648;
    default:
      throw new WavDecodeError(`Unsupported PCM bit depth ${bitsPerSample}`);
  }
}
