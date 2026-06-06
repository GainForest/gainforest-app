"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { CheckIcon, GlobeIcon, ImageIcon, LockIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { countryFlag } from "@/app/_lib/format";
import { cn } from "@/lib/utils";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type Visibility = "Public" | "Unlisted";

type CloseOptions = { clear?: boolean };

function useModalClose() {
  const modal = useModal();
  return async (options?: CloseOptions) => {
    await modal.hide();
    if (options?.clear) modal.clear();
    else modal.popModal();
  };
}

function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function isValidWebsite(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(normalizeWebsite(value) ?? "");
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const COMMON_COUNTRIES = [
  "BR", "ID", "KE", "US", "GB", "CH", "DE", "FR", "CO", "PE", "EC", "MX", "IN", "NP", "TZ", "UG", "RW", "GH", "CM", "CD", "MG", "AU", "CA", "CR", "PA",
];

export function ImageEditorModal({
  title,
  description,
  currentUrl,
  onConfirm,
}: {
  title: string;
  description: string;
  currentUrl: string | null;
  onConfirm: (file: File) => void;
}) {
  const close = useModalClose();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function handleFile(nextFile: File | null) {
    setError(null);
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!nextFile.type.startsWith("image/")) {
      setError("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (nextFile.size > MAX_IMAGE_SIZE_BYTES) {
      setError(`Image must be smaller than ${formatBytes(MAX_IMAGE_SIZE_BYTES)}.`);
      return;
    }
    setFile(nextFile);
  }

  return (
    <ModalContent className="space-y-4">
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>

      <label className="relative flex min-h-48 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/30 text-center transition-colors hover:border-primary/60 hover:bg-primary/5">
        {previewUrl || currentUrl ? (
          <Image src={previewUrl ?? currentUrl ?? ""} alt="Selected image preview" fill unoptimized className="object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
            Drop an image here or click to browse
          </span>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />
        <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur">
          <UploadIcon className="h-3.5 w-3.5" /> Choose image
        </span>
      </label>

      {file ? <p className="text-xs text-muted-foreground">{file.name} · {formatBytes(file.size)}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ModalFooter>
        <Button type="button" variant="outline" onClick={() => void close()}>Cancel</Button>
        <Button
          type="button"
          disabled={!file}
          onClick={() => {
            if (!file) return;
            onConfirm(file);
            void close({ clear: true });
          }}
        >
          Save image
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

export function WebsiteEditorModal({
  currentWebsite,
  onConfirm,
}: {
  currentWebsite: string;
  onConfirm: (website: string) => void;
}) {
  const close = useModalClose();
  const [website, setWebsite] = useState(currentWebsite);
  const valid = isValidWebsite(website);

  return (
    <ModalContent className="space-y-4">
      <ModalHeader>
        <ModalTitle>Edit website</ModalTitle>
        <ModalDescription>Add a public website for this profile, or remove it entirely.</ModalDescription>
      </ModalHeader>
      <div className="space-y-1.5">
        <label htmlFor="manage-website" className="text-sm font-medium">Website URL</label>
        <Input id="manage-website" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.org" aria-invalid={!valid} autoFocus />
        {!valid ? <p className="text-xs text-destructive">Enter a valid website URL.</p> : null}
      </div>
      <ModalFooter>
        <Button type="button" variant="outline" onClick={() => void close()}>Cancel</Button>
        <Button type="button" variant="secondary" onClick={() => { onConfirm(""); void close({ clear: true }); }}>Remove</Button>
        <Button type="button" disabled={!valid} onClick={() => { onConfirm(normalizeWebsite(website) ?? ""); void close({ clear: true }); }}>Save</Button>
      </ModalFooter>
    </ModalContent>
  );
}

export function StartDateSelectorModal({
  currentDate,
  onConfirm,
}: {
  currentDate: string;
  onConfirm: (date: string) => void;
}) {
  const close = useModalClose();
  const [date, setDate] = useState(currentDate);

  return (
    <ModalContent className="space-y-4">
      <ModalHeader>
        <ModalTitle>Edit founding date</ModalTitle>
        <ModalDescription>Choose when this organization started its work.</ModalDescription>
      </ModalHeader>
      <div className="space-y-1.5">
        <label htmlFor="manage-start-date" className="text-sm font-medium">Founding date</label>
        <Input id="manage-start-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} autoFocus />
      </div>
      <ModalFooter>
        <Button type="button" variant="outline" onClick={() => void close()}>Cancel</Button>
        <Button type="button" variant="secondary" onClick={() => { onConfirm(""); void close({ clear: true }); }}>Clear</Button>
        <Button type="button" onClick={() => { onConfirm(date); void close({ clear: true }); }}>Save</Button>
      </ModalFooter>
    </ModalContent>
  );
}

export function CountrySelectorModal({
  currentCountry,
  onConfirm,
}: {
  currentCountry: string;
  onConfirm: (country: string) => void;
}) {
  const close = useModalClose();
  const [query, setQuery] = useState(currentCountry);
  const normalized = query.trim().toUpperCase().slice(0, 2);
  const valid = normalized.length === 0 || /^[A-Z]{2}$/.test(normalized);

  const countries = COMMON_COUNTRIES.filter((code) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return code.toLowerCase().includes(q) || countryName(code).toLowerCase().includes(q);
  });

  return (
    <ModalContent className="space-y-4">
      <ModalHeader>
        <ModalTitle>Edit country</ModalTitle>
        <ModalDescription>Select the organization country. You can type any ISO two-letter country code.</ModalDescription>
      </ModalHeader>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search or type country code…" autoFocus />
      {!valid ? <p className="text-xs text-destructive">Use a two-letter country code, e.g. BR.</p> : null}
      <div className="grid max-h-64 gap-1 overflow-auto rounded-xl border border-border p-1">
        {countries.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setQuery(code)}
            className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted", normalized === code && "bg-primary/10 text-primary")}
          >
            <span className="text-base">{countryFlag(code)}</span>
            <span className="flex-1">{countryName(code)}</span>
            <span className="text-xs text-muted-foreground">{code}</span>
          </button>
        ))}
      </div>
      <ModalFooter>
        <Button type="button" variant="outline" onClick={() => void close()}>Cancel</Button>
        <Button type="button" variant="secondary" onClick={() => { onConfirm(""); void close({ clear: true }); }}>Remove</Button>
        <Button type="button" disabled={!valid} onClick={() => { onConfirm(normalized); void close({ clear: true }); }}>Save</Button>
      </ModalFooter>
    </ModalContent>
  );
}

const VISIBILITY_OPTIONS: Array<{ value: Visibility; title: string; description: string; Icon: typeof GlobeIcon }> = [
  { value: "Public", title: "Public", description: "Visible in public organization lists and profile surfaces.", Icon: GlobeIcon },
  { value: "Unlisted", title: "Unlisted", description: "Accessible by direct link, but hidden from public discovery surfaces.", Icon: LockIcon },
];

export function VisibilitySelectorModal({
  currentVisibility,
  onConfirm,
}: {
  currentVisibility: Visibility;
  onConfirm: (visibility: Visibility) => void;
}) {
  const close = useModalClose();
  const [visibility, setVisibility] = useState<Visibility>(currentVisibility);

  return (
    <ModalContent className="space-y-4">
      <ModalHeader>
        <ModalTitle>Edit visibility</ModalTitle>
        <ModalDescription>Choose how this organization should appear on Bumicerts.</ModalDescription>
      </ModalHeader>
      <div className="grid gap-2">
        {VISIBILITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setVisibility(option.value)}
            className={cn("flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors hover:bg-muted/40", visibility === option.value ? "border-primary bg-primary/5" : "border-border")}
          >
            <span className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary"><option.Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{option.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
            </span>
            {visibility === option.value ? <CheckIcon className="h-5 w-5 text-primary" /> : null}
          </button>
        ))}
      </div>
      <ModalFooter>
        <Button type="button" variant="outline" onClick={() => void close()}>Cancel</Button>
        <Button type="button" onClick={() => { onConfirm(visibility); void close({ clear: true }); }}>Save</Button>
      </ModalFooter>
    </ModalContent>
  );
}

export function RemoveChip({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
      <XIcon className="h-3 w-3" />
    </button>
  );
}
