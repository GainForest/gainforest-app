"use client";

import { useState, type FormEvent } from "react";
import { CalendarIcon, Loader2Icon, XIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  CONTROL_MEANS,
  MATURITY_VALUES,
  OBSERVATION_TYPES,
  SEX_VALUES,
  VISIBILITY_VALUES,
  type ControlMeans,
  type Maturity,
  type ObservationType,
  type Sex,
  type TrapKillRecord,
  type TrapObservationRecord,
  type Visibility,
} from "../_lib/trap-records";

type Props = {
  type: "kill" | "observation";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TrapKillRecord | TrapObservationRecord) => Promise<void>;
  initialData?: Partial<TrapKillRecord> | Partial<TrapObservationRecord>;
  isEditing?: boolean;
};

export function TrapRecordForm({
  type,
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isEditing = false,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [species, setSpecies] = useState(initialData?.species ?? "");
  const [count, setCount] = useState((initialData as TrapKillRecord)?.count ?? 1);
  const [controlMeans, setControlMeans] = useState<ControlMeans>(
    (initialData as TrapKillRecord)?.controlMeans ?? "Shooting"
  );
  const [sex, setSex] = useState<Sex | undefined>((initialData as TrapKillRecord)?.sex);
  const [maturity, setMaturity] = useState<Maturity | undefined>((initialData as TrapKillRecord)?.maturity);
  const [observationType, setObservationType] = useState<ObservationType>(
    (initialData as TrapObservationRecord)?.observationType ?? "Sighting"
  );
  const [occurredAt, setOccurredAt] = useState<Date>(
    initialData?.occurredAt ? new Date(initialData.occurredAt) : new Date()
  );
  const [latitude, setLatitude] = useState(initialData?.location?.latitude ?? "");
  const [longitude, setLongitude] = useState(initialData?.location?.longitude ?? "");
  const [areaName, setAreaName] = useState(initialData?.areaName ?? "");
  const [project, setProject] = useState(initialData?.project ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initialData?.visibility ?? "private");
  const [note, setNote] = useState(initialData?.note ?? "");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!species.trim()) {
      setError("Species is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const location = latitude && longitude ? { latitude, longitude } : undefined;

      if (type === "kill") {
        const record: TrapKillRecord = {
          species: species.trim(),
          count,
          controlMeans,
          sex,
          maturity,
          occurredAt: occurredAt.toISOString(),
          location,
          areaName: areaName || undefined,
          project: project || undefined,
          visibility,
          note: note || undefined,
          createdAt: initialData?.createdAt ?? new Date().toISOString(),
        };
        await onSubmit(record);
      } else {
        const record: TrapObservationRecord = {
          species: species.trim(),
          observationType,
          count: count > 0 ? count : undefined,
          occurredAt: occurredAt.toISOString(),
          location,
          areaName: areaName || undefined,
          project: project || undefined,
          visibility,
          note: note || undefined,
          createdAt: initialData?.createdAt ?? new Date().toISOString(),
        };
        await onSubmit(record);
      }

      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <XIcon className="size-5" />
        </button>

        <h2 className="text-lg font-semibold">
          {isEditing ? "Edit" : "Add"} {type === "kill" ? "Kill Record" : "Field Observation"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {type === "kill"
            ? "Record a pest or ungulate removal."
            : "Record a field observation (sighting, sign, or count)."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Species */}
          <div className="space-y-1.5">
            <Label htmlFor="species">Species *</Label>
            <Input
              id="species"
              placeholder="e.g. Possum, Rat, Deer"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              required
            />
          </div>

          {/* Type-specific fields */}
          {type === "kill" ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="count">Count *</Label>
                  <Input
                    id="count"
                    type="number"
                    min={1}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Control method *</Label>
                  <Select value={controlMeans} onValueChange={(v) => setControlMeans(v as ControlMeans)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTROL_MEANS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Sex</Label>
                  <Select value={sex ?? ""} onValueChange={(v) => setSex(v as Sex)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Unknown" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEX_VALUES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Maturity</Label>
                  <Select value={maturity ?? ""} onValueChange={(v) => setMaturity(v as Maturity)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Unknown" />
                    </SelectTrigger>
                    <SelectContent>
                      {MATURITY_VALUES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Observation type *</Label>
                <Select value={observationType} onValueChange={(v) => setObservationType(v as ObservationType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OBSERVATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="obs-count">Count</Label>
                <Input
                  id="obs-count"
                  type="number"
                  min={0}
                  placeholder="Optional"
                  value={count || ""}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {/* Date */}
          <div className="space-y-1.5">
            <Label>When did this occur? *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !occurredAt && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {occurredAt ? format(occurredAt, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={occurredAt}
                  onSelect={(date) => date && setOccurredAt(date)}
                  disabled={(date) => date > new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label>Location</Label>
            <div className="grid grid-cols-2 gap-4">
              <Input
                placeholder="Latitude"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
              />
              <Input
                placeholder="Longitude"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
              />
            </div>
            <Input
              placeholder="Area name (e.g. North block)"
              className="mt-2"
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
            />
          </div>

          {/* Project & Visibility */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="project">Project</Label>
              <Input
                id="project"
                placeholder="Project name"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY_VALUES.map((vis) => (
                    <SelectItem key={vis} value={vis}>
                      {vis}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="note">Notes</Label>
            <Textarea
              id="note"
              placeholder="Additional details..."
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {isEditing ? "Save changes" : "Add record"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
