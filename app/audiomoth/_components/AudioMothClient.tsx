"use client";

/**
 * Unified AudioMoth tool: the web equivalent of the official Time,
 * Configuration and Flash desktop apps in one page. Talks to an AudioMoth in
 * USB/OFF mode over WebHID (Chrome/Edge) and to the serial bootloader over
 * WebSerial when older devices need a firmware update.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArchiveIcon,
  AudioLinesIcon,
  BatteryMediumIcon,
  CheckIcon,
  ClockIcon,
  CpuIcon,
  DownloadIcon,
  FingerprintIcon,
  HardDriveUploadIcon,
  Loader2Icon,
  TagsIcon,
  MapPinIcon,
  MinusIcon,
  PlugZapIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  UsbIcon,
  WandSparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  AUDIOMOTH_SERIAL_USB_IDS,
  AudioMothDevice,
  getWebHid,
  isAudioMothHidDevice,
  withRetries,
  type WebHidDevice,
} from "@/app/_lib/audiomoth/protocol";
import {
  buildConfigPacket,
  classifyFirmware,
  CONFIGURATIONS,
  DEFAULT_CONFIG,
  gainforestSetupConfig,
  isOlderVersion,
  LATEST_FIRMWARE_VERSION,
  matchesGainForestSetup,
  MAX_PERIODS,
  MAX_RECORD_DURATION,
  MAX_SLEEP_DURATION,
  MINUTES_IN_DAY,
  VALID_GPS_FIX_TIMES,
  type AudioMothConfig,
  type FilterType,
  type GpsFixMode,
  type TimePeriod,
} from "@/app/_lib/audiomoth/config";
import {
  flashViaSerial,
  flashViaUsbHid,
  getWebSerial,
  looksLikeAudioMothFirmware,
  type FlashProgress,
} from "@/app/_lib/audiomoth/flash";
import Link from "next/link";
import { createEquipment, equipmentDetailPath, listEquipment, updateEquipment, type EquipmentItem } from "@/app/_lib/equipment";
import { loadAppliedConfig, mergeSetupNotes, saveAppliedConfig, SETUP_NOTES_HEADER } from "@/app/_lib/audiomoth/setup-store";
import { DeploymentsTab } from "./DeploymentsTab";
import { UploadTab } from "./UploadTab";
import { LabelTab } from "./LabelTab";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type MainTabId = "setup" | "deployments" | "upload" | "label";

type TabId = "device" | "configure" | "firmware";

interface DeviceInfo {
  id: string;
  firmwareVersion: [number, number, number];
  firmwareDescription: string;
  supportsUsbHidFlash: boolean;
  supportsSerialBootloaderSwitch: boolean;
}

interface LiveReading {
  time: Date;
  battery: string;
}

interface FirmwareRelease {
  version: string;
  publishedAt: string;
  assetId: number;
  assetName: string;
  sizeBytes: number;
}

type FlashSource = { kind: "release"; release: FirmwareRelease } | { kind: "local"; name: string; data: Uint8Array };

type FlashState =
  | { stage: "idle" }
  | { stage: "running"; progress: FlashProgress }
  | { stage: "awaiting-serial" }
  | { stage: "done"; crc: string }
  | { stage: "error"; message: string };

/* ---------------- auto-setup wizard ---------------- */

const WIZARD_STEP_IDS = ["firmware", "clock", "settings", "equipment"] as const;

type WizardStepId = (typeof WIZARD_STEP_IDS)[number];

type WizardStepStatus = "pending" | "active" | "done" | "skipped" | "error";

interface WizardStepState {
  status: WizardStepStatus;
  detail?: string;
  /** 0-1 progress bar shown while the step is active, when known. */
  progress?: number | null;
}

interface WizardState {
  running: boolean;
  failed: boolean;
  steps: Record<WizardStepId, WizardStepState>;
}

function freshWizardState(): WizardState {
  return {
    running: true,
    failed: false,
    steps: {
      firmware: { status: "pending" },
      clock: { status: "pending" },
      settings: { status: "pending" },
      equipment: { status: "pending" },
    },
  };
}

/* ---------------- GainForest setup check ---------------- */

interface SetupCheck {
  status: "checking" | "ready" | "not-ready" | "unknown";
  firmwareOk: boolean | null;
  settingsOk: boolean | null;
}

type EquipmentStatus =
  | { status: "unknown" }
  | { status: "checking" }
  | { status: "registered"; item: EquipmentItem }
  | { status: "unregistered" };

/**
 * Compare the connected device against the one-click GainForest setup:
 * newest official firmware + the GainForest recording configuration.
 *
 * The device cannot report its configuration back over USB, so the settings
 * verdict comes from the configuration last written to this unit from this
 * browser (see setup-store). No record → the settings were never applied
 * here, which counts as not set up.
 */
async function evaluateGainForestSetup(info: DeviceInfo): Promise<SetupCheck> {
  let firmwareOk: boolean | null = null;
  try {
    const response = await fetch("/api/audiomoth/firmware");
    if (response.ok) {
      const { releases } = (await response.json()) as { releases: FirmwareRelease[] };
      const newest = releases[0] ? parseVersionString(releases[0].version) : null;
      if (newest) {
        firmwareOk =
          classifyFirmware(info.firmwareDescription) === "official" &&
          !isOlderVersion(info.firmwareVersion, ...newest);
      }
    }
  } catch {
    /* release roster unreachable — leave firmware verdict open */
  }

  const applied = loadAppliedConfig(info.id);
  const settingsOk = applied
    ? matchesGainForestSetup(applied.config, info.firmwareVersion, info.firmwareDescription)
    : null;

  const status: SetupCheck["status"] =
    firmwareOk === false || settingsOk !== true ? "not-ready" : "ready";

  return { status, firmwareOk, settingsOk };
}



/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function minutesToTimeString(minutes: number): string {
  const clamped = ((Math.round(minutes) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function timeStringToMinutes(value: string): number {
  const [hh, mm] = value.split(":").map((part) => parseInt(part, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return (hh * 60 + mm) % MINUTES_IN_DAY;
}

function formatUtc(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} ` +
    `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} UTC`
  );
}

/** Read the static device details (ID, firmware, flash capabilities). */
async function readDeviceInfo(device: AudioMothDevice): Promise<DeviceInfo> {
  const id = await withRetries(() => device.getId());
  const firmwareVersion = await withRetries(() => device.getFirmwareVersion());
  const firmwareDescription = await withRetries(() => device.getFirmwareDescription());
  let supportsUsbHidFlash = false;
  let supportsSerialBootloaderSwitch = false;
  try {
    supportsUsbHidFlash = await device.queryUsbHidBootloaderSupport();
  } catch {
    /* older firmware does not answer */
  }
  try {
    supportsSerialBootloaderSwitch = await device.querylSerialBootloaderSupport();
  } catch {
    /* older firmware does not answer */
  }
  return { id, firmwareVersion, firmwareDescription, supportsUsbHidFlash, supportsSerialBootloaderSwitch };
}

/** Wait for an (already-permitted) AudioMoth to enumerate and respond, e.g. after a firmware restart. */
async function waitForAudioMoth(timeoutMs: number): Promise<AudioMothDevice> {
  const hid = getWebHid();
  if (!hid) throw new Error("WebHID unavailable");
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const devices = await hid.getDevices().catch(() => [] as WebHidDevice[]);
    const target = devices.find(isAudioMothHidDevice);
    if (target) {
      const wrapper = new AudioMothDevice(target);
      try {
        await wrapper.open();
        await wrapper.getId();
        return wrapper;
      } catch {
        await wrapper.close();
      }
    }
    if (Date.now() >= deadline) throw new Error("The AudioMoth did not reappear after restarting.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function parseVersionString(value: string): [number, number, number] | null {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-border bg-card/90 p-5 shadow-sm backdrop-blur-sm sm:p-6", className)}>
      {children}
    </section>
  );
}

function InfoRow({ label, value, dimmed }: { label: string; value: string; dimmed?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-right font-mono text-sm", dimmed && "text-muted-foreground/60")}>{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function AudioMothClient({
  sessionDid,
  canUseLabelling,
}: {
  sessionDid: string | null;
  canUseLabelling: boolean;
}) {
  const t = useTranslations("common.audiomoth");

  const [supported, setSupported] = useState<boolean | null>(null);
  const [device, setDevice] = useState<AudioMothDevice | null>(null);
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [reading, setReading] = useState<LiveReading | null>(null);
  const searchParams = useSearchParams();
  const [mainTab, setMainTab] = useState<MainTabId>(() => {
    const tab = searchParams.get("tab");
    if (tab === "label") return canUseLabelling ? "label" : "setup";
    return tab === "deployments" || tab === "upload" ? tab : "setup";
  });
  const [tab, setTab] = useState<TabId>("firmware");
  const [connecting, setConnecting] = useState(false);
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [setupCheck, setSetupCheck] = useState<SetupCheck | null>(null);
  const [equipmentStatus, setEquipmentStatus] = useState<EquipmentStatus>({ status: "unknown" });
  const [savingEquipment, setSavingEquipment] = useState(false);
  const [recheckCounter, setRecheckCounter] = useState(0);

  const requestSetupRecheck = useCallback(() => setRecheckCounter((value) => value + 1), []);

  const deviceRef = useRef<AudioMothDevice | null>(null);
  deviceRef.current = device;

  /* While the auto-setup wizard is driving the device (including across the
     firmware restart) the passive auto-adoption below must stay out of the
     way, so the wizard's device wrapper is the only one issuing reports. */
  const wizardActiveRef = useRef(false);

  /* ---------------- detection ---------------- */

  const adoptDevice = useCallback(async (hidDevice: WebHidDevice) => {
    if (wizardActiveRef.current) return;
    const wrapper = new AudioMothDevice(hidDevice);
    try {
      await wrapper.open();
    } catch {
      return;
    }

    setDevice((current) => {
      if (current) return current;
      return wrapper;
    });
  }, []);

  useEffect(() => {
    const hid = getWebHid();
    setSupported(hid !== null);
    if (!hid) return;

    let cancelled = false;

    /* Pick up devices the user has already granted access to */
    hid
      .getDevices()
      .then((devices) => {
        if (cancelled) return;
        const audioMoth = devices.find(isAudioMothHidDevice);
        if (audioMoth) void adoptDevice(audioMoth);
      })
      .catch(() => undefined);

    const onConnect = (event: { device: WebHidDevice }) => {
      if (isAudioMothHidDevice(event.device)) void adoptDevice(event.device);
    };

    const onDisconnect = (event: { device: WebHidDevice }) => {
      if (deviceRef.current && event.device === deviceRef.current.device) {
        setDevice(null);
        setInfo(null);
        setReading(null);
      }
    };

    hid.addEventListener("connect", onConnect);
    hid.addEventListener("disconnect", onDisconnect);

    return () => {
      cancelled = true;
      hid.removeEventListener("connect", onConnect);
      hid.removeEventListener("disconnect", onDisconnect);
    };
  }, [adoptDevice]);

  const requestDevice = useCallback(async () => {
    const hid = getWebHid();
    if (!hid) return;
    setConnecting(true);
    try {
      const devices = await hid.requestDevice({
        filters: [{ vendorId: 0x10c4, productId: 0x0002 }],
      });
      const audioMoth = devices.find(isAudioMothHidDevice);
      if (audioMoth) await adoptDevice(audioMoth);
    } catch {
      /* user dismissed the picker */
    } finally {
      setConnecting(false);
    }
  }, [adoptDevice]);

  /* ---------------- static info on connect ---------------- */

  useEffect(() => {
    if (!device) return;
    let cancelled = false;

    (async () => {
      try {
        const nextInfo = await readDeviceInfo(device);
        if (!cancelled) setInfo(nextInfo);
      } catch {
        if (!cancelled) setInfo(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [device]);

  /* ---------------- live polling ---------------- */

  const pollingPausedRef = useRef(false);

  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled) return;
      if (!pollingPausedRef.current) {
        try {
          const time = await device.getTime();
          const battery = await device.getBatteryState();
          if (!cancelled && !pollingPausedRef.current) setReading({ time, battery });
        } catch {
          if (!cancelled) setReading(null);
        }
      }
      if (!cancelled) timer = setTimeout(poll, 1000);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [device]);

  /* ---------------- GainForest setup check ---------------- */

  useEffect(() => {
    if (!device || !info) {
      setSetupCheck(null);
      return;
    }
    /* While the wizard is driving the device, hold off — finish() re-triggers via recheckCounter. */
    if (wizardActiveRef.current) return;

    let cancelled = false;
    setSetupCheck({ status: "checking", firmwareOk: null, settingsOk: null });

    (async () => {
      const result = await evaluateGainForestSetup(info);
      if (!cancelled) setSetupCheck(result);
    })();

    return () => {
      cancelled = true;
    };
  }, [device, info, recheckCounter]);

  /* ---------------- equipment registration ---------------- */

  useEffect(() => {
    if (!info || !sessionDid) {
      setEquipmentStatus({ status: "unknown" });
      return;
    }
    if (wizardActiveRef.current) return;

    let cancelled = false;
    setEquipmentStatus({ status: "checking" });

    (async () => {
      try {
        const items = await listEquipment(sessionDid);
        if (cancelled) return;
        const existing = items.find((item) => item.assetId.trim().toUpperCase() === info.id.toUpperCase());
        setEquipmentStatus(existing ? { status: "registered", item: existing } : { status: "unregistered" });
      } catch {
        if (!cancelled) setEquipmentStatus({ status: "unknown" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [info, sessionDid, recheckCounter]);

  /** Compose the auto-generated notes block written into equipment records. */
  const composeNotesBlock = useCallback(
    (deviceInfo: DeviceInfo, battery: string | null, setupDate: Date | null) => {
      const firmwareLabel = `${deviceInfo.firmwareDescription} ${deviceInfo.firmwareVersion.join(".")}`;
      const applied = setupDate === null ? loadAppliedConfig(deviceInfo.id) : null;
      const appliedIsGainForest =
        applied !== null &&
        matchesGainForestSetup(applied.config, deviceInfo.firmwareVersion, deviceInfo.firmwareDescription);
      const lastSetup = setupDate ?? (applied ? new Date(applied.appliedAt) : null);
      const includeSettings = setupDate !== null || appliedIsGainForest;

      const lines = [
        SETUP_NOTES_HEADER,
        t("autoSetup.notesDeviceId", { id: deviceInfo.id }),
        t("autoSetup.notesFirmware", { firmware: firmwareLabel }),
      ];
      if (includeSettings) lines.push(t("autoSetup.notesSettings", { settings: t("autoSetup.settingsDone") }));
      if (battery) lines.push(t("autoSetup.notesBattery", { battery }));
      if (lastSetup && !Number.isNaN(lastSetup.valueOf())) {
        const iso = lastSetup.toISOString();
        lines.push(t("autoSetup.notesLastSetup", { date: `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` }));
      }
      return lines.join("\n");
    },
    [t],
  );

  /** Manually register the connected device in the user's equipment list. */
  const saveToEquipment = useCallback(async () => {
    if (!device || !info || !sessionDid) return;
    setSavingEquipment(true);
    try {
      let battery: string | null = null;
      try {
        battery = await withRetries(() => device.getBatteryState());
      } catch {
        /* battery is nice-to-have */
      }
      const name = `AudioMoth ${info.id.slice(-4)}`;
      await createEquipment({
        assetId: info.id,
        name,
        category: "audiomoth",
        status: "storage",
        acquiredAt: new Date().toISOString().slice(0, 10),
        notes: composeNotesBlock(info, battery, null),
      });
      requestSetupRecheck();
    } catch {
      /* the status chip simply stays on "save" — the user can retry */
    } finally {
      setSavingEquipment(false);
    }
  }, [composeNotesBlock, device, info, requestSetupRecheck, sessionDid]);

  /* ---------------- auto-setup wizard ---------------- */

  const runAutoSetup = useCallback(async () => {
    if (!device || !info) return;

    let workingDevice = device;
    let workingInfo = info;

    pollingPausedRef.current = true;
    wizardActiveRef.current = true;
    setWizard(freshWizardState());

    const setStep = (id: WizardStepId, patch: Partial<WizardStepState>) => {
      setWizard((current) =>
        current
          ? { ...current, steps: { ...current.steps, [id]: { ...current.steps[id], ...patch } } }
          : current,
      );
    };

    const finish = (failed: boolean) => {
      wizardActiveRef.current = false;
      pollingPausedRef.current = false;
      setWizard((current) => (current ? { ...current, running: false, failed } : current));
      /* If the page lost the device during the firmware restart, pick it up again */
      if (!deviceRef.current) {
        getWebHid()
          ?.getDevices()
          .then((devices) => {
            const audioMoth = devices.find(isAudioMothHidDevice);
            if (audioMoth) void adoptDevice(audioMoth);
          })
          .catch(() => undefined);
      }
      /* Re-evaluate the GainForest setup badge with the fresh state */
      requestSetupRecheck();
    };

    const fail = (id: WizardStepId, detail: string) => {
      setStep(id, { status: "error", detail, progress: null });
      finish(true);
    };

    /* Step 1 — firmware: bring the device to the newest official release */

    setStep("firmware", { status: "active", detail: t("autoSetup.firmwareChecking") });

    try {
      const response = await fetch("/api/audiomoth/firmware");
      if (!response.ok) throw new Error("releases unavailable");
      const { releases } = (await response.json()) as { releases: FirmwareRelease[] };
      const newest = releases[0];
      const newestVersion = newest ? parseVersionString(newest.version) : null;
      if (!newest || !newestVersion) throw new Error("releases unavailable");

      const isOfficial = classifyFirmware(workingInfo.firmwareDescription) === "official";
      const alreadyNewest = isOfficial && !isOlderVersion(workingInfo.firmwareVersion, ...newestVersion);

      if (alreadyNewest) {
        setStep("firmware", {
          status: "done",
          detail: t("autoSetup.firmwareUpToDate", { version: workingInfo.firmwareVersion.join(".") }),
        });
      } else if (!workingInfo.supportsUsbHidFlash) {
        /* Serial-only devices need a user gesture per port — leave it to the Firmware tab. */
        setStep("firmware", { status: "skipped", detail: t("autoSetup.firmwareManualSkip") });
      } else {
        setStep("firmware", { status: "active", detail: t("autoSetup.firmwareDownloading", { version: newest.version }) });

        const download = await fetch(`/api/audiomoth/firmware?download=${newest.assetId}`);
        if (!download.ok) throw new Error("download failed");
        const firmware = new Uint8Array(await download.arrayBuffer());
        if (!looksLikeAudioMothFirmware(firmware)) throw new Error("invalid firmware");

        await flashViaUsbHid(workingDevice, firmware, false, (progress) => {
          const detailKeys: Record<FlashProgress["phase"], string> = {
            preparing: "firmware.phasePreparing",
            transferring: "firmware.phaseTransferring",
            verifying: "firmware.phaseVerifying",
            flashing: "firmware.phaseFlashing",
            restarting: "firmware.phaseRestarting",
          };
          setStep("firmware", {
            detail: t(detailKeys[progress.phase]),
            progress: progress.phase === "transferring" ? progress.fraction : null,
          });
        });

        /* The device restarts and re-enumerates — pick it up again */
        setStep("firmware", { detail: t("firmware.phaseRestarting"), progress: null });
        await workingDevice.close().catch(() => undefined);
        workingDevice = await waitForAudioMoth(30000);
        workingInfo = await readDeviceInfo(workingDevice);
        setDevice(workingDevice);
        setInfo(workingInfo);

        setStep("firmware", {
          status: "done",
          detail: t("autoSetup.firmwareUpdated", { version: workingInfo.firmwareVersion.join(".") }),
          progress: null,
        });
      }
    } catch {
      fail("firmware", t("autoSetup.firmwareFailed"));
      return;
    }

    /* Step 2 — clock: set the device time from this computer */

    setStep("clock", { status: "active", detail: t("autoSetup.clockSetting") });

    try {
      const sendTime = new Date();
      let delayMs = 1000 - sendTime.getMilliseconds();
      if (delayMs < 100) delayMs += 1000;
      sendTime.setMilliseconds(sendTime.getMilliseconds() + delayMs);
      const waitMs = sendTime.getTime() - Date.now() - 20;
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      await withRetries(() => workingDevice.setTime(sendTime));
      setStep("clock", { status: "done", detail: t("autoSetup.clockDone") });
    } catch {
      fail("clock", t("autoSetup.clockFailed"));
      return;
    }

    /* Step 3 — recording settings: defaults + 60 s / 4 min duty cycle + required chime */

    setStep("settings", { status: "active", detail: t("autoSetup.settingsApplying") });

    try {
      const sendTime = new Date();
      let delayMs = 1000 - sendTime.getMilliseconds();
      if (delayMs < 100) delayMs += 1000;
      sendTime.setMilliseconds(sendTime.getMilliseconds() + delayMs);

      const { packet, verifyLength } = buildConfigPacket(
        gainforestSetupConfig(),
        workingInfo.firmwareVersion,
        workingInfo.firmwareDescription,
        sendTime,
      );

      const waitMs = sendTime.getTime() - Date.now() - 20;
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

      const echo = await withRetries(() => workingDevice.setPacket(packet));
      const compareLength = verifyLength(echo.length);
      for (let i = 0; i < compareLength; i += 1) {
        if (packet[i] !== echo[i]) throw new Error("echo mismatch");
      }

      saveAppliedConfig(workingInfo.id, gainforestSetupConfig(), workingInfo.firmwareVersion);

      setStep("settings", { status: "done", detail: t("autoSetup.settingsDone") });
    } catch {
      fail("settings", t("autoSetup.settingsFailed"));
      return;
    }

    /* Step 4 — equipment: register the unit in the user's equipment list,
       stamping the record's notes with everything we know about this setup */

    setStep("equipment", { status: "active", detail: t("autoSetup.equipmentChecking") });

    try {
      if (!sessionDid) {
        setStep("equipment", { status: "skipped", detail: t("autoSetup.equipmentSignInSkip") });
      } else {
        let battery: string | null = null;
        try {
          battery = await withRetries(() => workingDevice.getBatteryState());
        } catch {
          /* battery is nice-to-have for the notes */
        }

        const now = new Date();
        const notesBlock = composeNotesBlock(workingInfo, battery, now);

        const items = await listEquipment(sessionDid);
        const deviceId = workingInfo.id;
        const existing = items.find((item) => item.assetId.trim().toUpperCase() === deviceId.toUpperCase());

        if (existing) {
          /* Refresh the setup block in the notes, keeping handwritten notes intact */
          await updateEquipment(existing, {
            assetId: existing.assetId,
            name: existing.name,
            category: existing.category,
            status: existing.status,
            currentOwner: existing.currentOwner,
            projectSite: existing.projectSite,
            geo: existing.geo,
            acquiredAt: existing.acquiredAt,
            notes: mergeSetupNotes(existing.notes, notesBlock),
          });
          setStep("equipment", { status: "done", detail: t("autoSetup.equipmentUpdated", { name: existing.name }) });
        } else {
          const name = `AudioMoth ${deviceId.slice(-4)}`;
          await createEquipment({
            assetId: deviceId,
            name,
            category: "audiomoth",
            status: "storage",
            acquiredAt: now.toISOString().slice(0, 10),
            notes: notesBlock,
          });
          setStep("equipment", { status: "done", detail: t("autoSetup.equipmentSaved", { name }) });
        }
      }
    } catch {
      fail("equipment", t("autoSetup.equipmentFailed"));
      return;
    }

    finish(false);
  }, [adoptDevice, composeNotesBlock, device, info, requestSetupRecheck, sessionDid, t]);

  const closeWizard = useCallback(() => {
    setWizard((current) => (current?.running ? current : null));
  }, []);

  /* ---------------- render ---------------- */

  const tabs: Array<{ id: TabId; label: string; Icon: typeof ClockIcon }> = [
    { id: "firmware", label: t("tabs.firmware"), Icon: CpuIcon },
    { id: "device", label: t("tabs.device"), Icon: ClockIcon },
    { id: "configure", label: t("tabs.configure"), Icon: SlidersHorizontalIcon },
  ];

  const mainTabs: Array<{ id: MainTabId; label: string; Icon: typeof ClockIcon }> = [
    { id: "setup", label: t("mainTabs.setup"), Icon: WrenchIcon },
    { id: "deployments", label: t("mainTabs.deployments"), Icon: MapPinIcon },
    { id: "upload", label: t("mainTabs.upload"), Icon: HardDriveUploadIcon },
    ...(canUseLabelling
      ? [{ id: "label" as const, label: t("mainTabs.label"), Icon: TagsIcon }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary shadow-inner">
            <AudioLinesIcon className="size-4.5" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {mainTab === "label" ? t("label.subtitle") : t("subtitle")}
        </p>
      </header>

      {/* Setup (this device over USB) vs Deployment (field events) */}
      <nav className="flex w-full gap-1 self-start rounded-full border border-border bg-card/70 p-1 sm:w-auto" aria-label={t("title")}>
        {mainTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMainTab(id)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 py-2 text-xs font-medium transition-colors sm:flex-none sm:gap-2 sm:px-4 sm:text-sm",
              mainTab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            aria-current={mainTab === id ? "page" : undefined}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      {mainTab === "deployments" && <DeploymentsTab sessionDid={sessionDid} />}

      {mainTab === "upload" && <UploadTab sessionDid={sessionDid} />}

      {canUseLabelling && mainTab === "label" && <LabelTab sessionDid={sessionDid} />}

      {mainTab === "setup" && supported === false && (
        <Card>
          <p className="text-sm text-muted-foreground">{t("unsupportedBrowser")}</p>
        </Card>
      )}

      {mainTab === "setup" && supported && (
        <>
          {!wizard && (
            <ConnectionCard
              device={device}
              info={info}
              reading={reading}
              connecting={connecting}
              setupCheck={setupCheck}
              equipmentStatus={equipmentStatus}
              savingEquipment={savingEquipment}
              onRequestDevice={requestDevice}
              onAutoSetup={runAutoSetup}
              onSaveEquipment={saveToEquipment}
            />
          )}

          <AnimatePresence mode="wait">
            {wizard ? (
              <AutoSetupWizard key="wizard" wizard={wizard} onClose={closeWizard} />
            ) : (
              <motion.div
                key="tabs"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-6"
              >
                <nav className="flex gap-1 rounded-full border border-border bg-card/70 p-1" aria-label={t("title")}>
                  {tabs.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                        tab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-current={tab === id ? "page" : undefined}
                    >
                      <Icon className="size-4" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </nav>

                {tab === "firmware" && (
                  <FirmwareTab device={device} info={info} pollingPausedRef={pollingPausedRef} setDevice={setDevice} />
                )}
                {tab === "device" && (
                  <DeviceTab device={device} info={info} reading={reading} pollingPausedRef={pollingPausedRef} />
                )}
                {tab === "configure" && (
                  <ConfigureTab
                    device={device}
                    info={info}
                    pollingPausedRef={pollingPausedRef}
                    onConfigured={requestSetupRecheck}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Connection banner                                                   */
/* ------------------------------------------------------------------ */

function ConnectionCard({
  device,
  info,
  reading,
  connecting,
  setupCheck,
  equipmentStatus,
  savingEquipment,
  onRequestDevice,
  onAutoSetup,
  onSaveEquipment,
}: {
  device: AudioMothDevice | null;
  info: DeviceInfo | null;
  reading: LiveReading | null;
  connecting: boolean;
  setupCheck: SetupCheck | null;
  equipmentStatus: EquipmentStatus;
  savingEquipment: boolean;
  onRequestDevice: () => void;
  onAutoSetup: () => void;
  onSaveEquipment: () => void;
}) {
  const t = useTranslations("common.audiomoth.connection");

  if (!device) {
    return (
      <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UsbIcon className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">{t("noDeviceTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("noDeviceBody")}</p>
          </div>
        </div>
        <Button onClick={onRequestDevice} disabled={connecting}>
          {connecting ? <Loader2Icon className="size-4 animate-spin" /> : <PlugZapIcon className="size-4" />}
          {t("connectButton")}
        </Button>
      </Card>
    );
  }

  const notReadyReason =
    setupCheck?.status === "not-ready"
      ? [
          setupCheck.firmwareOk === false ? t("setupReasonFirmware") : null,
          setupCheck.settingsOk === false
            ? t("setupReasonSettings")
            : setupCheck.settingsOk === null
              ? t("setupReasonSettingsUnknown")
              : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <Card className="flex flex-col gap-3 border-primary/30 bg-primary/[0.04]">
      {/* Identity row: who is connected + quiet live stats */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckIcon className="size-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{t("connectedTitle")}</p>
              <SetupBadge setupCheck={setupCheck} />
            </div>
            <p className="truncate font-mono text-xs text-muted-foreground">{info ? info.id : "…"}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BatteryMediumIcon className="size-3.5" />
            {reading ? reading.battery : "—"}
          </span>
          <span className="inline-flex items-center gap-1">
            <CpuIcon className="size-3.5" />
            {info ? info.firmwareVersion.join(".") : "—"}
          </span>
        </div>
      </div>

      {/* Action row: hint on the left, compact actions on the right */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-primary/10 pt-3">
        {notReadyReason && <p className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">{notReadyReason}</p>}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {equipmentStatus.status === "registered" && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
              <Link href={equipmentDetailPath(equipmentStatus.item.did, equipmentStatus.item.rkey)}>
                <ArchiveIcon className="size-3.5" />
                {t("viewEquipmentPageButton")}
              </Link>
            </Button>
          )}
          {equipmentStatus.status === "unregistered" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onSaveEquipment}
              disabled={savingEquipment}
            >
              {savingEquipment ? <Loader2Icon className="size-3.5 animate-spin" /> : <ArchiveIcon className="size-3.5" />}
              {t("saveEquipmentButton")}
            </Button>
          )}
          <Button size="sm" onClick={onAutoSetup} disabled={!info}>
            <WandSparklesIcon className="size-3.5" />
            {t("autoSetupButton")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Subtle chip showing whether the device matches the one-click GainForest setup. */
function SetupBadge({ setupCheck }: { setupCheck: SetupCheck | null }) {
  const t = useTranslations("common.audiomoth.connection");

  if (!setupCheck || setupCheck.status === "unknown") return null;

  if (setupCheck.status === "checking") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" />
        {t("setupChecking")}
      </span>
    );
  }

  if (setupCheck.status === "ready") {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
      >
        <CheckIcon className="size-3" />
        {t("setupOk")}
      </motion.span>
    );
  }

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
    >
      <TriangleAlertIcon className="size-3" />
      {t("setupMissing")}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ */
/* Auto-setup wizard                                                   */
/* ------------------------------------------------------------------ */

function AutoSetupWizard({ wizard, onClose }: { wizard: WizardState; onClose: () => void }) {
  const t = useTranslations("common.audiomoth.autoSetup");

  const stepMeta: Record<WizardStepId, { Icon: typeof ClockIcon; title: string }> = {
    firmware: { Icon: CpuIcon, title: t("stepFirmware") },
    clock: { Icon: ClockIcon, title: t("stepClock") },
    settings: { Icon: SlidersHorizontalIcon, title: t("stepSettings") },
    equipment: { Icon: ArchiveIcon, title: t("stepEquipment") },
  };

  const headline = wizard.running ? t("runningTitle") : wizard.failed ? t("errorTitle") : t("doneTitle");

  return (
    <motion.section
      key="auto-setup"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className="rounded-3xl border border-primary/25 bg-card/95 p-6 shadow-md backdrop-blur-sm sm:p-8"
      aria-live="polite"
    >
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <motion.span
          className="flex size-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"
          animate={wizard.running ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={wizard.running ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : undefined}
        >
          {wizard.running ? (
            <AudioLinesIcon className="size-6" />
          ) : wizard.failed ? (
            <TriangleAlertIcon className="size-6 text-destructive" />
          ) : (
            <CheckIcon className="size-6" />
          )}
        </motion.span>
        <div>
          <h2 className="text-lg font-semibold">{headline}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <ol className="mx-auto flex max-w-md flex-col gap-1">
        {WIZARD_STEP_IDS.map((id, index) => {
          const step = wizard.steps[id];
          const { Icon, title } = stepMeta[id];
          return (
            <motion.li
              key={id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08, duration: 0.25 }}
              className="flex gap-3"
            >
              <div className="flex flex-col items-center">
                <StepStatusBadge status={step.status} Icon={Icon} />
                {index < WIZARD_STEP_IDS.length - 1 && (
                  <span
                    className={cn(
                      "w-px flex-1 transition-colors",
                      step.status === "done" || step.status === "skipped" ? "bg-primary/50" : "bg-border",
                    )}
                  />
                )}
              </div>
              <div className="flex min-h-14 flex-1 flex-col pb-4">
                <p
                  className={cn(
                    "text-sm font-medium leading-9",
                    step.status === "pending" && "text-muted-foreground/60",
                    step.status === "error" && "text-destructive",
                  )}
                >
                  {title}
                </p>
                {step.detail && (
                  <motion.p
                    key={step.detail}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn("text-sm", step.status === "error" ? "text-destructive" : "text-muted-foreground")}
                  >
                    {step.detail}
                  </motion.p>
                )}
                {step.status === "active" && typeof step.progress === "number" && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      animate={{ width: `${Math.round(step.progress * 100)}%` }}
                      transition={{ ease: "easeOut", duration: 0.2 }}
                    />
                  </div>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>

      {!wizard.running && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 flex justify-center"
        >
          <Button onClick={onClose} variant={wizard.failed ? "outline" : "default"}>
            {wizard.failed ? t("closeAfterError") : t("closeButton")}
          </Button>
        </motion.div>
      )}
    </motion.section>
  );
}

function StepStatusBadge({ status, Icon }: { status: WizardStepStatus; Icon: typeof ClockIcon }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors",
        status === "pending" && "border-border bg-muted/40 text-muted-foreground/50",
        status === "active" && "border-primary/40 bg-primary/10 text-primary",
        status === "done" && "border-primary bg-primary text-primary-foreground",
        status === "skipped" && "border-border bg-muted text-muted-foreground",
        status === "error" && "border-destructive/50 bg-destructive/10 text-destructive",
      )}
    >
      {status === "active" ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : status === "done" ? (
        <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 18 }}>
          <CheckIcon className="size-4" />
        </motion.span>
      ) : status === "skipped" ? (
        <MinusIcon className="size-4" />
      ) : status === "error" ? (
        <TriangleAlertIcon className="size-4" />
      ) : (
        <Icon className="size-4" />
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Device & clock tab                                                  */
/* ------------------------------------------------------------------ */

function DeviceTab({
  device,
  info,
  reading,
  pollingPausedRef,
}: {
  device: AudioMothDevice | null;
  info: DeviceInfo | null;
  reading: LiveReading | null;
  pollingPausedRef: React.MutableRefObject<boolean>;
}) {
  const t = useTranslations("common.audiomoth.device");
  const [settingTime, setSettingTime] = useState(false);
  const [timeResult, setTimeResult] = useState<"ok" | "error" | null>(null);

  const setTimeNow = useCallback(async () => {
    if (!device) return;
    setSettingTime(true);
    setTimeResult(null);
    pollingPausedRef.current = true;

    try {
      /* Align to the next second transition, like the desktop Time App */
      const USB_LAG = 20;
      const MINIMUM_DELAY = 100;

      const sendTime = new Date();
      let delayMs = 1000 - sendTime.getMilliseconds();
      if (delayMs < MINIMUM_DELAY) delayMs += 1000;
      sendTime.setMilliseconds(sendTime.getMilliseconds() + delayMs);

      const waitMs = sendTime.getTime() - Date.now() - USB_LAG;
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

      await withRetries(() => device.setTime(sendTime));
      setTimeResult("ok");
    } catch {
      setTimeResult("error");
    } finally {
      pollingPausedRef.current = false;
      setSettingTime(false);
    }
  }, [device, pollingPausedRef]);

  const firmwareLabel = useMemo(() => {
    if (!info) return "—";
    const version = info.firmwareVersion.join(".");
    const official = classifyFirmware(info.firmwareDescription) === "official";
    const [major, minor, patch] = LATEST_FIRMWARE_VERSION;
    if (official && isOlderVersion(info.firmwareVersion, major, minor, patch)) {
      return `${version} (${t("updateRecommended")})`;
    }
    return version;
  }, [info, t]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="font-mono text-2xl tabular-nums sm:text-3xl">
            {reading ? formatUtc(reading.time) : "--:--:-- --/--/---- UTC"}
          </p>
          <Button onClick={setTimeNow} disabled={!device || settingTime}>
            {settingTime ? <Loader2Icon className="size-4 animate-spin" /> : <ClockIcon className="size-4" />}
            {t("setTimeButton")}
          </Button>
          {timeResult === "ok" && <p className="text-sm text-primary">{t("setTimeSuccess")}</p>}
          {timeResult === "error" && <p className="text-sm text-destructive">{t("setTimeError")}</p>}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <FingerprintIcon className="size-4 text-muted-foreground" />
          {t("aboutTitle")}
        </h2>
        <div className="divide-y divide-border/60">
          <InfoRow label={t("idLabel")} value={info?.id ?? "—"} dimmed={!info} />
          <InfoRow label={t("firmwareVersionLabel")} value={firmwareLabel} dimmed={!info} />
          <InfoRow label={t("firmwareDescriptionLabel")} value={info?.firmwareDescription ?? "—"} dimmed={!info} />
          <InfoRow label={t("batteryLabel")} value={reading?.battery ?? "—"} dimmed={!reading} />
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Configure tab                                                       */
/* ------------------------------------------------------------------ */

const GAIN_KEYS = ["gainLow", "gainLowMedium", "gainMedium", "gainMediumHigh", "gainHigh"] as const;

function ConfigureTab({
  device,
  info,
  pollingPausedRef,
  onConfigured,
}: {
  device: AudioMothDevice | null;
  info: DeviceInfo | null;
  pollingPausedRef: React.MutableRefObject<boolean>;
  onConfigured: () => void;
}) {
  const t = useTranslations("common.audiomoth.configure");

  const [config, setConfig] = useState<AudioMothConfig>({
    ...DEFAULT_CONFIG,
    timePeriods: [{ startMins: 0, endMins: MINUTES_IN_DAY }],
  });
  const [timeZoneMode, setTimeZoneMode] = useState<"utc" | "local">("utc");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"ok" | "error" | null>(null);

  /* Pre-fill the form with the configuration last written to this unit from
     this browser (the device itself cannot report its settings back). */
  const loadedDeviceIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!info || loadedDeviceIdRef.current === info.id) return;
    loadedDeviceIdRef.current = info.id;
    const applied = loadAppliedConfig(info.id);
    if (applied) {
      setConfig(applied.config);
      setTimeZoneMode(applied.config.timeZoneOffsetMinutes === 0 ? "utc" : "local");
      setResult(null);
    }
  }, [info]);

  const update = useCallback((patch: Partial<AudioMothConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setResult(null);
  }, []);

  const updatePeriod = useCallback((index: number, patch: Partial<TimePeriod>) => {
    setConfig((current) => {
      const timePeriods = current.timePeriods.map((period, i) => (i === index ? { ...period, ...patch } : period));
      return { ...current, timePeriods };
    });
    setResult(null);
  }, []);

  const sendConfiguration = useCallback(async () => {
    if (!device || !info) return;
    setSending(true);
    setResult(null);
    pollingPausedRef.current = true;

    try {
      const timeZoneOffsetMinutes = timeZoneMode === "local" ? -new Date().getTimezoneOffset() : 0;

      /* Align to the next second transition, matching the desktop app */
      const sendTime = new Date();
      let delayMs = 1000 - sendTime.getMilliseconds();
      if (delayMs < 100) delayMs += 1000;
      sendTime.setMilliseconds(sendTime.getMilliseconds() + delayMs);

      const { packet, verifyLength } = buildConfigPacket(
        { ...config, timeZoneOffsetMinutes },
        info.firmwareVersion,
        info.firmwareDescription,
        sendTime,
      );

      const waitMs = sendTime.getTime() - Date.now() - 20;
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

      const echo = await withRetries(() => device.setPacket(packet));

      const compareLength = verifyLength(echo.length);
      for (let i = 0; i < compareLength; i += 1) {
        if (packet[i] !== echo[i]) throw new Error("echo mismatch");
      }

      saveAppliedConfig(info.id, { ...config, timeZoneOffsetMinutes }, info.firmwareVersion);

      setResult("ok");
      onConfigured();
    } catch {
      setResult("error");
    } finally {
      pollingPausedRef.current = false;
      setSending(false);
    }
  }, [config, device, info, onConfigured, pollingPausedRef, timeZoneMode]);

  const disabled = !device || !info;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="mb-4 text-sm font-semibold">{t("recordingTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audiomoth-sample-rate">{t("sampleRateLabel")}</Label>
            <Select
              value={String(config.sampleRateIndex)}
              onValueChange={(value) => update({ sampleRateIndex: parseInt(value, 10) })}
            >
              <SelectTrigger id="audiomoth-sample-rate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONFIGURATIONS.map((configuration, index) => (
                  <SelectItem key={configuration.trueSampleRate} value={String(index)}>
                    {configuration.trueSampleRate} kHz
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audiomoth-gain">{t("gainLabel")}</Label>
            <Select value={String(config.gain)} onValueChange={(value) => update({ gain: parseInt(value, 10) })}>
              <SelectTrigger id="audiomoth-gain">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAIN_KEYS.map((key, index) => (
                  <SelectItem key={key} value={String(index)}>
                    {t(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={config.dutyEnabled} onCheckedChange={(checked) => update({ dutyEnabled: checked === true })} />
            {t("dutyCycleLabel")}
          </label>

          {config.dutyEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audiomoth-record-duration">{t("recordDurationLabel")}</Label>
                <Input
                  id="audiomoth-record-duration"
                  type="number"
                  min={1}
                  max={MAX_RECORD_DURATION}
                  value={config.recordDuration}
                  onChange={(event) =>
                    update({ recordDuration: Math.max(1, Math.min(MAX_RECORD_DURATION, parseInt(event.target.value, 10) || 1)) })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audiomoth-sleep-duration">{t("sleepDurationLabel")}</Label>
                <Input
                  id="audiomoth-sleep-duration"
                  type="number"
                  min={0}
                  max={MAX_SLEEP_DURATION}
                  value={config.sleepDuration}
                  onChange={(event) =>
                    update({ sleepDuration: Math.max(0, Math.min(MAX_SLEEP_DURATION, parseInt(event.target.value, 10) || 0)) })
                  }
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold">{t("scheduleTitle")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t("scheduleBody")}</p>

        <div className="mb-4 flex flex-col gap-1.5">
          <Label htmlFor="audiomoth-timezone">{t("timeZoneLabel")}</Label>
          <Select value={timeZoneMode} onValueChange={(value) => setTimeZoneMode(value === "local" ? "local" : "utc")}>
            <SelectTrigger id="audiomoth-timezone" className="sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="utc">{t("timeZoneUtc")}</SelectItem>
              <SelectItem value="local">{t("timeZoneLocal")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          {config.timePeriods.map((period, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                type="time"
                aria-label={t("periodStartLabel")}
                className="w-32"
                value={minutesToTimeString(period.startMins)}
                onChange={(event) => updatePeriod(index, { startMins: timeStringToMinutes(event.target.value) })}
              />
              <span className="text-sm text-muted-foreground">–</span>
              <Input
                type="time"
                aria-label={t("periodEndLabel")}
                className="w-32"
                value={minutesToTimeString(period.endMins % MINUTES_IN_DAY)}
                onChange={(event) => updatePeriod(index, { endMins: timeStringToMinutes(event.target.value) })}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  update({ timePeriods: config.timePeriods.filter((_, i) => i !== index) });
                }}
              >
                {t("removePeriod")}
              </Button>
            </div>
          ))}

          {config.timePeriods.length < MAX_PERIODS && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => update({ timePeriods: [...config.timePeriods, { startMins: 0, endMins: MINUTES_IN_DAY }] })}
            >
              {t("addPeriod")}
            </Button>
          )}

          {config.timePeriods.length === 0 && <p className="text-sm text-muted-foreground">{t("noPeriodsHint")}</p>}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audiomoth-first-date">{t("firstRecordingDateLabel")}</Label>
            <Input
              id="audiomoth-first-date"
              type="date"
              value={config.firstRecordingDate ?? ""}
              onChange={(event) => update({ firstRecordingDate: event.target.value || null })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audiomoth-last-date">{t("lastRecordingDateLabel")}</Label>
            <Input
              id="audiomoth-last-date"
              type="date"
              value={config.lastRecordingDate ?? ""}
              onChange={(event) => update({ lastRecordingDate: event.target.value || null })}
            />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold">{t("filterTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audiomoth-filter-type">{t("filterTypeLabel")}</Label>
            <Select value={config.filterType} onValueChange={(value) => update({ filterType: value as FilterType })}>
              <SelectTrigger id="audiomoth-filter-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("filterNone")}</SelectItem>
                <SelectItem value="low">{t("filterLowPass")}</SelectItem>
                <SelectItem value="band">{t("filterBandPass")}</SelectItem>
                <SelectItem value="high">{t("filterHighPass")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(config.filterType === "band" || config.filterType === "high") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audiomoth-lower-filter">{t("lowerFilterLabel")}</Label>
              <Input
                id="audiomoth-lower-filter"
                type="number"
                min={0}
                max={192000}
                step={100}
                value={config.lowerFilterHz}
                onChange={(event) => update({ lowerFilterHz: Math.max(0, parseInt(event.target.value, 10) || 0) })}
              />
            </div>
          )}

          {(config.filterType === "band" || config.filterType === "low") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audiomoth-higher-filter">{t("higherFilterLabel")}</Label>
              <Input
                id="audiomoth-higher-filter"
                type="number"
                min={0}
                max={192000}
                step={100}
                value={config.higherFilterHz}
                onChange={(event) => update({ higherFilterHz: Math.max(0, parseInt(event.target.value, 10) || 0) })}
              />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold">{t("extrasTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={config.ledEnabled} onCheckedChange={(checked) => update({ ledEnabled: checked === true })} />
            {t("ledLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.batteryLevelCheckEnabled}
              onCheckedChange={(checked) => update({ batteryLevelCheckEnabled: checked === true })}
            />
            {t("batteryLevelLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.energySaverModeEnabled}
              onCheckedChange={(checked) => update({ energySaverModeEnabled: checked === true })}
            />
            {t("energySaverLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.disable48DCFilter}
              onCheckedChange={(checked) => update({ disable48DCFilter: checked === true })}
            />
            {t("disable48DCFilterLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={config.dailyFolders} onCheckedChange={(checked) => update({ dailyFolders: checked === true })} />
            {t("dailyFoldersLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.filenameWithDeviceIDEnabled}
              onCheckedChange={(checked) => update({ filenameWithDeviceIDEnabled: checked === true })}
            />
            {t("filenameWithDeviceIdLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.extendPrepTime}
              onCheckedChange={(checked) => update({ extendPrepTime: checked === true })}
            />
            {t("extendPrepTimeLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.displayVoltageRange}
              onCheckedChange={(checked) => update({ displayVoltageRange: checked === true })}
            />
            {t("displayVoltageRangeLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.lowGainRangeEnabled}
              onCheckedChange={(checked) => update({ lowGainRangeEnabled: checked === true })}
            />
            {t("lowGainRangeLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.magneticSwitchEnabled}
              onCheckedChange={(checked) => update({ magneticSwitchEnabled: checked === true })}
            />
            {t("magneticSwitchLabel")}
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold">{t("chimeTitle")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t("chimeBody")}</p>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.requireAcousticConfig}
              onCheckedChange={(checked) =>
                update({
                  requireAcousticConfig: checked === true,
                  ...(checked === true ? {} : { requireLocationInChime: false }),
                })
              }
            />
            {t("requireAcousticConfigLabel")}
          </label>
          <label
            className={cn("flex items-center gap-2 pl-6 text-sm", !config.requireAcousticConfig && "text-muted-foreground/60")}
          >
            <Checkbox
              checked={config.requireLocationInChime}
              disabled={!config.requireAcousticConfig}
              onCheckedChange={(checked) => update({ requireLocationInChime: checked === true })}
            />
            {t("requireLocationInChimeLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.useTimeZoneInChime}
              onCheckedChange={(checked) =>
                update({
                  useTimeZoneInChime: checked === true,
                  ...(checked === true ? {} : { adjustScheduleUsingTimezoneFromAcousticChime: false }),
                })
              }
            />
            {t("useTimeZoneInChimeLabel")}
          </label>
          <label
            className={cn("flex items-center gap-2 pl-6 text-sm", !config.useTimeZoneInChime && "text-muted-foreground/60")}
          >
            <Checkbox
              checked={config.adjustScheduleUsingTimezoneFromAcousticChime}
              disabled={!config.useTimeZoneInChime}
              onCheckedChange={(checked) => update({ adjustScheduleUsingTimezoneFromAcousticChime: checked === true })}
            />
            {t("adjustScheduleFromChimeLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.ignoreExternalMicrophoneForAcousticChime}
              onCheckedChange={(checked) => update({ ignoreExternalMicrophoneForAcousticChime: checked === true })}
            />
            {t("ignoreExternalMicLabel")}
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold">{t("gpsTitle")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t("gpsBody")}</p>
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.timeSettingFromGPSEnabled}
              onCheckedChange={(checked) => update({ timeSettingFromGPSEnabled: checked === true })}
            />
            {t("gpsEnabledLabel")}
          </label>
          {config.timeSettingFromGPSEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audiomoth-gps-mode">{t("gpsFixModeLabel")}</Label>
                <Select
                  value={config.acquireGpsFixBeforeAfter}
                  onValueChange={(value) => update({ acquireGpsFixBeforeAfter: value as GpsFixMode })}
                >
                  <SelectTrigger id="audiomoth-gps-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="period">{t("gpsFixModePeriod")}</SelectItem>
                    <SelectItem value="individual">{t("gpsFixModeIndividual")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audiomoth-gps-fix-time">{t("gpsFixTimeLabel")}</Label>
                <Select value={String(config.gpsFixTime)} onValueChange={(value) => update({ gpsFixTime: parseInt(value, 10) })}>
                  <SelectTrigger id="audiomoth-gps-fix-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VALID_GPS_FIX_TIMES.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {minutes}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-col items-start gap-2">
        <Button onClick={sendConfiguration} disabled={disabled || sending}>
          {sending ? <Loader2Icon className="size-4 animate-spin" /> : <SlidersHorizontalIcon className="size-4" />}
          {t("configureButton")}
        </Button>
        {disabled && <p className="text-sm text-muted-foreground">{t("connectFirst")}</p>}
        {result === "ok" && <p className="text-sm text-primary">{t("configureSuccess")}</p>}
        {result === "error" && <p className="text-sm text-destructive">{t("configureError")}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Firmware tab                                                        */
/* ------------------------------------------------------------------ */

function FirmwareTab({
  device,
  info,
  pollingPausedRef,
  setDevice,
}: {
  device: AudioMothDevice | null;
  info: DeviceInfo | null;
  pollingPausedRef: React.MutableRefObject<boolean>;
  setDevice: (device: AudioMothDevice | null) => void;
}) {
  const t = useTranslations("common.audiomoth.firmware");

  const [releases, setReleases] = useState<FirmwareRelease[] | null>(null);
  const [releasesError, setReleasesError] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [localFile, setLocalFile] = useState<{ name: string; data: Uint8Array } | null>(null);
  const [localFileInvalid, setLocalFileInvalid] = useState(false);
  const [source, setSource] = useState<"release" | "local">("release");
  const [clearSettings, setClearSettings] = useState(false);
  const [flashState, setFlashState] = useState<FlashState>({ stage: "idle" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/audiomoth/firmware")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((data: { releases: FirmwareRelease[] }) => {
        if (cancelled) return;
        setReleases(data.releases);
        if (data.releases.length > 0) setSelectedAssetId(String(data.releases[0].assetId));
      })
      .catch(() => {
        if (!cancelled) setReleasesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onLocalFile = useCallback(async (file: File | undefined) => {
    setLocalFileInvalid(false);
    if (!file) {
      setLocalFile(null);
      return;
    }
    const data = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeAudioMothFirmware(data)) {
      setLocalFile(null);
      setLocalFileInvalid(true);
      return;
    }
    setLocalFile({ name: file.name, data });
    setSource("local");
  }, []);

  const resolveFirmware = useCallback(async (): Promise<{ data: Uint8Array; label: string } | null> => {
    if (source === "local") {
      if (!localFile) return null;
      return { data: localFile.data, label: localFile.name };
    }
    const release = releases?.find((candidate) => String(candidate.assetId) === selectedAssetId);
    if (!release) return null;
    const response = await fetch(`/api/audiomoth/firmware?download=${release.assetId}`);
    if (!response.ok) throw new Error("download failed");
    const data = new Uint8Array(await response.arrayBuffer());
    if (!looksLikeAudioMothFirmware(data)) throw new Error("invalid firmware");
    return { data, label: release.version };
  }, [localFile, releases, selectedAssetId, source]);

  const serialFirmwareRef = useRef<Uint8Array | null>(null);

  const startFlash = useCallback(async () => {
    if (!device || !info) return;

    pollingPausedRef.current = true;
    setFlashState({ stage: "running", progress: { phase: "preparing", fraction: 0 } });

    try {
      const firmware = await resolveFirmware();
      if (!firmware) {
        setFlashState({ stage: "error", message: t("noFirmwareSelected") });
        pollingPausedRef.current = false;
        return;
      }

      if (info.supportsUsbHidFlash) {
        const crc = await flashViaUsbHid(device, firmware.data, clearSettings, (progress) =>
          setFlashState({ stage: "running", progress }),
        );
        setFlashState({ stage: "done", crc });
        pollingPausedRef.current = false;
        return;
      }

      if (!info.supportsSerialBootloaderSwitch) {
        setFlashState({ stage: "error", message: t("manualBootloaderRequired") });
        pollingPausedRef.current = false;
        return;
      }

      /* Serial path: switch the device into its bootloader, then ask the
         user to pick the serial port (a fresh user gesture is required). */
      const switched = await withRetries(() => device.switchToSerialBootloader());
      if (!switched) throw new Error("refused");

      serialFirmwareRef.current = firmware.data;
      await device.close();
      setDevice(null);
      setFlashState({ stage: "awaiting-serial" });
    } catch {
      pollingPausedRef.current = false;
      setFlashState({ stage: "error", message: t("flashError") });
    }
  }, [clearSettings, device, info, pollingPausedRef, resolveFirmware, setDevice, t]);

  const continueSerialFlash = useCallback(async () => {
    const serial = getWebSerial();
    const firmware = serialFirmwareRef.current;
    if (!serial || !firmware) {
      setFlashState({ stage: "error", message: t("serialUnsupported") });
      return;
    }

    try {
      const port = await serial.requestPort({ filters: AUDIOMOTH_SERIAL_USB_IDS });
      setFlashState({ stage: "running", progress: { phase: "preparing", fraction: 0 } });
      const crc = await flashViaSerial(port, firmware, (progress) => setFlashState({ stage: "running", progress }));
      setFlashState({ stage: "done", crc });
    } catch (error) {
      if (error instanceof Error && error.name === "NotFoundError") {
        /* user dismissed the port picker — stay in awaiting state */
        setFlashState({ stage: "awaiting-serial" });
        return;
      }
      setFlashState({ stage: "error", message: t("flashError") });
    } finally {
      pollingPausedRef.current = false;
      serialFirmwareRef.current = null;
    }
  }, [pollingPausedRef, t]);

  const busy = flashState.stage === "running";
  const disabled = !device || !info || busy;

  const serialSupported = getWebSerial() !== null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="mb-2 text-sm font-semibold">{t("currentTitle")}</h2>
        <div className="divide-y divide-border/60">
          <InfoRow label={t("currentVersionLabel")} value={info ? info.firmwareVersion.join(".") : "—"} dimmed={!info} />
          <InfoRow label={t("currentDescriptionLabel")} value={info?.firmwareDescription ?? "—"} dimmed={!info} />
          <InfoRow
            label={t("methodLabel")}
            value={info ? (info.supportsUsbHidFlash ? t("methodUsb") : info.supportsSerialBootloaderSwitch ? t("methodSerial") : "—") : "—"}
            dimmed={!info}
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold">{t("chooseTitle")}</h2>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audiomoth-release">{t("officialLabel")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedAssetId}
                onValueChange={(value) => {
                  setSelectedAssetId(value);
                  setSource("release");
                }}
              >
                <SelectTrigger id="audiomoth-release" className="w-full sm:max-w-xs">
                  <SelectValue placeholder={releasesError ? t("releasesError") : t("releasesLoading")} />
                </SelectTrigger>
                <SelectContent>
                  {(releases ?? []).map((release) => (
                    <SelectItem key={release.assetId} value={String(release.assetId)}>
                      {release.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {source === "release" && <CheckIcon className="size-4 text-primary" aria-hidden />}
            </div>
            {releasesError && <p className="text-sm text-destructive">{t("releasesError")}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audiomoth-local-file">{t("localFileLabel")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="audiomoth-local-file"
                type="file"
                accept=".bin"
                className="w-full sm:max-w-xs"
                onChange={(event) => void onLocalFile(event.target.files?.[0])}
              />
              {source === "local" && localFile && <CheckIcon className="size-4 text-primary" aria-hidden />}
            </div>
            {localFileInvalid && <p className="text-sm text-destructive">{t("invalidFirmwareFile")}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={clearSettings} onCheckedChange={(checked) => setClearSettings(checked === true)} />
            {t("clearSettingsLabel")}
          </label>
        </div>
      </Card>

      <div className="flex flex-col items-start gap-3">
        {flashState.stage !== "awaiting-serial" && (
          <Button onClick={startFlash} disabled={disabled}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <DownloadIcon className="size-4" />}
            {t("flashButton")}
          </Button>
        )}

        {flashState.stage === "awaiting-serial" && (
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card/90 p-4">
            <p className="text-sm">{serialSupported ? t("serialPickPrompt") : t("serialUnsupported")}</p>
            {serialSupported && (
              <Button onClick={continueSerialFlash}>
                <UsbIcon className="size-4" />
                {t("serialPickButton")}
              </Button>
            )}
          </div>
        )}

        {!device && flashState.stage === "idle" && <p className="text-sm text-muted-foreground">{t("connectFirst")}</p>}

        {flashState.stage === "running" && <FlashProgressBar progress={flashState.progress} />}

        {flashState.stage === "done" && (
          <p className="text-sm text-primary">{t("flashSuccess", { crc: flashState.crc })}</p>
        )}
        {flashState.stage === "error" && <p className="text-sm text-destructive">{flashState.message}</p>}
      </div>
    </div>
  );
}

function FlashProgressBar({ progress }: { progress: FlashProgress }) {
  const t = useTranslations("common.audiomoth.firmware");

  const phaseLabels: Record<FlashProgress["phase"], string> = {
    preparing: t("phasePreparing"),
    transferring: t("phaseTransferring"),
    verifying: t("phaseVerifying"),
    flashing: t("phaseFlashing"),
    restarting: t("phaseRestarting"),
  };

  const showFraction = progress.phase === "transferring" || progress.phase === "restarting";

  return (
    <div className="w-full max-w-md">
      <p className="mb-1 text-sm text-muted-foreground">{phaseLabels[progress.phase]}</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full bg-primary transition-[width]", !showFraction && "animate-pulse")}
          style={{ width: showFraction ? `${Math.round(progress.fraction * 100)}%` : "100%" }}
        />
      </div>
    </div>
  );
}
