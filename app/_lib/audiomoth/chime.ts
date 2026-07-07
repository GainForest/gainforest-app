/**
 * AudioMoth acoustic-configuration chime, in the browser.
 *
 * A TypeScript port of the GainForest Android app's Kotlin port of the
 * OpenAcousticDevices reference: the current time, a location, and an 8-byte
 * deployment ID are packed bit by bit, protected with CRC-16 (CCITT) and
 * Hamming(7,4) forward error correction, then synthesized as an 18 kHz
 * phase-flipping carrier with an audible melody mixed on top. Played from
 * the phone/laptop speaker against the AudioMoth's microphone, a device
 * running an acoustic-configuration firmware decodes it to set its clock,
 * location and deployment ID.
 */

const SAMPLE_RATE = 48_000;
const CARRIER_FREQUENCY = 18_000;

const BITS_PER_BYTE = 8;
const BITS_IN_INT16 = 16;
const BITS_IN_INT32 = 32;
const BITS_IN_LAT_LNG = 28;

const LATITUDE_PRECISION = 1_000_000;
const LONGITUDE_PRECISION = 500_000;

const LENGTH_OF_TIME = 6;
const LENGTH_OF_LOCATION = 7;
export const LENGTH_OF_DEPLOYMENT_ID = 8;

const NUMBER_OF_START_BITS = 16;
const NUMBER_OF_STOP_BITS = 8;

const CRC_POLY = 0x1021;

/** Hamming(7,4) codebook: nibble value → 7 code bits (reference order). */
const HAMMING_CODE: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 0, 0, 0, 0],
  [1, 0, 0, 1, 1, 0, 0], [0, 1, 1, 1, 1, 0, 0],
  [0, 1, 0, 1, 0, 1, 0], [1, 0, 1, 1, 0, 1, 0],
  [1, 1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1, 0],
  [1, 1, 0, 1, 0, 0, 1], [0, 0, 1, 1, 0, 0, 1],
  [0, 1, 0, 0, 1, 0, 1], [1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 1, 1], [0, 1, 1, 0, 0, 1, 1],
  [0, 0, 0, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1],
];

const HEX_ID = /^[0-9a-f]{16}$/;

export function isValidDeploymentId(hex: string): boolean {
  return HEX_ID.test(hex.trim().toLowerCase());
}

/** A fresh random 8-byte deployment ID as 16 lowercase hex characters. */
export function randomDeploymentIdHex(): string {
  const bytes = new Uint8Array(LENGTH_OF_DEPLOYMENT_ID);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Banker's rounding, matching the Python reference's `round()`. */
function roundHalfToEven(value: number): number {
  const base = Math.floor(value);
  const diff = value - base;
  if (diff < 0.5) return base;
  if (diff > 0.5) return base + 1;
  return base % 2 === 0 ? base : base + 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** LSB-first bit packer over a fixed byte buffer. */
class BitPacker {
  readonly bytes: number[];
  private index = 0;

  constructor(size: number) {
    this.bytes = new Array<number>(size).fill(0);
  }

  private setBit(value: boolean): void {
    if (value) {
      const byteIndex = Math.floor(this.index / BITS_PER_BYTE);
      this.bytes[byteIndex] |= 1 << (this.index % BITS_PER_BYTE);
    }
    this.index += 1;
  }

  private setBits(value: number, length: number): void {
    for (let i = 0; i < length; i += 1) this.setBit(((value >> i) & 1) !== 0);
  }

  encodeTime(timestampUnix: number, timezoneMinutes = 0): void {
    this.setBits(timestampUnix | 0, BITS_IN_INT32);
    this.setBits(timezoneMinutes & 0xffff, BITS_IN_INT16);
  }

  encodeLocation(latitude: number, longitude: number): void {
    const intLat = roundHalfToEven(clamp(latitude, -90, 90) * LATITUDE_PRECISION);
    const intLng = roundHalfToEven(clamp(longitude, -180, 180) * LONGITUDE_PRECISION);
    const mask = (1 << BITS_IN_LAT_LNG) - 1;
    this.setBits(intLat & mask, BITS_IN_LAT_LNG);
    this.setBits(intLng & mask, BITS_IN_LAT_LNG);
  }

  encodeDeploymentId(deploymentBytes: number[]): void {
    for (let i = 0; i < LENGTH_OF_DEPLOYMENT_ID; i += 1) {
      this.bytes[Math.floor(this.index / BITS_PER_BYTE)] =
        deploymentBytes[LENGTH_OF_DEPLOYMENT_ID - 1 - i]! & 0xff;
      this.index += BITS_PER_BYTE;
    }
  }
}

function updateCrc16(crc: number, incr: boolean): number {
  const xor = (crc >> 15) & 1;
  let out = (crc << 1) & 0xffff;
  if (incr) out += 1;
  if (xor > 0) out ^= CRC_POLY;
  return out;
}

/** CRC-16/CCITT over the data bytes, returned as [low byte, high byte]. */
function createCrc16(dataBytes: number[]): number[] {
  let crc = 0;
  for (const byte of dataBytes) {
    for (let bit = 7; bit >= 0; bit -= 1) crc = updateCrc16(crc, (byte & (1 << bit)) !== 0);
  }
  for (let i = 0; i < 16; i += 1) crc = updateCrc16(crc, false);
  return [crc & 0xff, (crc >> 8) & 0xff];
}

/** Hamming(7,4)-encode each byte (low nibble interleaved with high). */
function hammingEncode(dataBytes: number[]): number[] {
  const bits = new Array<number>(dataBytes.length * 14);
  let out = 0;
  for (const byte of dataBytes) {
    const low = HAMMING_CODE[byte & 0x0f]!;
    const high = HAMMING_CODE[(byte & 0xf0) >> 4]!;
    for (let i = 0; i < 7; i += 1) {
      bits[out++] = low[i]!;
      bits[out++] = high[i]!;
    }
  }
  return bits;
}

/* ------------------------------------------------------------------ */
/* Waveform synthesis                                                  */
/* ------------------------------------------------------------------ */

const BIT_RISE = 0.0005;
const BIT_FALL = 0.0005;
const LOW_BIT_SUSTAIN = 0.004;
const HIGH_BIT_SUSTAIN = 0.009;
const START_STOP_BIT_SUSTAIN = 0.0065;

const NOTE_RISE_DURATION = 0.03;
const NOTE_FALL_DURATION = 0.03;
const NOTE_LONG_FALL_DURATION = 0.09;

/** The chime melody as [frequency Hz, relative duration] pairs:
 *  Eb5 G5 D5 F#5 Db5 F5 C5 E5(×5) Db5 F5 C5 E5(×4). */
const MELODY: ReadonlyArray<readonly [number, number]> = [
  [622, 1], [784, 1], [587, 1], [740, 1],
  [554, 1], [698, 1], [523, 1], [659, 5],
  [554, 1], [698, 1], [523, 1], [659, 4],
];

interface WaveState {
  amp: number;
  x: number;
  y: number;
}

/** Appends one rise/sustain/fall envelope of a rotating oscillator. */
function addWaveformComponent(
  samples: number[],
  frequency: number,
  phase: number,
  rise: number,
  sustain: number,
  fall: number,
  state: WaveState,
): void {
  const nRise = Math.round(rise * SAMPLE_RATE);
  const nSustain = Math.round(sustain * SAMPLE_RATE);
  const nFall = Math.round(fall * SAMPLE_RATE);
  const total = nRise + nSustain + nFall;
  const theta = (2 * Math.PI * frequency) / SAMPLE_RATE;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  for (let k = 0; k < total; k += 1) {
    if (k < nRise) state.amp = Math.min(Math.PI / 2, state.amp + Math.PI / 2 / nRise);
    if (k >= nRise + nSustain) state.amp = Math.max(0, state.amp - Math.PI / 2 / nFall);
    const volume = Math.sin(state.amp) * Math.sin(state.amp);
    samples.push(volume * phase * state.x);

    const xNew = state.x * cosT - state.y * sinT;
    const yNew = state.x * sinT + state.y * cosT;
    state.x = xNew;
    state.y = yNew;
  }
}

/** Start bits + data bits + stop bits on the 18 kHz carrier. */
function createCarrier(bitSequence: number[]): number[] {
  const carrier: number[] = [];
  const state: WaveState = { amp: 0, x: 1, y: 0 };
  let phase = 1;

  for (let i = 0; i < NUMBER_OF_START_BITS; i += 1) {
    addWaveformComponent(carrier, CARRIER_FREQUENCY, phase, BIT_RISE, START_STOP_BIT_SUSTAIN, BIT_FALL, state);
    phase *= -1;
  }
  for (const bit of bitSequence) {
    const sustain = bit === 1 ? HIGH_BIT_SUSTAIN : LOW_BIT_SUSTAIN;
    addWaveformComponent(carrier, CARRIER_FREQUENCY, phase, BIT_RISE, sustain, BIT_FALL, state);
    phase *= -1;
  }
  for (let i = 0; i < NUMBER_OF_STOP_BITS; i += 1) {
    addWaveformComponent(carrier, CARRIER_FREQUENCY, phase, BIT_RISE, START_STOP_BIT_SUSTAIN, BIT_FALL, state);
    phase *= -1;
  }
  return carrier;
}

/** Audible melody stretched to cover the carrier's sample count. */
function createMelody(targetSamples: number): number[] {
  const melody: number[] = [];
  const state: WaveState = { amp: 0, x: 1, y: 0 };
  const sumDurations = MELODY.reduce((sum, [, duration]) => sum + duration, 0);
  const noteSustain =
    (targetSamples / SAMPLE_RATE -
      MELODY.length * (NOTE_RISE_DURATION + NOTE_FALL_DURATION) +
      NOTE_FALL_DURATION -
      NOTE_LONG_FALL_DURATION) /
    sumDurations;

  MELODY.forEach(([frequency, duration], index) => {
    const fall = index === MELODY.length - 1 ? NOTE_LONG_FALL_DURATION : NOTE_FALL_DURATION;
    addWaveformComponent(melody, frequency, 1, NOTE_RISE_DURATION, noteSustain * duration, fall, state);
  });
  return melody;
}

function deploymentIdToBytes(deploymentIdHex: string): number[] {
  const normalized = deploymentIdHex.trim().toLowerCase();
  if (!HEX_ID.test(normalized)) throw new Error("Invalid deployment ID");
  const bytes: number[] = [];
  for (let i = 0; i < LENGTH_OF_DEPLOYMENT_ID; i += 1) {
    bytes.push(parseInt(normalized.slice(i * 2, i * 2 + 2), 16));
  }
  return bytes;
}

/**
 * Pack time + location + deployment ID, protect with CRC-16 and Hamming(7,4)
 * and return the resulting bit sequence (exported for tests against the
 * OpenAcousticDevices reference implementation).
 */
export function encodeChimeBits(
  timestampUnixSeconds: number,
  latitude: number,
  longitude: number,
  deploymentIdHex: string,
): number[] {
  const deploymentBytes = deploymentIdToBytes(deploymentIdHex);
  const packer = new BitPacker(LENGTH_OF_TIME + LENGTH_OF_LOCATION + LENGTH_OF_DEPLOYMENT_ID);
  packer.encodeTime(timestampUnixSeconds);
  packer.encodeLocation(latitude, longitude);
  packer.encodeDeploymentId(deploymentBytes);

  const crc = createCrc16(packer.bytes);
  return hammingEncode([...packer.bytes, ...crc]);
}

/**
 * Generate the chime samples (48 kHz mono, -1..1) for one time + location +
 * deployment ID: carrier at quarter volume + melody at half volume.
 */
export function generateChime(
  timestampUnixSeconds: number,
  latitude: number,
  longitude: number,
  deploymentIdHex: string,
): Float32Array<ArrayBuffer> {
  const bitSequence = encodeChimeBits(timestampUnixSeconds, latitude, longitude, deploymentIdHex);
  const carrier = createCarrier(bitSequence);
  const melody = createMelody(carrier.length);

  const length = Math.min(carrier.length, melody.length);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) samples[i] = carrier[i]! / 4 + melody[i]! / 2;
  return samples;
}

/** Chime duration in seconds for a sample buffer. */
export function chimeDurationSeconds(samples: Float32Array): number {
  return samples.length / SAMPLE_RATE;
}

/** Play the chime through the Web Audio API, resolving when it finishes. */
export async function playChime(samples: Float32Array<ArrayBuffer>): Promise<void> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio unavailable");
  const context = new Ctx({ sampleRate: SAMPLE_RATE });
  try {
    if (context.state === "suspended") await context.resume();
    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    await new Promise<void>((resolve, reject) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => resolve();
      try {
        source.start();
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Playback failed"));
      }
    });
  } finally {
    await context.close().catch(() => undefined);
  }
}
