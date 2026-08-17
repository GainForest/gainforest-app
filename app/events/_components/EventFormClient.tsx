"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ImagePlusIcon } from "lucide-react";
import type { AuthSession } from "@/app/_lib/auth";
import { useAccountList } from "@/app/_lib/account-switcher";
import { canCreateRecord, canDeleteRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";
import { eventHref } from "@/app/_lib/urls";
import { type CommunityEvent, type EventMode } from "@/app/_lib/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { uploadBlob } from "@/app/(manage)/manage/_lib/mutations";
import { createEvent, updateEvent, type EventFormInput } from "../_lib/mutations";
import { guessTimezone, localInputToIso, toLocalInputValue } from "../_lib/format";

const MODES: EventMode[] = ["inperson", "virtual", "hybrid"];

function defaultTimes(): { start: string; end: string } {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  return { start: toLocalInputValue(now), end: toLocalInputValue(end) };
}

function isoToLocalInput(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : toLocalInputValue(d);
}

function chipDate(localValue: string): string {
  if (!localValue) return "—";
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function DateChip({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white backdrop-blur transition-colors hover:bg-white/25"
        >
          <CalendarIcon className="size-3.5" />
          <span className="text-white/70">{label}</span>
          <span className="font-medium">{chipDate(value)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className="w-auto" />
      </PopoverContent>
    </Popover>
  );
}

export function EventFormClient({ session, existing }: { session: AuthSession; existing?: CommunityEvent | null }) {
  const t = useTranslations("events");
  const router = useRouter();
  const sessionDid = session.isLoggedIn ? session.did : null;
  const { personal, groups } = useAccountList(sessionDid);
  const isEdit = Boolean(existing);

  const hostOptions = useMemo(() => {
    const options: Array<{ did: string; label: string; repo?: string }> = [];
    if (sessionDid) {
      options.push({ did: sessionDid, label: personal?.displayName || personal?.handle || t("create.hostPersonal") });
    }
    for (const group of groups) {
      if (canCreateRecord({ kind: "group", role: group.role }).allowed) {
        options.push({
          did: group.groupDid,
          label: group.displayName || group.handle || t("create.hostOrg"),
          repo: group.groupDid,
        });
      }
    }
    return options;
  }, [sessionDid, personal?.displayName, personal?.handle, groups, t]);

  const initial = defaultTimes();
  const [hostDid, setHostDid] = useState<string>(sessionDid ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [mode, setMode] = useState<EventMode>(existing?.mode ?? "inperson");
  const [start, setStart] = useState(isoToLocalInput(existing?.startsAt ?? null) ?? initial.start);
  const [end, setEnd] = useState(isoToLocalInput(existing?.endsAt ?? null) ?? initial.end);
  const [location, setLocation] = useState(existing?.location ?? "");
  const [virtualUrl, setVirtualUrl] = useState(existing?.links?.[0]?.uri ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [visibility, setVisibility] = useState<"public" | "unlisted">(
    existing ? (existing.showInDiscovery ? "public" : "unlisted") : "public",
  );
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(existing?.thumbnailUrl ?? null);
  const [keepExistingCover, setKeepExistingCover] = useState<boolean>(Boolean(existing?.thumbnailBlob));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const timezone = existing?.timezone || guessTimezone();
  const modeLabel: Record<EventMode, string> = {
    inperson: t("create.type.inperson"),
    virtual: t("create.type.virtual"),
    hybrid: t("create.type.hybrid"),
  };

  // Edit permission: personal host, or an org owner/admin.
  const editOrg = existing ? groups.find((g) => g.groupDid === existing.did) : undefined;
  const canEdit =
    !isEdit ||
    Boolean(sessionDid && existing && sessionDid === existing.did) ||
    Boolean(editOrg && canDeleteRecord({ kind: "group", role: editOrg.role }).allowed);

  if (!session.isLoggedIn) {
    return <p className="text-muted-foreground">{t("create.signInRequired")}</p>;
  }
  if (isEdit && !canEdit) {
    return <p className="text-muted-foreground">{t("edit.notAllowed")}</p>;
  }

  function onStartChange(value: string) {
    setStart(value);
    if (value && (!end || Date.parse(end) <= Date.parse(value))) {
      setEnd(toLocalInputValue(new Date(new Date(value).getTime() + 60 * 60 * 1000)));
    }
  }

  function onCoverFileChange(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError(t("create.cover.tooLarge"));
      return;
    }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setKeepExistingCover(false);
    setError(null);
  }

  async function onSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(t("create.nameRequired"));
      return;
    }

    const repo = isEdit
      ? existing && sessionDid && existing.did !== sessionDid
        ? existing.did
        : undefined
      : (hostOptions.find((o) => o.did === hostDid) ?? hostOptions[0])?.repo;

    setSubmitting(true);
    try {
      let cover: { ref: unknown; mimeType: string; size: number } | null = null;
      if (coverFile) {
        const uploaded = await uploadBlob(coverFile, repo ? { repo } : undefined);
        cover = { ref: uploaded.ref, mimeType: uploaded.mimeType, size: uploaded.size };
      } else if (keepExistingCover && existing?.thumbnailBlob) {
        cover = existing.thumbnailBlob;
      }

      const input: EventFormInput = {
        name,
        description,
        mode,
        startsAt: localInputToIso(start),
        endsAt: localInputToIso(end),
        timezone,
        location: mode === "virtual" ? null : location,
        virtualUrl: mode === "inperson" ? null : virtualUrl,
        visibility,
        cover,
      };

      if (isEdit && existing) {
        await updateEvent(existing.rkey, input, repo ? { repo } : undefined);
        router.push(eventHref(existing.did, existing.rkey));
      } else {
        const selected = hostOptions.find((o) => o.did === hostDid) ?? hostOptions[0];
        const { rkey } = await createEvent(input, selected?.repo ? { repo: selected.repo } : undefined);
        router.push(eventHref(selected?.did ?? sessionDid!, rkey));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("create.error"));
      setSubmitting(false);
    }
  }

  const showLocation = mode !== "virtual";
  const showVirtual = mode !== "inperson";
  const groupColumns = 1 + (showLocation ? 1 : 0) + (showVirtual ? 1 : 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* Hero card — its background is the cover; click any empty area to set/replace it. */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl">
        {coverPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverPreview} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/50 to-primary/20" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/40" />

        {/* Background click target for adding/replacing the image */}
        <button
          type="button"
          onClick={() => coverInputRef.current?.click()}
          aria-label={t("form.coverAria")}
          className="absolute inset-0 cursor-pointer"
        />
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => onCoverFileChange(e.target.files?.[0])}
        />
        {!coverPreview ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-white/80">
              <ImagePlusIcon className="size-5" /> {t("form.addCover")}
            </span>
          </div>
        ) : null}

        {/* Content layer (transparent to clicks except its interactive children) */}
        <div className="pointer-events-none relative flex h-full flex-col justify-between p-5">
          <div className="flex items-start justify-between gap-3">
            <Link
              href="/events"
              className="pointer-events-auto inline-flex items-center gap-1 text-white/90 transition-colors hover:text-white"
            >
              <ChevronLeftIcon className="size-5" />
              <span className="text-sm font-medium">{isEdit ? t("form.editTitle") : t("form.newTitle")}</span>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
                >
                  {t(`create.visibility.${visibility}`)}
                  <ChevronDownIcon className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={visibility} onValueChange={(v) => setVisibility(v as "public" | "unlisted")}>
                  {(["public", "unlisted"] as const).map((v) => (
                    <DropdownMenuRadioItem key={v} value={v} className="flex-col items-start gap-0.5">
                      <span className="font-medium">{t(`create.visibility.${v}`)}</span>
                      <span className="text-xs text-muted-foreground">{t(`create.visibility.${v}Hint`)}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-col gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("create.name.placeholder")}
              aria-label={t("create.name.label")}
              autoFocus={!isEdit}
              className="pointer-events-auto w-full bg-transparent font-instrument text-3xl font-light italic tracking-[-0.02em] text-white outline-none placeholder:text-white/50 md:text-4xl"
            />
            <div className="flex flex-wrap items-center gap-2">
              <DateChip label={t("form.starts")} value={start} onChange={onStartChange} />
              <DateChip label={t("form.ends")} value={end} onChange={setEnd} />
            </div>
          </div>
        </div>
      </div>
      <p className="px-1 text-xs text-muted-foreground">{t("create.timezoneNote", { timezone })}</p>

      {/* Body */}
      <div className="flex flex-col gap-6 pt-2">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("create.description.placeholder")}
          aria-label={t("create.description.label")}
          rows={3}
          className="resize-none"
        />

        <div className={cn("grid grid-cols-1 gap-3", groupColumns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <div className="flex flex-col gap-1.5">
            <Label>{t("create.type.label")}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as EventMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {modeLabel[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showLocation ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-location">{t("create.location.label")}</Label>
              <Input
                id="event-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("create.location.placeholder")}
              />
            </div>
          ) : null}

          {showVirtual ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-virtual">{t("create.virtual.label")}</Label>
              <Input
                id="event-virtual"
                value={virtualUrl}
                onChange={(e) => setVirtualUrl(e.target.value)}
                placeholder={t("create.virtual.placeholder")}
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {!isEdit && hostOptions.length > 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("create.hostAs")}</span>
              <Select value={hostDid} onValueChange={(v) => setHostDid(v)}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hostOptions.map((o) => (
                    <SelectItem key={o.did} value={o.did}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="ml-auto flex flex-col items-end gap-2">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button onClick={onSubmit} disabled={submitting || !name.trim()} size="lg">
              {submitting
                ? isEdit
                  ? t("form.saving")
                  : t("create.submitting")
                : isEdit
                  ? t("form.save")
                  : t("create.submit")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
