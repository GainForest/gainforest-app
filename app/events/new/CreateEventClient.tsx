"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "lucide-react";
import type { AuthSession } from "@/app/_lib/auth";
import { useAccountList } from "@/app/_lib/account-switcher";
import { canCreateRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";
import { eventHref } from "@/app/_lib/urls";
import { type EventMode } from "@/app/_lib/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createEvent, type EventFormInput } from "../_lib/mutations";
import { guessTimezone, localInputToIso, toLocalInputValue } from "../_lib/format";

const MODES: EventMode[] = ["inperson", "virtual", "hybrid"];

function defaultTimes(): { start: string; end: string } {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  return { start: toLocalInputValue(now), end: toLocalInputValue(end) };
}

export function CreateEventClient({ session }: { session: AuthSession }) {
  const t = useTranslations("events");
  const router = useRouter();
  const sessionDid = session.isLoggedIn ? session.did : null;
  const { personal, groups } = useAccountList(sessionDid);

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
  const [name, setName] = useState("");
  const [mode, setMode] = useState<EventMode>("inperson");
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [location, setLocation] = useState("");
  const [virtualUrl, setVirtualUrl] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timezone = guessTimezone();
  const modeLabel: Record<EventMode, string> = {
    inperson: t("create.type.inperson"),
    virtual: t("create.type.virtual"),
    hybrid: t("create.type.hybrid"),
  };

  if (!session.isLoggedIn) {
    return <p className="text-muted-foreground">{t("create.signInRequired")}</p>;
  }

  // Keep end after start automatically.
  function onStartChange(value: string) {
    setStart(value);
    if (value && (!end || Date.parse(end) <= Date.parse(value))) {
      const next = new Date(new Date(value).getTime() + 60 * 60 * 1000);
      setEnd(toLocalInputValue(next));
    }
  }

  async function onSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(t("create.nameRequired"));
      return;
    }
    const selected = hostOptions.find((o) => o.did === hostDid) ?? hostOptions[0];
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
    };
    setSubmitting(true);
    try {
      const { rkey } = await createEvent(input, selected?.repo ? { repo: selected.repo } : undefined);
      router.push(eventHref(selected?.did ?? sessionDid!, rkey));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("create.error"));
      setSubmitting(false);
    }
  }

  const showLocation = mode !== "virtual";
  const showVirtual = mode !== "inperson";
  // Type + the visible ones among Location / Link, spread evenly across a row.
  const groupColumns = 1 + (showLocation ? 1 : 0) + (showVirtual ? 1 : 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <h1 className="font-instrument text-3xl font-light italic tracking-[-0.02em] text-foreground md:text-4xl">
        {t("create.title")}
      </h1>

      <div className="flex flex-col gap-6 pt-6">
        {/* 1 · Event name — big, label-less, borderless; priority by size */}
        <div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("create.name.placeholder")}
            aria-label={t("create.name.label")}
            autoFocus
            className="w-full bg-transparent font-instrument text-4xl font-light italic tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-5xl"
          />
        </div>

        {/* 2 · About */}
        <div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("create.description.placeholder")}
            aria-label={t("create.description.label")}
            rows={3}
            className="resize-none"
          />
        </div>

        {/* 3 · Date selection */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-start">{t("create.start")}</Label>
              <Input id="event-start" type="datetime-local" value={start} onChange={(e) => onStartChange(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-end">{t("create.end")}</Label>
              <Input id="event-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("create.timezoneNote", { timezone })}</p>
        </div>

        {/* 4 · Type / Location / Link — clubbed, spread evenly */}
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

        {/* 5 · Advanced options (visibility) — borderless disclosure */}
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("create.advanced")}
            <ChevronDownIcon className={cn("size-4 transition-transform", advancedOpen && "rotate-180")} />
          </button>
          {advancedOpen ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {(["public", "unlisted"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors",
                    visibility === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`create.visibility.${v}`)}
                </button>
              ))}
              <p className="text-xs text-muted-foreground">{t(`create.visibility.${visibility}Hint`)}</p>
            </div>
          ) : null}
        </div>

        {/* 6 · Publish row — host-as inline on the left, Publish on the right */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {hostOptions.length > 1 ? (
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

          <div className="flex flex-col items-end gap-2">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button onClick={onSubmit} disabled={submitting || !name.trim()} size="lg" className={cn(!(hostOptions.length > 1) && "ml-auto")}>
              {submitting ? t("create.submitting") : t("create.submit")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
