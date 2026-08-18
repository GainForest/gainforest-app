/**
 * AudioMoth USB HID protocol over WebHID.
 *
 * Browser port of the message layer used by the official Open Acoustic
 * Devices desktop apps (audiomoth-hid 2.3.0). An AudioMoth in USB/OFF mode
 * enumerates as a USB HID device (vendor 0x10c4, product 0x0002) and speaks
 * a simple request/response protocol over 64-byte HID reports: the first
 * payload byte is a message type, and the device echoes that type back in
 * byte 0 of its response followed by the payload.
 */

/* AudioMoth HID identifiers (USB/OFF mode) */
export const AUDIOMOTH_HID_VENDOR_ID = 0x10c4;
export const AUDIOMOTH_HID_PRODUCT_ID = 0x0002;

/* AudioMoth serial bootloader identifiers (flash mode, CDC serial) */
export const AUDIOMOTH_SERIAL_USB_IDS: Array<{ usbVendorId: number; usbProductId: number }> = [
  { usbVendorId: 0x10c4, usbProductId: 0x0003 },
  { usbVendorId: 0x2544, usbProductId: 0x0003 },
];

/* USB HID message types */
const MSG_GET_TIME = 0x01;
const MSG_SET_TIME = 0x02;
const MSG_GET_UID = 0x03;
const MSG_GET_BATTERY = 0x04;
/* Note: GET_APP_PACKET (0x05) does NOT return the stored configuration —
   AudioMoth-Firmware-Basic answers it with time + ID + battery + firmware
   info. The configuration cannot be read back over USB. */
const MSG_SET_APP_PACKET = 0x06;
const MSG_GET_FIRMWARE_VERSION = 0x07;
const MSG_GET_FIRMWARE_DESCRIPTION = 0x08;
const MSG_QUERY_SERIAL_BOOTLOADER = 0x09;
const MSG_ENTER_SERIAL_BOOTLOADER = 0x0a;
const MSG_QUERY_USBHID_BOOTLOADER = 0x0b;
const MSG_ENTER_USBHID_BOOTLOADER = 0x0c;

const HID_PACKET_SIZE = 64;
const FIRMWARE_DESCRIPTION_LENGTH = 32;
const RESPONSE_TIMEOUT_MS = 1500;

/* ------------------------------------------------------------------ */
/* Minimal WebHID typings (not yet in the default TS dom lib)          */
/* ------------------------------------------------------------------ */

export interface WebHidInputReportEvent {
  readonly data: DataView;
  readonly reportId: number;
}

export interface WebHidDevice {
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(type: "inputreport", listener: (event: WebHidInputReportEvent) => void): void;
  removeEventListener(type: "inputreport", listener: (event: WebHidInputReportEvent) => void): void;
}

interface WebHid {
  getDevices(): Promise<WebHidDevice[]>;
  requestDevice(options: { filters: Array<{ vendorId?: number; productId?: number }> }): Promise<WebHidDevice[]>;
  addEventListener(type: "connect" | "disconnect", listener: (event: { device: WebHidDevice }) => void): void;
  removeEventListener(type: "connect" | "disconnect", listener: (event: { device: WebHidDevice }) => void): void;
}

export function getWebHid(): WebHid | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { hid?: WebHid };
  return nav.hid ?? null;
}

export function isAudioMothHidDevice(device: { vendorId: number; productId: number }): boolean {
  return device.vendorId === AUDIOMOTH_HID_VENDOR_ID && device.productId === AUDIOMOTH_HID_PRODUCT_ID;
}

/* ------------------------------------------------------------------ */
/* Buffer conversions (ported from audiomoth-hid)                      */
/* ------------------------------------------------------------------ */

export function convertFourBytesFromBufferToDate(buffer: Uint8Array, offset: number): Date {
  const unixTimestamp =
    (buffer[offset] & 0xff) +
    ((buffer[offset + 1] & 0xff) << 8) +
    ((buffer[offset + 2] & 0xff) << 16) +
    ((buffer[offset + 3] & 0xff) << 24);
  return new Date((unixTimestamp >>> 0) * 1000);
}

export function convertDateToFourBytesInBuffer(buffer: Uint8Array, offset: number, date: Date): void {
  const unixTimeStamp = Math.round(date.valueOf() / 1000);
  buffer[offset + 3] = (unixTimeStamp >> 24) & 0xff;
  buffer[offset + 2] = (unixTimeStamp >> 16) & 0xff;
  buffer[offset + 1] = (unixTimeStamp >> 8) & 0xff;
  buffer[offset] = unixTimeStamp & 0xff;
}

export function convertEightBytesFromBufferToID(buffer: Uint8Array, offset: number): string {
  return Array.from(buffer.slice(offset, offset + 8).reverse(), (byte) =>
    ("0" + (byte & 0xff).toString(16)).slice(-2),
  )
    .join("")
    .toUpperCase();
}

export function convertOneByteFromBufferToBatteryState(buffer: Uint8Array, offset: number): string {
  const batteryState = buffer[offset];
  if (batteryState === 0) return "< 3.6V";
  if (batteryState === 15) return "> 4.9V";
  return (3.5 + batteryState / 10).toFixed(1) + "V";
}

function convertThreeBytesFromBufferToFirmwareVersion(buffer: Uint8Array, offset: number): [number, number, number] {
  return [buffer[offset], buffer[offset + 1], buffer[offset + 2]];
}

function convertBytesFromBufferToFirmwareDescription(buffer: Uint8Array, offset: number): string {
  let description = "";
  for (let i = 0; i < FIRMWARE_DESCRIPTION_LENGTH; i += 1) {
    const charCode = buffer[offset + i];
    if (charCode === 0) break;
    description += String.fromCharCode(charCode);
  }
  return description;
}

/* ------------------------------------------------------------------ */
/* Device wrapper                                                      */
/* ------------------------------------------------------------------ */

export class AudioMothTimeoutError extends Error {
  constructor() {
    super("Timed out waiting for a response from the AudioMoth.");
    this.name = "AudioMothTimeoutError";
  }
}

/**
 * Serialised request/response channel to one AudioMoth HID device. All
 * commands are funnelled through a queue so concurrent UI polling and user
 * actions never interleave reports.
 */
export class AudioMothDevice {
  readonly device: WebHidDevice;

  private queue: Promise<unknown> = Promise.resolve();

  constructor(device: WebHidDevice) {
    this.device = device;
  }

  async open(): Promise<void> {
    if (!this.device.opened) await this.device.open();
  }

  async close(): Promise<void> {
    if (this.device.opened) {
      try {
        await this.device.close();
      } catch {
        /* device already gone */
      }
    }
  }

  /** Send one 64-byte report and wait for the matching response. */
  private async transceiveOnce(payload: Uint8Array): Promise<Uint8Array> {
    const report = new Uint8Array(HID_PACKET_SIZE);
    report.set(payload.slice(0, HID_PACKET_SIZE));

    return new Promise<Uint8Array>((resolve, reject) => {
      let settled = false;

      const onInput = (event: WebHidInputReportEvent) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.device.removeEventListener("inputreport", onInput);
        const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
        resolve(new Uint8Array(data));
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.device.removeEventListener("inputreport", onInput);
        reject(new AudioMothTimeoutError());
      }, RESPONSE_TIMEOUT_MS);

      this.device.addEventListener("inputreport", onInput);

      this.device.sendReport(0, report).catch((error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.device.removeEventListener("inputreport", onInput);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private async request(messageType: number, payload?: Uint8Array): Promise<Uint8Array> {
    const run = async () => {
      await this.open();
      const buffer = new Uint8Array(HID_PACKET_SIZE);
      buffer[0] = messageType;
      if (payload) buffer.set(payload.slice(0, HID_PACKET_SIZE - 1), 1);
      const response = await this.transceiveOnce(buffer);
      if (response[0] !== messageType) {
        throw new Error("Incorrect message type in response from AudioMoth.");
      }
      return response;
    };

    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async getTime(): Promise<Date> {
    const response = await this.request(MSG_GET_TIME);
    return convertFourBytesFromBufferToDate(response, 1);
  }

  async setTime(date: Date): Promise<Date> {
    const payload = new Uint8Array(4);
    convertDateToFourBytesInBuffer(payload, 0, date);
    const response = await this.request(MSG_SET_TIME, payload);
    return convertFourBytesFromBufferToDate(response, 1);
  }

  async getId(): Promise<string> {
    const response = await this.request(MSG_GET_UID);
    return convertEightBytesFromBufferToID(response, 1);
  }

  async getBatteryState(): Promise<string> {
    const response = await this.request(MSG_GET_BATTERY);
    return convertOneByteFromBufferToBatteryState(response, 1);
  }

  async getFirmwareVersion(): Promise<[number, number, number]> {
    const response = await this.request(MSG_GET_FIRMWARE_VERSION);
    return convertThreeBytesFromBufferToFirmwareVersion(response, 1);
  }

  async getFirmwareDescription(): Promise<string> {
    const response = await this.request(MSG_GET_FIRMWARE_DESCRIPTION);
    return convertBytesFromBufferToFirmwareDescription(response, 1);
  }

  /** Send a configuration packet; returns the echoed packet for verification. */
  async setPacket(packet: Uint8Array): Promise<Uint8Array> {
    const response = await this.request(MSG_SET_APP_PACKET, packet.slice(0, 62));
    return response.slice(1);
  }

  async querylSerialBootloaderSupport(): Promise<boolean> {
    const response = await this.request(MSG_QUERY_SERIAL_BOOTLOADER);
    return response[1] === 0x01;
  }

  async switchToSerialBootloader(): Promise<boolean> {
    const response = await this.request(MSG_ENTER_SERIAL_BOOTLOADER);
    return response[1] === 0x01;
  }

  async queryUsbHidBootloaderSupport(): Promise<boolean> {
    const response = await this.request(MSG_QUERY_USBHID_BOOTLOADER);
    return response[1] === 0x01;
  }

  /** Wrap a bootloader command in an ENTER_USBHID_BOOTLOADER report. */
  async sendUsbHidBootloaderPacket(packet: Uint8Array | number[]): Promise<Uint8Array> {
    const payload = packet instanceof Uint8Array ? packet : Uint8Array.from(packet);
    return this.request(MSG_ENTER_USBHID_BOOTLOADER, payload);
  }
}

/** Retry helper matching the desktop apps' callWithRetry behaviour. */
export async function withRetries<T>(fn: () => Promise<T>, retries = 10, intervalMs = 100): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const interval = intervalMs / 2 + (intervalMs / 2) * Math.random();
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Repeated attempts to access the AudioMoth failed.");
}
