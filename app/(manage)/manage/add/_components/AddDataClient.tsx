"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ImagePlusIcon,
  TreesIcon,
  MicIcon,
  MapPinIcon,
  UploadCloudIcon,
  ChevronRightIcon,
  Loader2Icon,
} from "lucide-react";
import Container from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import TelegramIcon from "@/icons/TelegramIcon";
import { manageHref, type ManageTarget } from "@/lib/links";
import { cn } from "@/lib/utils";
import { canCreateRecord } from "../../_lib/cgs-permissions";
import { classifyFiles, dominantKind, type UploadKind } from "../../_lib/upload/detect-upload-type";
import { setAddDataHandoff } from "../../_lib/upload/add-data-handoff";

const TAINA_BOT_URL = "https://t.me/The" + "Tain" + "aBot";

type KindMeta = {
  kind: UploadKind;
  Icon: ComponentType<{ className?: string }>;
  /** This kind can be collected by chatting with the Telegram assistant. */
  telegram: boolean;
};

// Personal accounts and organizations own the same data types — each write
// lands in whichever repo the target points at — so every kind is offered to
// both.
const KINDS: KindMeta[] = [
  { kind: "observation", Icon: ImagePlusIcon, telegram: true },
  { kind: "tree", Icon: TreesIcon, telegram: false },
  { kind: "audio", Icon: MicIcon, telegram: true },
  { kind: "site", Icon: MapPinIcon, telegram: false },
];

function routeForKind(target: ManageTarget, kind: UploadKind): string {
  switch (kind) {
    case "observation":
      return manageHref(target, "observations", { mode: "add" });
    case "tree":
      return manageHref(target, "trees", { mode: "upload" });
    case "audio":
      return manageHref(target, "audio", { section: "recordings", mode: "new" });
    case "site":
      return manageHref(target, "sites", { add: "1" });
  }
}

export function AddDataClient({ target }: { target: ManageTarget }) {
  const t = useTranslations("upload.addData");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [routingKind, setRoutingKind] = useState<UploadKind | null>(null);
  // After an ambiguous/mixed drop we keep a gentle hint about the most likely
  // kind, then let the user confirm with the chooser below.
  const [suggestedKind, setSuggestedKind] = useState<UploadKind | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const createPermission = canCreateRecord(target);
  const availableKinds = KINDS;

  function goToKind(kind: UploadKind, files?: File[]) {
    if (!createPermission.allowed) {
      setNote(createPermission.reason);
      return;
    }
    if (files && files.length > 0) setAddDataHandoff(kind, files);
    setRoutingKind(kind);
    router.push(routeForKind(target, kind));
  }

  function handleFiles(fileList: FileList | File[] | null) {
    setNote(null);
    setSuggestedKind(null);
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const result = classifyFiles(files);

    // A confident single-kind drop routes straight into that flow with the
    // files preloaded — the whole point of "drop and we sort it out".
    if (!result.ambiguous && result.kind) {
      goToKind(result.kind, result.files);
      return;
    }

    // Mixed / unknown: surface a hint and fall back to the manual chooser.
    const guess = dominantKind(result.counts);
    setSuggestedKind(guess);
    setNote(result.counts.unknown > 0 && guess === null ? t("unknownNote") : t("mixedNote"));
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files);
    event.currentTarget.value = "";
  }

  function dragHasFiles(event: DragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (!dragHasFiles(event)) return;
    handleFiles(event.dataTransfer.files);
  }

  return (
    <Container className="pt-4 pb-12 space-y-6">
      <header className="max-w-2xl">
        <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("description")}</p>
      </header>

      {/* The permanent drop-in. The whole panel is the drop target. */}
      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed px-6 py-12 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/10"
            : "border-primary/30 bg-gradient-to-b from-primary/[0.05] to-background hover:border-primary/50",
        )}
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
          {routingKind ? <Loader2Icon className="size-7 animate-spin" /> : <UploadCloudIcon className="size-7" />}
        </span>
        <div>
          <p className="font-instrument text-xl font-medium italic tracking-[-0.02em] text-foreground">
            {t("dropTitle")}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("dropHint")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={!createPermission.allowed || routingKind !== null}
          title={createPermission.reason ?? undefined}
        >
          {t("browse")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {note ? (
        <p className="rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3 text-sm text-foreground">
          {note}
        </p>
      ) : null}

      {/* Manual chooser — also the fallback for ambiguous drops and the way to
          start a flow with no file yet. */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("chooseTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {availableKinds.map((meta) => {
            const Icon = meta.Icon;
            const suggested = suggestedKind === meta.kind;
            return (
              <button
                key={meta.kind}
                type="button"
                onClick={() => goToKind(meta.kind)}
                disabled={!createPermission.allowed || routingKind !== null}
                title={createPermission.reason ?? undefined}
                className={cn(
                  "group flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  suggested ? "border-primary ring-1 ring-primary/40" : "border-border hover:border-primary/40 hover:bg-muted/50",
                )}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform group-hover:scale-105">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{t(`options.${meta.kind}.title`)}</span>
                    {suggested ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {t("suggested")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {t(`options.${meta.kind}.description`)}
                  </span>
                </span>
                <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            );
          })}
        </div>
      </section>

      {/* The Telegram assistant, surfaced once instead of in every section. */}
      <section className="flex flex-col gap-3 rounded-3xl border border-border bg-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-instrument text-lg font-medium italic tracking-[-0.02em] text-foreground">
            {t("taina.title")}
          </p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">{t("taina.body")}</p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href={TAINA_BOT_URL} target="_blank" rel="noreferrer">
            <TelegramIcon />
            {t("taina.cta")}
          </Link>
        </Button>
      </section>
    </Container>
  );
}
