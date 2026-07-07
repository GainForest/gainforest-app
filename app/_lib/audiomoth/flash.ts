/**
 * AudioMoth firmware flashing in the browser.
 *
 * Ported from the official AudioMoth Flash App (communication.js). Two
 * transports are supported:
 *
 * 1. USB HID bootloader — devices running recent firmware accept bootloader
 *    commands wrapped in HID reports while still in USB/OFF mode, so the
 *    whole flash happens over WebHID with no mode switch.
 * 2. Serial bootloader — older devices switch into a CDC serial bootloader
 *    (vendor 0x10c4/0x2544, product 0x0003) and are flashed over WebSerial
 *    using the XMODEM-CRC protocol.
 */

import { AudioMothDevice, withRetries } from "./protocol";

/* Firmware binaries begin with the initial stack pointer, which must sit in SRAM */
const MIN_ADDRESS_0 = 536870912; // 0x20000000
const MAX_ADDRESS_0 = 536903680; // 0x20008000

const MAX_FIRMWARE_SIZE = 240 * 1024;

export function looksLikeAudioMothFirmware(firmware: Uint8Array): boolean {
  if (firmware.length < 4 || firmware.length > MAX_FIRMWARE_SIZE) return false;
  const address0 = firmware[0] + (firmware[1] << 8) + (firmware[2] << 16) + (firmware[3] << 24);
  const unsigned = address0 >>> 0;
  return unsigned >= MIN_ADDRESS_0 && unsigned <= MAX_ADDRESS_0;
}

export type FlashPhase = "preparing" | "transferring" | "verifying" | "flashing" | "restarting";

export interface FlashProgress {
  phase: FlashPhase;
  /** 0-1 within the transfer phase. */
  fraction: number;
}

type ProgressCallback = (progress: FlashProgress) => void;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/* ------------------------------------------------------------------ */
/* CRC helpers (ported verbatim from the Flash App)                    */
/* ------------------------------------------------------------------ */

/** CRC-16 used by the serial bootloader's XMODEM implementation. */
export function crc16(buffer: Uint8Array): number {
  let crc = 0x0;
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    let code = (crc >>> 8) & 0xff;
    code ^= byte & 0xff;
    code ^= code >>> 4;
    crc = (crc << 8) & 0xffff;
    crc ^= code;
    code = (code << 5) & 0xffff;
    crc ^= code;
    code = (code << 7) & 0xffff;
    crc ^= code;
  }
  return crc;
}

/** CRC over the full 240KB application region, as computed by the bootloader. */
export function calculateFirmwareCrc(firmware: Uint8Array): string {
  const FIRMWARE_CRC_POLY = 0x1021;

  let crc = 0;

  const updateCrc = (current: number, incr: boolean): number => {
    const xor = current >> 15;
    let out = (current << 1) & 0xffff;
    if (incr) out = (out + 1) & 0xffff;
    if (xor) out ^= FIRMWARE_CRC_POLY;
    return out;
  };

  for (let i = 0; i < MAX_FIRMWARE_SIZE; i += 1) {
    const byte = i < firmware.length ? firmware[i] : 0xff;
    for (let j = 0x80; j > 0; j >>= 1) crc = updateCrc(crc, (byte & j) !== 0);
  }
  for (let j = 0; j < 16; j += 1) crc = updateCrc(crc, false);

  return ("0000" + crc.toString(16).toUpperCase()).slice(-4);
}

/* ------------------------------------------------------------------ */
/* USB HID bootloader flashing                                         */
/* ------------------------------------------------------------------ */

const AM_BOOTLOADER_INITIALISE_SRAM = 0x02;
const AM_BOOTLOADER_CLEAR_USER_DATA = 0x03;
const AM_BOOTLOADER_SET_SRAM_FIRMWARE_PACKET = 0x04;
const AM_BOOTLOADER_CALC_SRAM_FIRMWARE_CRC = 0x05;
const AM_BOOTLOADER_GET_FIRMWARE_CRC = 0x07;
const AM_BOOTLOADER_FLASH_FIRMWARE = 0x08;

const MAXIMUM_FIRMWARE_PACKET_SIZE = 56;
const RESET_TIMEOUT_MS = 7500;

export async function flashViaUsbHid(
  device: AudioMothDevice,
  firmware: Uint8Array,
  clearUserData: boolean,
  onProgress: ProgressCallback,
): Promise<string> {
  onProgress({ phase: "preparing", fraction: 0 });

  /* Initialise external SRAM */

  let result = await withRetries(() => device.sendUsbHidBootloaderPacket([AM_BOOTLOADER_INITIALISE_SRAM]));
  if (result[1] !== AM_BOOTLOADER_INITIALISE_SRAM || result[2] !== 0x01) {
    throw new Error("The AudioMoth did not prepare its memory for the update.");
  }

  /* Stream firmware into SRAM in 56-byte chunks */

  onProgress({ phase: "transferring", fraction: 0 });

  let offset = 0;
  while (offset < firmware.length) {
    const numberOfBytes = Math.min(MAXIMUM_FIRMWARE_PACKET_SIZE, firmware.length - offset);
    const packet = [
      AM_BOOTLOADER_SET_SRAM_FIRMWARE_PACKET,
      offset & 0xff,
      (offset >> 8) & 0xff,
      (offset >> 16) & 0xff,
      (offset >> 24) & 0xff,
      numberOfBytes,
    ];
    for (let j = 0; j < numberOfBytes; j += 1) packet.push(firmware[offset + j]);

    result = await withRetries(() => device.sendUsbHidBootloaderPacket(packet));
    if (result[1] !== AM_BOOTLOADER_SET_SRAM_FIRMWARE_PACKET) {
      throw new Error("The AudioMoth stopped responding during the update.");
    }

    offset += numberOfBytes;
    onProgress({ phase: "transferring", fraction: offset / firmware.length });
  }

  /* Verify CRC */

  onProgress({ phase: "verifying", fraction: 0 });

  const expectedCrc = calculateFirmwareCrc(firmware);

  result = await withRetries(() => device.sendUsbHidBootloaderPacket([AM_BOOTLOADER_CALC_SRAM_FIRMWARE_CRC]));
  if (result[1] !== AM_BOOTLOADER_CALC_SRAM_FIRMWARE_CRC) {
    throw new Error("The AudioMoth stopped responding during verification.");
  }

  let crcReady = false;
  for (let retries = 0; retries < 10; retries += 1) {
    await delay(500);
    result = await withRetries(() => device.sendUsbHidBootloaderPacket([AM_BOOTLOADER_GET_FIRMWARE_CRC]));
    if (result[1] !== AM_BOOTLOADER_GET_FIRMWARE_CRC) {
      throw new Error("The AudioMoth stopped responding during verification.");
    }
    if (result[2] === 0x01) {
      crcReady = true;
      break;
    }
  }
  if (!crcReady) throw new Error("The AudioMoth could not verify the transferred firmware.");

  const actualCrc = ("0000" + (result[3] + (result[4] << 8)).toString(16).toUpperCase()).slice(-4);
  if (actualCrc !== expectedCrc) {
    throw new Error(`The transferred firmware did not verify correctly (${actualCrc} != ${expectedCrc}). Please try again.`);
  }

  /* Optionally clear the stored configuration */

  if (clearUserData) {
    result = await withRetries(() => device.sendUsbHidBootloaderPacket([AM_BOOTLOADER_CLEAR_USER_DATA]));
    if (result[1] !== AM_BOOTLOADER_CLEAR_USER_DATA || result[2] !== 0x01) {
      throw new Error("The AudioMoth did not clear its stored settings.");
    }
  }

  /* Flash */

  onProgress({ phase: "flashing", fraction: 0 });

  result = await withRetries(() => device.sendUsbHidBootloaderPacket([AM_BOOTLOADER_FLASH_FIRMWARE]));
  if (result[1] !== AM_BOOTLOADER_FLASH_FIRMWARE || result[2] !== 0x01) {
    throw new Error("The AudioMoth did not accept the update request.");
  }

  /* Wait for the device to restart itself */

  onProgress({ phase: "restarting", fraction: 0 });
  const started = Date.now();
  while (Date.now() - started < RESET_TIMEOUT_MS) {
    await delay(100);
    onProgress({ phase: "restarting", fraction: (Date.now() - started) / RESET_TIMEOUT_MS });
  }

  return actualCrc;
}

/* ------------------------------------------------------------------ */
/* Serial bootloader flashing (WebSerial + XMODEM-CRC)                 */
/* ------------------------------------------------------------------ */

const SOH = 0x01;
const EOF_BYTE = 0x04;
const ACK = 0x06;
const FILLER = 0xff;
const BLOCK_SIZE = 128;

/* Minimal WebSerial typings */
export interface WebSerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface WebSerial {
  requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<WebSerialPort>;
}

export function getWebSerial(): WebSerial | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { serial?: WebSerial };
  return nav.serial ?? null;
}

class SerialChannel {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffered: number[] = [];
  private closed = false;

  constructor(port: WebSerialPort) {
    if (!port.readable || !port.writable) throw new Error("Serial port is not readable/writable.");
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
    void this.pump();
  }

  /** Single background read loop feeding the byte buffer. */
  private async pump(): Promise<void> {
    try {
      for (;;) {
        const result = await this.reader.read();
        if (result.value) this.buffered.push(...Array.from(result.value));
        if (result.done) break;
      }
    } catch {
      /* reader cancelled or device detached */
    } finally {
      this.closed = true;
    }
  }

  async write(data: Uint8Array): Promise<void> {
    await this.writer.write(data);
  }

  /** Wait until `length` bytes are buffered or the timeout elapses. */
  async read(length: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.buffered.length < length && Date.now() < deadline && !this.closed) {
      await delay(10);
    }
    const data = Uint8Array.from(this.buffered.slice(0, length));
    this.buffered = this.buffered.slice(data.length);
    return data;
  }

  clearBuffer(): void {
    this.buffered = [];
  }

  async release(): Promise<void> {
    try {
      await this.reader.cancel();
    } catch {
      /* noop */
    }
    try {
      this.reader.releaseLock();
      this.writer.releaseLock();
    } catch {
      /* noop */
    }
  }
}

async function sendCommandExpecting(
  channel: SerialChannel,
  command: Uint8Array,
  expectedLength: number,
  regex: RegExp,
  timeoutMs = 1500,
): Promise<string> {
  channel.clearBuffer();
  await channel.write(command);
  const response = await channel.read(expectedLength, timeoutMs);
  const text = Array.from(response, (byte) => String.fromCharCode(byte)).join("");
  const match = regex.exec(text);
  if (!match) throw new Error("Unexpected response from the AudioMoth bootloader.");
  return match[0];
}

export async function flashViaSerial(
  port: WebSerialPort,
  firmware: Uint8Array,
  onProgress: ProgressCallback,
): Promise<string> {
  await port.open({ baudRate: 9600 });

  const channel = new SerialChannel(port);

  try {
    onProgress({ phase: "preparing", fraction: 0 });

    /* Split firmware into 128-byte XMODEM blocks */

    const blocks: Uint8Array[] = [];
    for (let offset = 0; offset < firmware.length; offset += BLOCK_SIZE) {
      const block = new Uint8Array(BLOCK_SIZE).fill(FILLER);
      block.set(firmware.slice(offset, offset + BLOCK_SIZE));
      blocks.push(block);
    }

    /* Send upload command ('u' = non-destructive) until the bootloader reports ready */

    let ready = false;
    for (let attempt = 0; attempt < 7 && !ready; attempt += 1) {
      try {
        await sendCommandExpecting(channel, Uint8Array.from([0x75]), 11, /Ready/);
        ready = true;
      } catch {
        await delay(100 * 2 ** attempt);
      }
    }
    if (!ready) throw new Error("The AudioMoth bootloader did not report ready. Detach and reattach the device, then try again.");

    /* XMODEM transfer */

    onProgress({ phase: "transferring", fraction: 0 });

    for (let blockNumber = 0; blockNumber < blocks.length; blockNumber += 1) {
      const bn = (blockNumber + 1) & 0xff;
      const crc = crc16(blocks[blockNumber]);
      const sendBuffer = new Uint8Array(3 + BLOCK_SIZE + 2);
      sendBuffer[0] = SOH;
      sendBuffer[1] = bn;
      sendBuffer[2] = 0xff - bn;
      sendBuffer.set(blocks[blockNumber], 3);
      sendBuffer[3 + BLOCK_SIZE] = (crc >> 8) & 0xff;
      sendBuffer[4 + BLOCK_SIZE] = crc & 0xff;

      let acknowledged = false;
      for (let repeats = 0; repeats < 10 && !acknowledged; repeats += 1) {
        channel.clearBuffer();
        await channel.write(sendBuffer);
        const response = await channel.read(1, 1500);
        if (response.length === 1 && response[0] === ACK) acknowledged = true;
      }
      if (!acknowledged) {
        throw new Error("The AudioMoth stopped responding during the update. Detach and reattach the device, then try again.");
      }

      onProgress({ phase: "transferring", fraction: (blockNumber + 1) / blocks.length });
    }

    /* End of file */

    const eofResponse = await (async () => {
      channel.clearBuffer();
      await channel.write(Uint8Array.from([EOF_BYTE]));
      return channel.read(1, 1500);
    })();
    if (eofResponse.length !== 1 || eofResponse[0] !== ACK) {
      throw new Error("The AudioMoth did not confirm the end of the update.");
    }

    /* CRC check ('c' = application region) */

    onProgress({ phase: "verifying", fraction: 0 });

    const crcResponse = await sendCommandExpecting(channel, Uint8Array.from([0x63]), 18, /CRC: 0000[A-Z0-9]{4}/, 5000);
    const receivedCrc = crcResponse.slice(-4);
    const expectedCrc = calculateFirmwareCrc(firmware);

    if (receivedCrc !== expectedCrc) {
      throw new Error(`The update did not verify correctly (${receivedCrc} != ${expectedCrc}). Please try again.`);
    }

    /* Reset the device */

    onProgress({ phase: "restarting", fraction: 0 });
    try {
      await sendCommandExpecting(channel, Uint8Array.from([0x72]), 1, /r/, 5000);
    } catch {
      /* Some bootloaders reset without echoing */
    }

    return receivedCrc;
  } finally {
    await channel.release();
    try {
      await port.close();
    } catch {
      /* already closed / device rebooted */
    }
  }
}
