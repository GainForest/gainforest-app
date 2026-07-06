/**
 * AudioMoth recording configuration packet builder.
 *
 * Ported from the official AudioMoth Configuration App (uiIndex.js /
 * constants.js). Builds the 62-byte SET_APP_PACKET payload understood by
 * AudioMoth-Firmware-Basic. Advanced features that the web app does not
 * expose (sunrise/sunset scheduling, amplitude/frequency triggers, GPS time
 * setting, acoustic chime configuration) are written as their firmware
 * defaults, exactly as the desktop app does when they are switched off.
 */

export interface SampleRateConfiguration {
  trueSampleRate: number; // kHz
  clockDivider: number;
  acquisitionCycles: number;
  oversampleRate: number;
  sampleRate: number;
  sampleRateDivider: number;
}

export const CONFIGURATIONS: SampleRateConfiguration[] = [
  { trueSampleRate: 8, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 384000, sampleRateDivider: 48 },
  { trueSampleRate: 16, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 384000, sampleRateDivider: 24 },
  { trueSampleRate: 32, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 384000, sampleRateDivider: 12 },
  { trueSampleRate: 48, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 384000, sampleRateDivider: 8 },
  { trueSampleRate: 96, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 384000, sampleRateDivider: 4 },
  { trueSampleRate: 192, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 384000, sampleRateDivider: 2 },
  { trueSampleRate: 250, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 250000, sampleRateDivider: 1 },
  { trueSampleRate: 384, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 384000, sampleRateDivider: 1 },
];

/* Sample-rate table sent to devices running firmware older than 1.4.4 */
const OLD_CONFIGURATIONS: SampleRateConfiguration[] = [
  { trueSampleRate: 8, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 128000, sampleRateDivider: 16 },
  { trueSampleRate: 16, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 128000, sampleRateDivider: 8 },
  { trueSampleRate: 32, clockDivider: 4, acquisitionCycles: 16, oversampleRate: 1, sampleRate: 128000, sampleRateDivider: 4 },
];

export const MAX_PERIODS = 4;
export const MINUTES_IN_DAY = 1440;
const MINUTES_IN_HOUR = 60;
const SECONDS_IN_MINUTE = 60;
const SECONDS_IN_DAY = 86400;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;

export const MAX_SLEEP_DURATION = 43200;
export const MAX_RECORD_DURATION = 43200;
export const VALID_GAIN_VALUES = [0, 1, 2, 3, 4] as const;

/* Packet lengths per firmware version, used to verify the echoed packet */
const PACKET_LENGTH_VERSIONS: Array<{ firmwareVersion: [number, number, number]; packetLength: number }> = [
  { firmwareVersion: [0, 0, 0], packetLength: 39 },
  { firmwareVersion: [1, 2, 0], packetLength: 40 },
  { firmwareVersion: [1, 2, 1], packetLength: 42 },
  { firmwareVersion: [1, 2, 2], packetLength: 43 },
  { firmwareVersion: [1, 4, 0], packetLength: 58 },
  { firmwareVersion: [1, 5, 0], packetLength: 59 },
  { firmwareVersion: [1, 6, 0], packetLength: 62 },
];

export const LATEST_FIRMWARE_VERSION: [number, number, number] = [1, 12, 0];

export type FirmwareClassification = "official" | "release-candidate" | "custom-equivalent" | "unsupported";

const EQUIVALENCE_REGEX = /E([0-9]+)\.([0-9]+)\.([0-9]+)/;

export function classifyFirmware(description: string): FirmwareClassification {
  if (description === "AudioMoth-Firmware-Basic") return "official";
  if (description.replace(/-RC\d+$/, "-RC") === "AudioMoth-Firmware-Basic-RC") return "release-candidate";
  if (EQUIVALENCE_REGEX.test(description)) return "custom-equivalent";
  return "unsupported";
}

/**
 * The firmware version whose packet format the device expects. Custom
 * firmware advertising an equivalence (e.g. "…-E1.8.0") is treated as that
 * version; unknown firmware is treated as the latest official release.
 */
export function getEffectiveFirmwareVersion(version: [number, number, number], description: string): [number, number, number] {
  const classification = classifyFirmware(description);
  if (classification === "custom-equivalent") {
    const match = description.match(EQUIVALENCE_REGEX);
    if (match) return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
  }
  if (classification === "unsupported") return LATEST_FIRMWARE_VERSION;
  return version;
}

function compareVersion(version: [number, number, number], major: number, minor: number, patch: number): number {
  const target = [major, minor, patch];
  for (let i = 0; i < 3; i += 1) {
    if (version[i] > target[i]) return 1;
    if (version[i] < target[i]) return -1;
  }
  return 0;
}

export function isOlderVersion(version: [number, number, number], major: number, minor: number, patch: number): boolean {
  return compareVersion(version, major, minor, patch) === -1;
}

export interface TimePeriod {
  startMins: number;
  endMins: number;
}

export type FilterType = "none" | "low" | "band" | "high";

export type GpsFixMode = "period" | "individual";

export const VALID_GPS_FIX_TIMES = [1, 2, 5, 10, 15] as const;

export interface AudioMothConfig {
  gain: number; // 0-4
  sampleRateIndex: number; // index into CONFIGURATIONS
  sleepDuration: number; // seconds
  recordDuration: number; // seconds
  dutyEnabled: boolean;
  ledEnabled: boolean;
  /** Indicate battery/voltage state on the LEDs when switched on. */
  batteryLevelCheckEnabled: boolean;
  /** Recording periods in minutes from midnight (device-local time). */
  timePeriods: TimePeriod[];
  /** Minutes offset from UTC applied to the schedule (0 = UTC). */
  timeZoneOffsetMinutes: number;
  /** Optional first/last recording dates as YYYY-MM-DD strings. */
  firstRecordingDate: string | null;
  lastRecordingDate: string | null;
  filterType: FilterType;
  lowerFilterHz: number;
  higherFilterHz: number;
  energySaverModeEnabled: boolean;
  disable48DCFilter: boolean;
  dailyFolders: boolean;
  filenameWithDeviceIDEnabled: boolean;
  /* Advanced settings (fw ≥ 1.12.0 unless noted) */
  /** Always require an acoustic chime when switching to CUSTOM. */
  requireAcousticConfig: boolean;
  /** Also require the location in the acoustic chime (needs requireAcousticConfig). */
  requireLocationInChime: boolean;
  /** Use the time zone included in the acoustic chime. */
  useTimeZoneInChime: boolean;
  /** Also adjust the schedule to the chimed time zone (needs useTimeZoneInChime). */
  adjustScheduleUsingTimezoneFromAcousticChime: boolean;
  /** Extend WAV file preparation time for slow SD cards (prep time 10s vs 2s). */
  extendPrepTime: boolean;
  /** Show NiMH/LiPo voltage range instead of battery level on the LEDs. */
  displayVoltageRange: boolean;
  /** Switch the gain settings to the low gain range. */
  lowGainRangeEnabled: boolean;
  /** Ignore an attached external microphone for the acoustic chime. */
  ignoreExternalMicrophoneForAcousticChime: boolean;
  /** Use a magnetic switch to delay the start of the schedule. */
  magneticSwitchEnabled: boolean;
  /** Use the GPS add-on to set time and location (fw ≥ 1.11.0 for fix options). */
  timeSettingFromGPSEnabled: boolean;
  /** Acquire a GPS fix around whole periods or each individual recording. */
  acquireGpsFixBeforeAfter: GpsFixMode;
  /** GPS fix time in minutes (1, 2, 5, 10 or 15). */
  gpsFixTime: number;
}

export const DEFAULT_CONFIG: AudioMothConfig = {
  gain: 2,
  sampleRateIndex: 3, // 48 kHz
  sleepDuration: 5,
  recordDuration: 55,
  dutyEnabled: true,
  ledEnabled: true,
  batteryLevelCheckEnabled: true,
  timePeriods: [],
  timeZoneOffsetMinutes: 0,
  firstRecordingDate: null,
  lastRecordingDate: null,
  filterType: "none",
  lowerFilterHz: 6000,
  higherFilterHz: 18000,
  energySaverModeEnabled: false,
  disable48DCFilter: false,
  dailyFolders: false,
  filenameWithDeviceIDEnabled: false,
  requireAcousticConfig: false,
  requireLocationInChime: false,
  useTimeZoneInChime: false,
  adjustScheduleUsingTimezoneFromAcousticChime: false,
  extendPrepTime: false,
  displayVoltageRange: false,
  lowGainRangeEnabled: false,
  ignoreExternalMicrophoneForAcousticChime: false,
  magneticSwitchEnabled: false,
  timeSettingFromGPSEnabled: false,
  acquireGpsFixBeforeAfter: "period",
  gpsFixTime: 2,
};

/**
 * The recording configuration the one-click GainForest setup applies:
 * defaults plus 60 s recordings every 5 minutes (4 min sleep), recording
 * around the clock, with the acoustic chime required on switching to CUSTOM.
 */
export function gainforestSetupConfig(): AudioMothConfig {
  return {
    ...DEFAULT_CONFIG,
    timePeriods: [{ startMins: 0, endMins: MINUTES_IN_DAY }],
    dutyEnabled: true,
    recordDuration: 60,
    sleepDuration: 240,
    requireAcousticConfig: true,
  };
}

/**
 * Compare a configuration packet read back from a device (GET_APP_PACKET)
 * with the packet the GainForest setup would write. The leading 4 bytes are
 * the configuration timestamp and are ignored.
 */
export function matchesGainForestSetup(
  storedPacket: Uint8Array,
  firmwareVersion: [number, number, number],
  firmwareDescription: string,
): boolean {
  const { packet: expected, verifyLength } = buildConfigPacket(
    gainforestSetupConfig(),
    firmwareVersion,
    firmwareDescription,
    new Date(),
  );
  const compareLength = verifyLength(storedPacket.length);
  for (let i = 4; i < compareLength; i += 1) {
    if (expected[i] !== (storedPacket[i] ?? 0)) return false;
  }
  return true;
}

function writeLittleEndianBytes(buffer: Uint8Array, start: number, byteCount: number, value: number): void {
  for (let i = 0; i < byteCount; i += 1) {
    buffer[start + i] = (value / 2 ** (i * 8)) & 255;
  }
}

/** Sort periods and split any period that wraps past midnight. */
function normalisePeriods(periods: TimePeriod[], splitWrapped: boolean): TimePeriod[] {
  let result: TimePeriod[] = [];

  for (const period of periods) {
    const startMins = Math.max(0, Math.min(MINUTES_IN_DAY - 1, Math.round(period.startMins)));
    let endMins = Math.max(0, Math.min(MINUTES_IN_DAY, Math.round(period.endMins)));
    if (endMins === startMins) continue;
    if (splitWrapped && endMins < startMins) {
      result.push({ startMins, endMins: MINUTES_IN_DAY });
      if (endMins > 0) result.push({ startMins: 0, endMins });
    } else {
      if (endMins === 0) endMins = MINUTES_IN_DAY;
      result.push({ startMins, endMins });
    }
  }

  result = result.sort((a, b) => a.startMins - b.startMins);

  return result.slice(0, MAX_PERIODS);
}

export interface BuiltConfigPacket {
  packet: Uint8Array;
  /** Number of bytes the device is expected to echo back for verification. */
  verifyLength: (echoLength: number) => number;
}

/**
 * Build the configuration packet. `sendTime` should be the timestamp the
 * packet is sent at (the device clock is set from it).
 */
export function buildConfigPacket(
  config: AudioMothConfig,
  firmwareVersion: [number, number, number],
  firmwareDescription: string,
  sendTime: Date,
): BuiltConfigPacket {
  const version = getEffectiveFirmwareVersion(firmwareVersion, firmwareDescription);

  const maxPacketLength = PACKET_LENGTH_VERSIONS[PACKET_LENGTH_VERSIONS.length - 1].packetLength;
  const packet = new Uint8Array(maxPacketLength);
  let index = 0;

  writeLittleEndianBytes(packet, index, 4, Math.round(sendTime.valueOf() / 1000));
  index += 4;

  packet[index++] = config.gain & 0xff;

  const useOldConfigurations = isOlderVersion(version, 1, 4, 4) && config.sampleRateIndex < 3;
  const sampleRateConfiguration = (useOldConfigurations ? OLD_CONFIGURATIONS : CONFIGURATIONS)[config.sampleRateIndex];

  packet[index++] = sampleRateConfiguration.clockDivider;
  packet[index++] = sampleRateConfiguration.acquisitionCycles;
  packet[index++] = sampleRateConfiguration.oversampleRate;

  writeLittleEndianBytes(packet, index, 4, sampleRateConfiguration.sampleRate);
  index += 4;

  packet[index++] = sampleRateConfiguration.sampleRateDivider;

  writeLittleEndianBytes(packet, index, 2, config.sleepDuration);
  index += 2;

  writeLittleEndianBytes(packet, index, 2, config.recordDuration);
  index += 2;

  packet[index++] = config.ledEnabled ? 1 : 0;

  /* Normal (non-sun) schedule */

  const splitWrapped = isOlderVersion(version, 1, 9, 0);
  const timePeriods = normalisePeriods(config.timePeriods, splitWrapped);

  packet[index++] = timePeriods.length;

  for (const period of timePeriods) {
    writeLittleEndianBytes(packet, index, 2, period.startMins);
    index += 2;
    writeLittleEndianBytes(packet, index, 2, period.endMins === 0 ? MINUTES_IN_DAY : period.endMins);
    index += 2;
  }

  for (let i = 0; i < MAX_PERIODS + 1 - timePeriods.length; i += 1) {
    writeLittleEndianBytes(packet, index, 2, 0);
    index += 2;
    writeLittleEndianBytes(packet, index, 2, 0);
    index += 2;
  }

  const timeZoneOffset = config.timeZoneOffsetMinutes;
  const offsetHours = timeZoneOffset < 0 ? Math.ceil(timeZoneOffset / MINUTES_IN_HOUR) : Math.floor(timeZoneOffset / MINUTES_IN_HOUR);
  const offsetMins = timeZoneOffset % MINUTES_IN_HOUR;

  packet[index++] = offsetHours & 0xff;

  /* Low voltage cut-off is always enabled */
  packet[index++] = 1;

  /* packedValue1: bit 0 = battery level indication DISABLED, plus chime/prep-time extras on fw ≥ 1.12.0 */
  let packedValue1 = config.batteryLevelCheckEnabled ? 0 : 1;
  if (!isOlderVersion(version, 1, 12, 0)) {
    if (config.requireAcousticConfig) {
      packedValue1 |= config.requireLocationInChime ? 1 << 1 : 0;
    }
    packedValue1 |= config.useTimeZoneInChime ? 1 << 2 : 0;
    if (config.useTimeZoneInChime) {
      packedValue1 |= config.adjustScheduleUsingTimezoneFromAcousticChime ? 1 << 3 : 0;
    }
    const prerecordingPrepTime = config.extendPrepTime ? 10 : 2;
    packedValue1 |= (prerecordingPrepTime & 0b1111) << 4;
  }
  packet[index++] = packedValue1;

  packet[index++] = offsetMins & 0xff;

  /* packedValue2: bit 0 = duty cycle DISABLED, bit 1 = filename includes device ID, GPS fix options, external mic */
  let packedValue2 = config.dutyEnabled ? 0 : 1;
  if (!isOlderVersion(version, 1, 11, 0)) {
    packedValue2 |= config.filenameWithDeviceIDEnabled ? 1 << 1 : 0;
    if (config.timeSettingFromGPSEnabled) {
      packedValue2 |= config.acquireGpsFixBeforeAfter === "individual" ? 1 << 2 : 0;
      packedValue2 |= (config.gpsFixTime & 0b1111) << 3;
    }
  }
  if (!isOlderVersion(version, 1, 12, 0)) {
    packedValue2 |= config.ignoreExternalMicrophoneForAcousticChime ? 1 << 7 : 0;
  }
  packet[index++] = packedValue2;

  /* First/last recording dates */

  let earliestRecordingTime = 0;
  if (config.firstRecordingDate) {
    const [year, month, day] = config.firstRecordingDate.split("-").map((value) => parseInt(value, 10));
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      earliestRecordingTime = Date.UTC(year, month - 1, day, 0, 0, 0, 0) / 1000 - timeZoneOffset * SECONDS_IN_MINUTE;
    }
  }

  let latestRecordingTime = 0;
  if (config.lastRecordingDate) {
    const [year, month, day] = config.lastRecordingDate.split("-").map((value) => parseInt(value, 10));
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      latestRecordingTime = Date.UTC(year, month - 1, day, 0, 0, 0, 0) / 1000 + SECONDS_IN_DAY - timeZoneOffset * SECONDS_IN_MINUTE;
    }
  }

  writeLittleEndianBytes(packet, index, 4, Math.min(UINT32_MAX, Math.max(0, earliestRecordingTime)));
  index += 4;
  writeLittleEndianBytes(packet, index, 4, Math.min(UINT32_MAX, Math.max(0, latestRecordingTime)));
  index += 4;

  /* Band/low/high-pass filter */

  let lowerFilter = 0;
  let higherFilter = 0;

  switch (config.filterType) {
    case "low":
      lowerFilter = UINT16_MAX;
      higherFilter = Math.round(config.higherFilterHz / 100);
      break;
    case "band":
      lowerFilter = Math.round(config.lowerFilterHz / 100);
      higherFilter = Math.round(config.higherFilterHz / 100);
      break;
    case "high":
      lowerFilter = Math.round(config.lowerFilterHz / 100);
      higherFilter = UINT16_MAX;
      break;
    case "none":
      break;
  }

  writeLittleEndianBytes(packet, index, 2, lowerFilter);
  index += 2;
  writeLittleEndianBytes(packet, index, 2, higherFilter);
  index += 2;

  /* Amplitude threshold / frequency trigger union — disabled */
  writeLittleEndianBytes(packet, index, 2, 0);
  index += 2;

  /* packedValue3: acoustic chime requirement, voltage range display; no minimum trigger duration (triggers off) */
  let packedValue3 = config.requireAcousticConfig ? 1 : 0;
  packedValue3 |= config.displayVoltageRange ? 1 << 1 : 0;
  packet[index++] = packedValue3;

  /* packedValue4/5 (or 6/7): threshold scales — disabled */
  packet[index++] = 0;
  packet[index++] = 0;

  /* packedValue8: misc flags */
  let packedValue8 = config.energySaverModeEnabled ? 1 : 0;
  packedValue8 |= config.disable48DCFilter ? 1 << 1 : 0;
  packedValue8 |= config.timeSettingFromGPSEnabled ? 1 << 2 : 0;
  packedValue8 |= config.magneticSwitchEnabled ? 1 << 3 : 0;
  packedValue8 |= config.lowGainRangeEnabled ? 1 << 4 : 0;
  packedValue8 |= config.dailyFolders ? 1 << 6 : 0;
  packet[index++] = packedValue8;

  const verifyLength = (echoLength: number) => {
    let packetLength = Math.min(packet.length, echoLength);
    for (const entry of PACKET_LENGTH_VERSIONS) {
      if (isOlderVersion(version, entry.firmwareVersion[0], entry.firmwareVersion[1], entry.firmwareVersion[2])) break;
      packetLength = entry.packetLength;
    }
    return packetLength;
  };

  return { packet, verifyLength };
}
