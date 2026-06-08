"use client";

import type { ChangeEvent, ReactNode } from "react";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "./audio-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getUriRkey } from "./audio-utils";
import type { OperationStep } from "./types";

export function ProgressState(props: { step: OperationStep }) {
  const t = useTranslations("upload.audio.forms");
  const steps: OperationStep[] = ["audio", "occurrence", "complete"];
  const index = steps.indexOf(props.step);
  const percent = ((index + 1) / steps.length) * 100;
  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-2 flex justify-between text-xs text-muted-foreground">
        <span>{t("savingUpload")}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function FormShell(props: {
  title: string;
  children: ReactNode;
  error: string | null;
  isPending: boolean;
  disabled: boolean;
  onSave: () => void;
}) {
  const t = useTranslations("upload.actions");
  return (
    <section className="space-y-5 rounded-3xl border p-5">
      <h2 className="font-instrument text-xl font-semibold italic">{props.title}</h2>
      <div className="space-y-4">{props.children}</div>
      {props.error && <p className="text-sm text-destructive">{props.error}</p>}
      <div className="flex justify-end">
        <Button onClick={props.onSave} disabled={props.disabled || props.isPending}>
          {props.isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          {props.isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </section>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">
        {props.label}
        {props.required && <span className="text-destructive"> *</span>}
      </span>
      <Input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event: ChangeEvent<HTMLInputElement>) => props.onChange(event.target.value)}
      />
    </label>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      <Textarea
        value={props.value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => props.onChange(event.target.value)}
        rows={3}
      />
    </label>
  );
}

export function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string | null }>;
  emptyLabel?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        {props.emptyLabel && <option value="">{props.emptyLabel}</option>}
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label ?? getUriRkey(option.value)}
          </option>
        ))}
      </select>
    </label>
  );
}
