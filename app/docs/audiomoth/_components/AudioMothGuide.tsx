"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BatteryMediumIcon,
  CableIcon,
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  Clock3Icon,
  CloudUploadIcon,
  HardDriveDownloadIcon,
  HeadphonesIcon,
  MapPinIcon,
  MemoryStickIcon,
  MicIcon,
  PackageCheckIcon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TreePineIcon,
  UploadCloudIcon,
  UsbIcon,
  WavesIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ChecklistItem = { id: string; text: string; images?: string[] };
type ConfigTab = "flash" | "time" | "record" | "card";
type SwitchMode = "off" | "custom" | "default";

const APP_URL = "https://www.openacousticdevices.info/applications";
const ARBIMON_URL = "https://arbimon.org/";
const VIDEO_URL = "https://www.youtube-nocookie.com/embed/HDTtGw_DFNU?rel=0";
const CHECKLIST_STORAGE_KEY = "gainforest:audiomoth-deployment-checklist:v1";

export function AudioMothGuide() {
  const t = useTranslations("audiomothGuide");

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <WavesIcon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {t("hero.kicker")}
        </div>
        <h1 className="mx-auto mt-2 max-w-2xl font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t("hero.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          {t("hero.lead")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <InfoPill icon={<Clock3Icon className="h-3.5 w-3.5" />} text={t("hero.time")} />
          <InfoPill icon={<TreePineIcon className="h-3.5 w-3.5" />} text={t("hero.deployment")} />
        </div>
      </header>

      <ChapterNav />

      <section className="mt-10 overflow-hidden rounded-2xl border border-border/60 bg-muted/25">
        <div className="aspect-video bg-foreground/5">
          <iframe
            className="h-full w-full"
            src={VIDEO_URL}
            title={t("video.frameTitle")}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <PlayIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-medium text-foreground">{t("video.title")}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t("video.caption")}</p>
          </div>
        </div>
      </section>

      <GuideSection id="prepare" heading={t("prepare.heading")} intro={t("prepare.intro")}>
        <PreparationChecklist />
      </GuideSection>

      <GuideSection id="account" heading={t("account.heading")} intro={t("account.intro")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberCard number="01" title={t("account.accountTitle")} text={t("account.accountText")} />
          <NumberCard number="02" title={t("account.projectTitle")} text={t("account.projectText")} />
        </div>
        <Callout className="mt-4" icon={<PackageCheckIcon className="h-4 w-4" />}>
          {t("account.tip")}
        </Callout>
      </GuideSection>

      <GuideSection id="configure" heading={t("configure.heading")} intro={t("configure.intro")}>
        <ConfigurationStudio />
      </GuideSection>

      <section className="mt-8 rounded-2xl border border-primary/20 bg-primary/[0.045] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <CircleCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-serif text-xl font-semibold text-foreground">{t("test.heading")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("test.intro")}</p>
          </div>
        </div>
        <ol className="mt-5 grid gap-2.5">
          {[t("test.s1"), t("test.s2"), t("test.s3"), t("test.s4")].map((item, index) => (
            <li key={item} className="flex gap-3 text-[13.5px] leading-relaxed text-muted-foreground">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] text-primary">
                {index + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
        <div className="mt-5 border-t border-primary/15 pt-4 text-sm font-medium text-foreground">
          {t("test.success")}
        </div>
      </section>

      <GuideSection id="deploy" heading={t("deploy.heading")} intro={t("deploy.intro")}>
        <Callout icon={<SmartphoneIcon className="h-4 w-4" />}>{t("deploy.offline")}</Callout>
        <div className="mt-7">
          <FieldWalkthrough />
        </div>
        <div className="mt-7 rounded-xl border border-border/60 p-5">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/70">
            {t("deploy.whyHeading")}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SavedItem icon={<PackageCheckIcon className="h-4 w-4" />} text={t("deploy.whySite")} />
            <SavedItem icon={<MapPinIcon className="h-4 w-4" />} text={t("deploy.whyLocation")} />
            <SavedItem icon={<CameraIcon className="h-4 w-4" />} text={t("deploy.whyPhotos")} />
          </div>
        </div>
      </GuideSection>

      <section className="mt-16 overflow-hidden rounded-2xl border border-border/60">
        <div className="relative min-h-44 overflow-hidden bg-[radial-gradient(circle_at_25%_20%,color-mix(in_oklab,var(--primary)_25%,transparent),transparent_38%),linear-gradient(145deg,color-mix(in_oklab,var(--primary)_14%,var(--background)),var(--background))] p-6 sm:p-8">
          <div className="absolute right-5 bottom-0 text-primary/15 sm:right-10">
            <TreePineIcon className="h-36 w-36" strokeWidth={1} />
          </div>
          <ShieldCheckIcon className="h-5 w-5 text-primary" />
          <h2 className="relative mt-4 font-serif text-2xl font-semibold text-foreground">{t("tips.heading")}</h2>
          <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
            {[t("tips.water"), t("tips.camouflage"), t("tips.rope"), t("tips.tide"), t("tips.sound")].map(
              (tip) => (
                <div key={tip} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                  <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {tip}
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <GuideSection id="retrieve" heading={t("retrieve.heading")} intro={t("retrieve.intro")}>
        <ProcessLine
          items={[
            { icon: <RadioIcon className="h-4 w-4" />, text: t("retrieve.off") },
            { icon: <MemoryStickIcon className="h-4 w-4" />, text: t("retrieve.remove") },
            { icon: <HeadphonesIcon className="h-4 w-4" />, text: t("retrieve.check") },
          ]}
        />
      </GuideSection>

      <GuideSection id="upload" heading={t("upload.heading")} intro={t("upload.intro")}>
        <ProcessLine
          items={[
            { icon: <MemoryStickIcon className="h-4 w-4" />, text: t("upload.s1") },
            { icon: <HardDriveDownloadIcon className="h-4 w-4" />, text: t("upload.s2") },
            { icon: <UploadCloudIcon className="h-4 w-4" />, text: t("upload.s3") },
            { icon: <MapPinIcon className="h-4 w-4" />, text: t("upload.s4") },
            { icon: <CloudUploadIcon className="h-4 w-4" />, text: t("upload.s5") },
            { icon: <CircleCheckIcon className="h-4 w-4" />, text: t("upload.s6") },
          ]}
        />
        <Callout className="mt-5" icon={<Clock3Icon className="h-4 w-4" />}>
          {t("upload.slow")}
        </Callout>
        <div className="mt-5 rounded-xl border border-border/60 p-5">
          <h3 className="text-sm font-medium text-foreground">{t("upload.checkHeading")}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{t("upload.checkText")}</p>
          <p className="mt-3 border-t border-border/60 pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("upload.admin")}
          </p>
        </div>
      </GuideSection>

      <section className="mt-16 border-t border-border/60 pt-10 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckIcon className="h-5 w-5" />
        </div>
        <h2 className="mt-4 font-serif text-2xl font-semibold text-foreground">{t("finish.heading")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{t("finish.text")}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <FinishLink href={APP_URL} text={t("finish.tool")} external />
          <FinishLink href="/audiomoth" text={t("finish.soundscape")} />
          <FinishLink href={ARBIMON_URL} text={t("finish.arbimon")} external />
        </div>
      </section>
    </main>
  );
}

function ChapterNav() {
  const t = useTranslations("audiomothGuide.chapters");
  const chapters = [
    ["prepare", t("prepare")],
    ["account", t("account")],
    ["configure", t("configure")],
    ["deploy", t("deploy")],
    ["retrieve", t("retrieve")],
    ["upload", t("upload")],
  ];

  return (
    <nav aria-label={t("label")} className="mt-9 overflow-x-auto border-y border-border/60 py-3">
      <div className="flex min-w-max items-center justify-center gap-1">
        {chapters.map(([id, label], index) => (
          <div key={id} className="flex items-center">
            <a
              href={`#${id}`}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
            >
              {label}
            </a>
            {index < chapters.length - 1 && <ChevronRightIcon className="h-3 w-3 text-border" />}
          </div>
        ))}
      </div>
    </nav>
  );
}

function PreparationChecklist() {
  const t = useTranslations("audiomothGuide.prepare");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [previewedItem, setPreviewedItem] = useState<ChecklistItem | null>(null);
  const [hasLoadedStoredProgress, setHasLoadedStoredProgress] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
      if (stored) {
        const values: unknown = JSON.parse(stored);
        if (Array.isArray(values)) {
          setChecked(new Set(values.filter((value): value is string => typeof value === "string" && value.startsWith("equipment:") && value !== "equipment:phone")));
        }
      }
    } catch {
      // A malformed or unavailable local store should not block the checklist.
    } finally {
      setHasLoadedStoredProgress(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredProgress) return;
    try {
      window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify([...checked]));
    } catch {
      // Browsers that block local storage still get a working in-memory checklist.
    }
  }, [checked, hasLoadedStoredProgress]);

  const items: ChecklistItem[] = [
    { id: "computer", text: t("equipment.computer"), images: ["/images/audiomoth/equipment/laptop.webp"] },
    {
      id: "recorder",
      text: t("equipment.recorder"),
      images: [
        "/images/audiomoth/equipment/audiomoth.webp",
        "/images/audiomoth/equipment/aa-batteries.webp",
      ],
    },
    { id: "cable", text: t("equipment.cable"), images: ["/images/audiomoth/equipment/micro-usb-cable.webp"] },
    { id: "reader", text: t("equipment.reader"), images: ["/images/audiomoth/equipment/microsd-card-and-adapter.webp"] },
    { id: "card", text: t("equipment.card"), images: ["/images/audiomoth/equipment/microsd-card-and-adapter.webp"] },
    { id: "case", text: t("equipment.case"), images: ["/images/audiomoth/equipment/waterproof-case.webp"] },
  ];
  const visible = items;
  const scopedKey = (id: string) => `equipment:${id}`;
  const remaining = visible.filter((item) => !checked.has(scopedKey(item.id))).length;

  function toggle(id: string) {
    const key = scopedKey(id);
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60">
      <div className="p-4 sm:p-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key="equipment"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]"
          >
            <div className="grid content-start gap-2" onMouseLeave={() => setPreviewedItem(null)}>
              {visible.map((item) => {
                const selected = checked.has(scopedKey(item.id));
                const showingPreview = previewedItem?.id === item.id && item.images;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onMouseEnter={() => item.images && setPreviewedItem(item)}
                    onFocus={() => item.images && setPreviewedItem(item)}
                    onBlur={() => setPreviewedItem(null)}
                    onClick={() => toggle(item.id)}
                    className="group rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                        )}
                      >
                        {selected && <CheckIcon className="h-3.5 w-3.5" />}
                      </span>
                      <span className={cn("text-[13.5px] text-foreground", selected && "text-muted-foreground line-through")}>
                        {item.text}
                      </span>
                    </span>
                    <AnimatePresence initial={false}>
                      {showingPreview && (
                        <motion.span
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: 144, marginTop: 12 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          className={cn(
                            "grid overflow-hidden rounded-xl border border-border/60 bg-white md:hidden",
                            item.images && item.images.length > 1 && "grid-cols-2",
                          )}
                        >
                          {item.images?.map((src) => (
                            <span key={src} className="relative min-h-0">
                              <Image src={src} alt="" fill sizes="(max-width: 768px) 80vw" className="object-contain p-2" />
                            </span>
                          ))}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>

            <div className="relative hidden min-h-48 md:block">
              <AnimatePresence mode="wait">
                {previewedItem?.images && (
                  <motion.div
                    key={previewedItem.id}
                    initial={{ opacity: 0, scale: 0.96, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      "sticky top-24 grid h-48 overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm",
                      previewedItem.images.length > 1 && "grid-rows-2",
                    )}
                  >
                    {previewedItem.images.map((src) => (
                      <div key={src} className="relative min-h-0">
                        <Image src={src} alt="" fill sizes="192px" className="object-contain p-2" />
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4">
          <span className={cn("text-[12px]", remaining === 0 ? "font-medium text-primary" : "text-muted-foreground")}>
            {t("remaining", { count: remaining })}
          </span>
          <button
            type="button"
            onClick={() => setChecked(new Set())}
            className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcwIcon className="h-3 w-3" />
            {t("reset")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigurationStudio() {
  const t = useTranslations("audiomothGuide.configure");
  const [tab, setTab] = useState<ConfigTab>("flash");
  const [switchMode, setSwitchMode] = useState<SwitchMode>("off");

  const tabs: { id: ConfigTab; label: string; Icon: typeof UsbIcon }[] = [
    { id: "flash", label: t("flashTab"), Icon: UsbIcon },
    { id: "time", label: t("timeTab"), Icon: Clock3Icon },
    { id: "record", label: t("recordTab"), Icon: MicIcon },
    { id: "card", label: t("cardTab"), Icon: MemoryStickIcon },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60">
      <div className="grid sm:grid-cols-[180px_1fr]">
        <div className="flex overflow-x-auto border-b border-border/60 bg-muted/25 p-2 sm:flex-col sm:border-r sm:border-b-0">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex min-w-max items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] transition-colors",
                tab === id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-72 p-5 sm:p-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 5 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -5 }}
              transition={{ duration: 0.16 }}
            >
              {tab === "flash" && (
                <ConfigCopy icon={<UsbIcon className="h-5 w-5" />} title={t("flashTitle")} text={t("flashText")}>
                  <div className="mt-5 flex items-center gap-3 rounded-xl border border-border/60 bg-muted/25 p-4">
                    <BatteryMediumIcon className="h-5 w-5 text-primary" />
                    <CableIcon className="h-5 w-5 text-primary" />
                    <div className="h-px flex-1 border-t border-dashed border-primary/40" />
                    <RecorderMini />
                  </div>
                </ConfigCopy>
              )}
              {tab === "time" && (
                <ConfigCopy icon={<Clock3Icon className="h-5 w-5" />} title={t("timeTitle")} text={t("timeText")}>
                  <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.045] px-4 py-3 font-mono text-[12px] text-primary">
                    {t("idExample")}
                  </div>
                </ConfigCopy>
              )}
              {tab === "record" && (
                <ConfigCopy icon={<MicIcon className="h-5 w-5" />} title={t("recordTitle")} text={t("recordText")}>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <Setting label={t("sampleRate")} value={t("sampleValue")} />
                    <Setting label={t("recordDuration")} value={t("recordValue")} />
                    <Setting label={t("sleepDuration")} value={t("sleepValue")} />
                    <Setting label={t("schedule")} value={t("scheduleValue")} />
                    <div className="col-span-2">
                      <Setting label={t("chime")} value={t("chimeValue")} />
                    </div>
                  </div>
                  <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">{t("recordWarning")}</p>
                  <p className="mt-2 text-[12.5px] font-medium text-foreground">{t("save")}</p>
                </ConfigCopy>
              )}
              {tab === "card" && (
                <ConfigCopy icon={<MemoryStickIcon className="h-5 w-5" />} title={t("cardTitle")} text={t("cardText")}>
                  <div className="mt-5 flex items-center justify-center gap-5 rounded-xl border border-border/60 bg-muted/25 p-5">
                    <div className="rounded-md bg-foreground px-3 py-4 font-mono text-[10px] text-background">24E7</div>
                    <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                    <RecorderMini />
                  </div>
                  <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">{t("formatNote")}</p>
                </ConfigCopy>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="border-t border-border/60 bg-muted/15 p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <AudioMothBoard mode={switchMode} />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/70">
              {t("switchLabel")}
            </div>
            <div className="mt-3 grid grid-cols-3 rounded-xl border border-border/60 bg-background p-1">
              {(["off", "custom", "default"] as SwitchMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSwitchMode(mode)}
                  className={cn(
                    "rounded-lg px-2 py-2 font-mono text-[10px] transition-colors sm:text-[11px]",
                    switchMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "off" ? t("switchOff") : mode === "custom" ? t("switchCustom") : t("switchDefault")}
                </button>
              ))}
            </div>
            <div className="mt-3 text-[12.5px] font-medium text-foreground">
              {switchMode === "off" ? t("offStatus") : switchMode === "custom" ? t("customStatus") : t("defaultStatus")}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t("greenLed")}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />{t("redLed")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldWalkthrough() {
  const t = useTranslations("audiomothGuide.deploy");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const steps = [
    { title: t("steps.s1.title"), text: t("steps.s1.text"), Icon: SmartphoneIcon },
    { title: t("steps.s2.title"), text: t("steps.s2.text"), Icon: MapPinIcon },
    { title: t("steps.s3.title"), text: t("steps.s3.text"), Icon: RadioIcon },
    { title: t("steps.s4.title"), text: t("steps.s4.text"), Icon: CameraIcon },
  ];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= steps.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 3600);
    return () => window.clearInterval(timer);
  }, [playing, steps.length]);

  const ActiveIcon = steps[step].Icon;

  return (
    <div className="rounded-2xl border border-border/60 p-4 sm:p-6">
      <div className="relative mx-auto flex max-w-lg items-center justify-between px-3 py-7">
        <div className="absolute right-10 left-10 top-1/2 h-px -translate-y-1/2 bg-border" />
        <motion.div
          className="absolute top-1/2 h-px -translate-y-1/2 bg-primary"
          initial={false}
          animate={{ left: "2.5rem", width: `calc(${(step / (steps.length - 1)) * 100}% - ${(step / (steps.length - 1)) * 5}rem)` }}
          transition={{ duration: 0.3 }}
        />
        {steps.map(({ title, Icon }, index) => (
          <button
            key={title}
            type="button"
            onClick={() => { setStep(index); setPlaying(false); }}
            aria-label={t("stepLabel", { n: index + 1, total: steps.length })}
            aria-current={step === index ? "step" : undefined}
            className={cn(
              "relative z-10 flex h-11 w-11 items-center justify-center rounded-full border bg-background transition-all",
              index <= step ? "border-primary text-primary" : "border-border text-muted-foreground",
              index === step && "scale-110 bg-primary text-primary-foreground shadow-sm",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      <div className="mx-auto min-h-40 max-w-lg pt-2 text-center sm:min-h-36">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.17 }}
          >
            <ActiveIcon className="mx-auto h-5 w-5 text-primary" />
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
              {t("stepLabel", { n: step + 1, total: steps.length })}
            </div>
            <h3 className="mt-1.5 text-[15px] font-medium text-foreground">{steps[step].title}</h3>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">{steps[step].text}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-4">
        <RoundButton label={t("back")} disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
          <ArrowLeftIcon className="h-4 w-4" />
        </RoundButton>
        <RoundButton
          label={playing ? t("pause") : t("play")}
          accent
          onClick={() => {
            if (!playing && step === steps.length - 1) setStep(0);
            setPlaying((value) => !value);
          }}
        >
          {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </RoundButton>
        <RoundButton label={t("next")} disabled={step === steps.length - 1} onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>
          <ArrowRightIcon className="h-4 w-4" />
        </RoundButton>
      </div>
    </div>
  );
}

function AudioMothBoard({ mode }: { mode: SwitchMode }) {
  return (
    <div className="relative mx-auto h-36 w-48 shrink-0 rounded-[1.3rem] border border-primary/30 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--primary)_18%,var(--background)),color-mix(in_oklab,var(--primary)_7%,var(--background)))] p-4 shadow-sm">
      <div className="absolute top-4 left-4 font-mono text-[8px] tracking-[0.12em] text-primary/70">AUDIOMOTH</div>
      <div className="absolute top-5 right-5 flex gap-2">
        <motion.span animate={{ opacity: mode === "custom" ? [0.25, 1, 0.25] : 0.2 }} transition={{ repeat: Infinity, duration: 1.2 }} className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <motion.span animate={{ opacity: mode === "default" ? [0.25, 1, 0.25] : 0.2 }} transition={{ repeat: Infinity, duration: 0.75 }} className="h-2.5 w-2.5 rounded-full bg-red-500" />
      </div>
      <div className="absolute top-14 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border border-primary/30 bg-background/60">
        <MicIcon className="h-5 w-5 text-primary" />
      </div>
      <div className="absolute right-4 bottom-4 left-4 h-2 rounded-full bg-foreground/10">
        <motion.div
          className="h-2 w-1/3 rounded-full bg-primary"
          animate={{ x: mode === "off" ? 0 : mode === "custom" ? 45 : 90 }}
          transition={{ type: "spring", stiffness: 250, damping: 22 }}
        />
      </div>
    </div>
  );
}

function RecorderMini() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
      <MicIcon className="h-5 w-5" />
    </div>
  );
}

function ConfigCopy({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-primary">{icon}</div>
      <h3 className="mt-3 text-[15px] font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-[12px] font-medium text-foreground">{value}</div>
    </div>
  );
}

function GuideSection({ id, heading, intro, children }: { id: string; heading: string; intro: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-16 scroll-mt-24">
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">{heading}</h2>
      <p className="mt-2 mb-6 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{intro}</p>
      {children}
    </section>
  );
}

function InfoPill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-3 py-1.5 text-[11.5px] text-muted-foreground">{icon}{text}</span>;
}

function NumberCard({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border/60 p-5">
      <div className="font-mono text-[10px] tracking-[0.12em] text-primary">{number}</div>
      <h3 className="mt-3 text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function Callout({ icon, children, className }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.045] px-4 py-3.5", className)}>
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function SavedItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex items-center gap-2.5 text-[12px] text-muted-foreground"><span className="text-primary">{icon}</span>{text}</div>;
}

function ProcessLine({ items }: { items: { icon: React.ReactNode; text: string }[] }) {
  return (
    <ol className="grid gap-0">
      {items.map((item, index) => (
        <li key={item.text} className="relative flex gap-4 pb-5 last:pb-0">
          {index < items.length - 1 && <span className="absolute top-8 bottom-0 left-[15px] border-l border-dashed border-border" />}
          <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-background text-primary">{item.icon}</span>
          <p className="pt-1 text-[13px] leading-relaxed text-muted-foreground">{item.text}</p>
        </li>
      ))}
    </ol>
  );
}

function FinishLink({ href, text, external }: { href: string; text: string; external?: boolean }) {
  const className = "group flex items-center justify-between rounded-xl border border-border/60 px-4 py-3 text-left text-[12.5px] font-medium text-foreground no-underline transition-colors hover:border-primary/50 hover:text-primary";
  const content = <>{text}<ArrowRightIcon className="h-3.5 w-3.5 opacity-50 transition-transform group-hover:translate-x-0.5" /></>;
  if (external) return <a href={href} target="_blank" rel="noreferrer" className={className}>{content}</a>;
  return <Link href={href} className={className}>{content}</Link>;
}

function RoundButton({ label, onClick, disabled, accent, children }: { label: string; onClick: () => void; disabled?: boolean; accent?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={cn("flex h-9 w-9 items-center justify-center rounded-full border transition-colors", accent ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground", disabled && "cursor-default opacity-30")}>
      {children}
    </button>
  );
}
