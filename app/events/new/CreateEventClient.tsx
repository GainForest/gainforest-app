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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="font-instrument text-3xl font-light italic tracking-[-0.02em] text-foreground md:text-4xl">
        {t("create.title")}
      </h1>

      {hostOptions.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-host">{t("create.hostAs")}</Label>
          <Select value={hostDid} onValueChange={(v) => setHostDid(v)}>
            <SelectTrigger id="event-host" className="w-full sm:max-w-xs">
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-name">{t("create.name.label")}</Label>
        <Input
          id="event-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("create.name.placeholder")}
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("create.type.label")}</Label>
        <div className="inline-flex h-10 w-fit items-center rounded-full border border-border bg-background/50 p-0.5">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {modeLabel[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-start">{t("create.start")}</Label>
          <Input
            id="event-start"
            type="datetime-local"
            value={start}
            onChange={(e) => onStartChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-end">{t("create.end")}</Label>
          <Input id="event-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">{t("create.timezoneNote", { timezone })}</p>

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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-description">{t("create.description.label")}</Label>
        <Textarea
          id="event-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("create.description.placeholder")}
          rows={4}
        />
      </div>

      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        >
          {t("create.advanced")}
          <ChevronDownIcon className={cn("size-4 transition-transform", advancedOpen && "rotate-180")} />
        </button>
        {advancedOpen ? (
          <div className="flex flex-col gap-3 border-t border-border p-4">
            <Label>{t("create.visibility.label")}</Label>
            <div className="inline-flex h-10 w-fit items-center rounded-full border border-border bg-background/50 p-0.5">
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
            </div>
            <p className="text-xs text-muted-foreground">{t(`create.visibility.${visibility}Hint`)}</p>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button onClick={onSubmit} disabled={submitting || !name.trim()} size="lg">
        {submitting ? t("create.submitting") : t("create.submit")}
      </Button>
    </div>
  );
}
