import { describe, expect, it } from "vitest";
import {
  buildConfigPacket,
  classifyFirmware,
  CONFIGURATIONS,
  DEFAULT_CONFIG,
  getEffectiveFirmwareVersion,
  MINUTES_IN_DAY,
  type AudioMothConfig,
} from "./config";

const OFFICIAL = "AudioMoth-Firmware-Basic";

function readUint16(packet: Uint8Array, offset: number): number {
  return packet[offset] + (packet[offset + 1] << 8);
}

function readUint32(packet: Uint8Array, offset: number): number {
  return packet[offset] + (packet[offset + 1] << 8) + (packet[offset + 2] << 16) + packet[offset + 3] * 2 ** 24;
}

describe("buildConfigPacket", () => {
  const baseConfig: AudioMothConfig = {
    ...DEFAULT_CONFIG,
    gain: 2,
    sampleRateIndex: 3, // 48 kHz
    sleepDuration: 5,
    recordDuration: 55,
    dutyEnabled: true,
    ledEnabled: true,
    batteryLevelCheckEnabled: true,
    timePeriods: [{ startMins: 60, endMins: 120 }],
    timeZoneOffsetMinutes: 0,
  };

  const sendTime = new Date("2026-07-06T12:00:00.000Z");

  it("produces a 62-byte packet with the expected layout", () => {
    const { packet } = buildConfigPacket(baseConfig, [1, 12, 0], OFFICIAL, sendTime);

    expect(packet.length).toBe(62);

    /* time */
    expect(readUint32(packet, 0)).toBe(Math.round(sendTime.valueOf() / 1000));

    /* gain + sample rate block */
    expect(packet[4]).toBe(2);
    expect(packet[5]).toBe(CONFIGURATIONS[3].clockDivider);
    expect(packet[6]).toBe(CONFIGURATIONS[3].acquisitionCycles);
    expect(packet[7]).toBe(CONFIGURATIONS[3].oversampleRate);
    expect(readUint32(packet, 8)).toBe(384000);
    expect(packet[12]).toBe(CONFIGURATIONS[3].sampleRateDivider);

    /* durations */
    expect(readUint16(packet, 13)).toBe(5);
    expect(readUint16(packet, 15)).toBe(55);

    /* LED + schedule */
    expect(packet[17]).toBe(1);
    expect(packet[18]).toBe(1); // one period
    expect(readUint16(packet, 19)).toBe(60);
    expect(readUint16(packet, 21)).toBe(120);
    expect(readUint16(packet, 23)).toBe(0); // padding

    /* timezone, low voltage cutoff, battery level */
    expect(packet[39]).toBe(0);
    expect(packet[40]).toBe(1);
    /* battery indication enabled → bit 0 clear; default 2s prep time in bits 4-7 (fw ≥ 1.12.0) */
    expect(packet[41]).toBe(2 << 4);
    expect(packet[42]).toBe(0);
    expect(packet[43] & 1).toBe(0); // duty cycle enabled → "disabled" bit clear

    /* no start/end dates */
    expect(readUint32(packet, 44)).toBe(0);
    expect(readUint32(packet, 48)).toBe(0);

    /* no filters or triggers */
    expect(readUint16(packet, 52)).toBe(0);
    expect(readUint16(packet, 54)).toBe(0);
    expect(readUint16(packet, 56)).toBe(0);
    expect(packet[58]).toBe(0); // no chime requirement, no voltage range display
    expect(packet[61]).toBe(0);
  });

  it("omits prep time and chime bits for firmware older than 1.12.0", () => {
    const { packet } = buildConfigPacket(
      { ...baseConfig, requireAcousticConfig: true, requireLocationInChime: true, useTimeZoneInChime: true },
      [1, 11, 0],
      OFFICIAL,
      sendTime,
    );
    expect(packet[41]).toBe(0); // packedValue1 extras gated to 1.12.0+
    expect(packet[58]).toBe(1); // requireAcousticConfig itself is always written
  });

  it("packs the acoustic chime options", () => {
    const { packet } = buildConfigPacket(
      {
        ...baseConfig,
        requireAcousticConfig: true,
        requireLocationInChime: true,
        useTimeZoneInChime: true,
        adjustScheduleUsingTimezoneFromAcousticChime: true,
        extendPrepTime: true,
        ignoreExternalMicrophoneForAcousticChime: true,
        displayVoltageRange: true,
      },
      [1, 12, 0],
      OFFICIAL,
      sendTime,
    );
    /* packedValue1: location bit1, tz bit2, adjust bit3, prep time 10 in bits 4-7 */
    expect(packet[41]).toBe((1 << 1) | (1 << 2) | (1 << 3) | (10 << 4));
    /* packedValue2: external mic bit 7 */
    expect(packet[43] & (1 << 7)).toBe(1 << 7);
    /* packedValue3: chime required bit 0, voltage range bit 1 */
    expect(packet[58]).toBe(0b11);
  });

  it("only packs dependent chime bits when their parents are enabled", () => {
    const { packet } = buildConfigPacket(
      {
        ...baseConfig,
        requireAcousticConfig: false,
        requireLocationInChime: true,
        useTimeZoneInChime: false,
        adjustScheduleUsingTimezoneFromAcousticChime: true,
      },
      [1, 12, 0],
      OFFICIAL,
      sendTime,
    );
    expect(packet[41]).toBe(2 << 4); // only the default prep time survives
    expect(packet[58]).toBe(0);
  });

  it("packs GPS options into packedValue2 and packedValue8", () => {
    const { packet } = buildConfigPacket(
      {
        ...baseConfig,
        timeSettingFromGPSEnabled: true,
        acquireGpsFixBeforeAfter: "individual",
        gpsFixTime: 5,
        magneticSwitchEnabled: true,
        lowGainRangeEnabled: true,
      },
      [1, 12, 0],
      OFFICIAL,
      sendTime,
    );
    expect(packet[43] & (1 << 2)).toBe(1 << 2); // individual fix mode
    expect((packet[43] >> 3) & 0b1111).toBe(5); // fix time
    expect(packet[61]).toBe((1 << 2) | (1 << 3) | (1 << 4)); // gps + magnetic + low gain
  });

  it("omits GPS fix options for firmware older than 1.11.0", () => {
    const { packet } = buildConfigPacket(
      { ...baseConfig, timeSettingFromGPSEnabled: true, acquireGpsFixBeforeAfter: "individual", gpsFixTime: 5 },
      [1, 10, 0],
      OFFICIAL,
      sendTime,
    );
    expect(packet[43]).toBe(0); // duty enabled, no GPS bits on old firmware
    expect(packet[61] & (1 << 2)).toBe(1 << 2); // GPS enable flag itself is always written
  });

  it("encodes duty cycle disabled and battery indication disabled as set bits", () => {
    const { packet } = buildConfigPacket(
      { ...baseConfig, dutyEnabled: false, batteryLevelCheckEnabled: false },
      [1, 12, 0],
      OFFICIAL,
      sendTime,
    );
    expect(packet[41] & 1).toBe(1);
    expect(packet[43] & 1).toBe(1);
  });

  it("encodes band-pass filters in units of 100 Hz", () => {
    const { packet } = buildConfigPacket(
      { ...baseConfig, filterType: "band", lowerFilterHz: 6000, higherFilterHz: 18000 },
      [1, 12, 0],
      OFFICIAL,
      sendTime,
    );
    expect(readUint16(packet, 52)).toBe(60);
    expect(readUint16(packet, 54)).toBe(180);
  });

  it("encodes low-pass as UINT16_MAX lower bound", () => {
    const { packet } = buildConfigPacket(
      { ...baseConfig, filterType: "low", higherFilterHz: 18000 },
      [1, 12, 0],
      OFFICIAL,
      sendTime,
    );
    expect(readUint16(packet, 52)).toBe(0xffff);
    expect(readUint16(packet, 54)).toBe(180);
  });

  it("packs misc flags into the final byte", () => {
    const { packet } = buildConfigPacket(
      { ...baseConfig, energySaverModeEnabled: true, disable48DCFilter: true, dailyFolders: true },
      [1, 12, 0],
      OFFICIAL,
      sendTime,
    );
    expect(packet[61]).toBe(0b01000011);
  });

  it("splits periods wrapping past midnight for firmware older than 1.9.0", () => {
    const { packet } = buildConfigPacket(
      { ...baseConfig, timePeriods: [{ startMins: 1380, endMins: 120 }] },
      [1, 8, 1],
      OFFICIAL,
      sendTime,
    );
    expect(packet[18]).toBe(2);
    /* periods are sorted by start */
    expect(readUint16(packet, 19)).toBe(0);
    expect(readUint16(packet, 21)).toBe(120);
    expect(readUint16(packet, 23)).toBe(1380);
    expect(readUint16(packet, 25)).toBe(MINUTES_IN_DAY);
  });

  it("keeps wrapping periods intact on 1.9.0+", () => {
    const { packet } = buildConfigPacket(
      { ...baseConfig, timePeriods: [{ startMins: 1380, endMins: 120 }] },
      [1, 12, 0],
      OFFICIAL,
      sendTime,
    );
    expect(packet[18]).toBe(1);
    expect(readUint16(packet, 19)).toBe(1380);
    expect(readUint16(packet, 21)).toBe(120);
  });

  it("uses the reduced sample-rate table for firmware older than 1.4.4", () => {
    const { packet } = buildConfigPacket({ ...baseConfig, sampleRateIndex: 0 }, [1, 4, 0], OFFICIAL, sendTime);
    expect(readUint32(packet, 8)).toBe(128000);
    expect(packet[12]).toBe(16);
  });

  it("writes timezone offsets including negative hours", () => {
    const { packet } = buildConfigPacket({ ...baseConfig, timeZoneOffsetMinutes: -270 }, [1, 12, 0], OFFICIAL, sendTime);
    expect(packet[39]).toBe(0x100 - 4); // -4 hours, two's complement
    expect(packet[42]).toBe(0x100 - 30); // -30 minutes, two's complement
  });

  it("reports version-appropriate verification lengths", () => {
    const modern = buildConfigPacket(baseConfig, [1, 12, 0], OFFICIAL, sendTime);
    expect(modern.verifyLength(63)).toBe(62);

    const legacy = buildConfigPacket(baseConfig, [1, 4, 2], OFFICIAL, sendTime);
    expect(legacy.verifyLength(63)).toBe(58);
  });
});

describe("firmware classification", () => {
  it("classifies official, RC, equivalent and custom firmware", () => {
    expect(classifyFirmware("AudioMoth-Firmware-Basic")).toBe("official");
    expect(classifyFirmware("AudioMoth-Firmware-Basic-RC2")).toBe("release-candidate");
    expect(classifyFirmware("Custom-Firmware-E1.8.0")).toBe("custom-equivalent");
    expect(classifyFirmware("SomethingElse")).toBe("unsupported");
  });

  it("resolves effective versions", () => {
    expect(getEffectiveFirmwareVersion([1, 5, 0], "AudioMoth-Firmware-Basic")).toEqual([1, 5, 0]);
    expect(getEffectiveFirmwareVersion([0, 9, 9], "Custom-Firmware-E1.8.0")).toEqual([1, 8, 0]);
    expect(getEffectiveFirmwareVersion([0, 1, 0], "SomethingElse")).toEqual([1, 12, 0]);
  });
});
