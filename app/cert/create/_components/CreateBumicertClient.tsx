"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BadgeCheckIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  HelpCircleIcon,
  ImagePlusIcon,
  LeafIcon,
  Loader2Icon,
  MapPinIcon,
  PartyPopperIcon,
  PlusIcon,
  SaveIcon,
  SparklesIcon,
  SproutIcon,
  Trash2Icon,
  UsersIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { AuthSession } from "@/app/_lib/auth";
import { AuthButton } from "@/app/_components/AuthFlow";
import { localBumicertHref, hyperscanRecordHref } from "@/app/_lib/urls";
import { createRecord, uploadBlob } from "@/app/(manage)/manage/_lib/mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ManagedLocation = {
  metadata: {
    did: string;
    uri: string;
    rkey: string;
    cid: string;
    createdAt: string | null;
  };
  record: {
    name: string | null;
    description: string | null;
    locationType: string | null;
    location: unknown;
  };
};

type FormValues = {
  title: string;
  shortDescription: string;
  description: string;
  scopes: string[];
  customScope: string;
  startDate: string;
  endDate: string;
  ongoing: boolean;
  contributors: string[];
  selectedLocationUris: string[];
};

type Draft = {
  id: string;
  updatedAt: string;
  values: FormValues;
};

type PublishResult = {
  uri: string;
  cid: string;
  rkey: string;
};

type StepId = "basics" | "story" | "network" | "review";

type SitesStatus = "idle" | "loading" | "ready" | "error" | "unauthorized";

const DRAFT_STORAGE_KEY = "bumicerts:create-drafts:v1";
const COLLECTION = "org.hypercerts.claim.activity";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EMPTY_FORM: FormValues = {
  title: "",
  shortDescription: "",
  description: "",
  scopes: [],
  customScope: "",
  startDate: "",
  endDate: "",
  ongoing: true,
  contributors: [""],
  selectedLocationUris: [],
};

const WORK_SCOPES = [
  "Reforestation",
  "Forest protection",
  "Biodiversity monitoring",
  "Community stewardship",
  "Carbon removal",
  "Restoration maintenance",
] as const;

const STEPS: Array<{
  id: StepId;
  label: string;
  eyebrow: string;
  icon: typeof LeafIcon;
}> = [
  { id: "basics", label: "Basics", eyebrow: "01", icon: LeafIcon },
  { id: "story", label: "Story", eyebrow: "02", icon: FileTextIcon },
  { id: "network", label: "People & places", eyebrow: "03", icon: UsersIcon },
  { id: "review", label: "Review", eyebrow: "04", icon: ClipboardCheckIcon },
];

function loadDrafts(): Draft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Draft[];
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function saveDrafts(drafts: Draft[]) {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts.slice(0, 12)));
}

function titleFromDraft(draft: Draft) {
  return draft.values.title.trim() || "Untitled Cert";
}

function formatDraftDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Recently";
  }
}

function clampDescription(value: string) {
  return value.trim().slice(0, 300);
}

function dateToIso(date: string) {
  return new Date(`${date}T12:00:00.000Z`).toISOString();
}

function extractRkey(uri: string) {
  return uri.split("/").filter(Boolean).pop() ?? "";
}

function scopeSummary(values: FormValues) {
  const pieces = [...values.scopes, values.customScope.trim()].filter(Boolean);
  return pieces.length ? pieces.join(", ") : "Define the impact scope";
}

function contributorList(values: FormValues) {
  return values.contributors.map((item) => item.trim()).filter(Boolean);
}

function selectedLocations(values: FormValues, sites: ManagedLocation[]) {
  const selected = new Set(values.selectedLocationUris);
  return sites.filter((site) => selected.has(site.metadata.uri));
}

function validateStep(step: StepId, values: FormValues) {
  if (step === "basics") {
    if (values.title.trim().length < 4) return "Add a clear project title.";
    if (!values.startDate) return "Choose when the work started.";
    if (!values.ongoing && !values.endDate) return "Add an end date or mark the work as ongoing.";
    if (!values.ongoing && values.endDate < values.startDate) return "End date cannot be before start date.";
    if (!scopeSummary(values) || scopeSummary(values) === "Define the impact scope") return "Select at least one work scope.";
  }
  if (step === "story") {
    if (clampDescription(values.shortDescription).length < 30) return "Write a short summary of at least 30 characters.";
    if (values.description.trim().length < 80) return "Add the evidence story, methodology, and outcome details.";
  }
  if (step === "network") {
    if (contributorList(values).length === 0) return "Add at least one contributor or steward.";
  }
  return null;
}

function validateAll(values: FormValues) {
  for (const step of STEPS) {
    const error = validateStep(step.id, values);
    if (error) return error;
  }
  return null;
}

function StepPill({
  step,
  active,
  complete,
  onClick,
}: {
  step: (typeof STEPS)[number];
  active: boolean;
  complete: boolean;
  onClick: () => void;
}) {
  const Icon = step.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex min-w-[10rem] flex-1 items-center gap-3 rounded-2xl border p-3 text-left transition-all",
        active
          ? "border-primary/40 bg-primary/[0.08] shadow-sm"
          : "border-border bg-card/70 hover:border-primary/25 hover:bg-primary/[0.04]",
      )}
    >
      {active ? (
        <motion.span
          layoutId="create-step-glow"
          className="absolute inset-0 -z-10 rounded-2xl bg-primary/10 blur-xl"
        />
      ) : null}
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl border",
          active || complete
            ? "border-primary/20 bg-primary text-primary-foreground"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        {complete ? <CheckCircle2Icon className="size-5" /> : <Icon className="size-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {step.eyebrow}
        </span>
        <span className="block truncate text-sm font-semibold text-foreground">
          {step.label}
        </span>
      </span>
    </button>
  );
}

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Label className="text-[13px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
          {label}
        </Label>
        {hint ? <p className="text-sm leading-6 text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function ScopeChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-medium transition-all",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-background/70 text-foreground/75 hover:border-primary/35 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function CreateHero({ session }: { session: AuthSession }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_27rem]">
      <section className="relative overflow-visible rounded-[1.8rem] border border-border bg-card shadow-sm">
        <div className="relative min-h-[20rem] overflow-hidden rounded-[1.72rem]">
          <Image
            src="/assets/media/images/create-bumicert/hero-light@2x.webp"
            alt=""
            fill
            priority
            quality={95}
            sizes="(min-width: 1024px) 760px, 100vw"
            className="object-cover object-center dark:hidden"
          />
          <Image
            src="/assets/media/images/create-bumicert/hero-dark@2x.webp"
            alt=""
            fill
            priority
            quality={95}
            sizes="(min-width: 1024px) 760px, 100vw"
            className="hidden object-cover object-center dark:block"
          />
          <div className="absolute inset-0 bg-linear-to-r from-background/96 via-background/75 to-background/5 dark:from-background/93 dark:via-background/62 dark:to-background/10" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-foreground/15 via-foreground/5 to-transparent dark:from-black/65" />

          <div className="relative z-10 flex min-h-[20rem] max-w-[29rem] flex-col justify-center px-6 py-9 sm:px-9">
            <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <SparklesIcon className="size-3.5" />
              Impact story studio
            </div>
            <h1 className="font-serif text-5xl font-medium leading-[0.92] tracking-[-0.04em] text-foreground sm:text-6xl">
              Create a<br />Cert
            </h1>
            <p className="mt-5 max-w-[22rem] text-base leading-7 text-muted-foreground">
              Turn field work, restoration evidence, and community stewardship into a publishable impact story — without leaving GainForest.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {session.isLoggedIn ? (
                <Button asChild size="lg" className="shadow-lg shadow-primary/15">
                  <a href="#create-studio">
                    Start the guided flow
                    <ArrowRightIcon />
                  </a>
                </Button>
              ) : (
                <AuthButton session={session} />
              )}
              <Button variant="outline" size="lg" asChild>
                <a href="#how-it-works">
                  How it works
                  <HelpCircleIcon />
                </a>
              </Button>
            </div>
          </div>
        </div>
        <Image
          src="/assets/media/images/create-bumicert/plant-light.png"
          alt=""
          width={1002}
          height={1146}
          priority
          className="pointer-events-none absolute bottom-0 right-[3%] z-20 hidden h-[31rem] w-auto max-w-[54%] object-contain dark:hidden md:block"
        />
        <Image
          src="/assets/media/images/create-bumicert/plant-dark.png"
          alt=""
          width={964}
          height={1129}
          priority
          className="pointer-events-none absolute bottom-0 right-[3%] z-20 hidden h-[31rem] w-auto max-w-[54%] object-contain dark:md:block"
        />
      </section>

      <aside id="how-it-works" className="rounded-[1.8rem] border border-border bg-card/80 p-7 shadow-sm backdrop-blur">
        <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <WandSparklesIcon className="size-5" />
        </div>
        <h2 className="font-serif text-3xl font-medium leading-tight tracking-[-0.02em] text-foreground">
          Designed for fast, credible publishing.
        </h2>
        <div className="mt-5 space-y-4 text-sm leading-6 text-muted-foreground">
          {[
            ["Structure", "Capture the story title, scope, dates, and public summary in a focused sequence."],
            ["Evidence", "Add the long-form story and optional cover image for easy previews."],
            ["Provenance", "Attach contributors and certified site boundaries already in your GainForest account."],
          ].map(([title, body]) => (
            <div key={title} className="flex gap-3">
              <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BadgeCheckIcon className="size-3.5" />
              </span>
              <p>
                <span className="font-semibold text-foreground">{title}.</span> {body}
              </p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function LivePreview({
  values,
  coverPreview,
  sites,
}: {
  values: FormValues;
  coverPreview: string | null;
  sites: ManagedLocation[];
}) {
  const contributors = contributorList(values);
  const siteCount = selectedLocations(values, sites).length;
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="overflow-hidden rounded-[1.7rem] border border-border bg-card shadow-sm">
        <div className="relative h-56 overflow-hidden bg-primary/[0.08]">
          {coverPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_35%_20%,theme(colors.primary/0.25),transparent_34%),linear-gradient(135deg,theme(colors.primary/0.12),transparent_45%),linear-gradient(180deg,theme(colors.muted),theme(colors.background))]">
              <div className="flex size-20 items-center justify-center rounded-[2rem] border border-primary/20 bg-background/75 text-primary shadow-sm backdrop-blur">
                <LeafIcon className="size-9" />
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-black/55 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 text-white">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75">Live preview</p>
              <h3 className="mt-1 line-clamp-2 font-serif text-3xl leading-none tracking-[-0.03em]">
                {values.title.trim() || "Untitled impact story"}
              </h3>
            </div>
            <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs backdrop-blur">
              Draft
            </span>
          </div>
        </div>
        <div className="space-y-5 p-5">
          <p className="text-sm leading-6 text-muted-foreground">
            {clampDescription(values.shortDescription) || "Write a crisp public summary so funders and collaborators immediately understand the outcome."}
          </p>
          <div className="flex flex-wrap gap-2">
            {scopeSummary(values) === "Define the impact scope" ? (
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Define scope</span>
            ) : (
              scopeSummary(values)
                .split(",")
                .map((scope) => scope.trim())
                .filter(Boolean)
                .slice(0, 4)
                .map((scope) => (
                  <span key={scope} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {scope}
                  </span>
                ))
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
            <div>
              <p className="text-lg font-semibold text-foreground">{values.startDate ? "✓" : "—"}</p>
              <p className="text-[11px] text-muted-foreground">Dates</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">{contributors.length}</p>
              <p className="text-[11px] text-muted-foreground">People</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">{siteCount}</p>
              <p className="text-[11px] text-muted-foreground">Sites</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function DraftRail({
  drafts,
  onLoad,
  onDelete,
}: {
  drafts: Draft[];
  onLoad: (draft: Draft) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-card/80 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Local drafts</h2>
          <p className="text-xs text-muted-foreground">Autosaved in this browser.</p>
        </div>
        <SaveIcon className="size-4 text-muted-foreground" />
      </div>
      {drafts.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">
          Your saved Cert drafts will appear here after you start editing.
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {drafts.slice(0, 6).map((draft) => (
            <div key={draft.id} className="group rounded-2xl border border-border bg-background/65 p-3 transition-colors hover:border-primary/30">
              <button type="button" onClick={() => onLoad(draft)} className="block w-full text-left">
                <p className="truncate text-sm font-semibold text-foreground">{titleFromDraft(draft)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Saved {formatDraftDate(draft.updatedAt)}</p>
              </button>
              <button
                type="button"
                onClick={() => onDelete(draft.id)}
                className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2Icon className="size-3" /> Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BasicsStep({
  values,
  setValues,
  coverFile,
  coverPreview,
  onCoverChange,
  onCoverClear,
}: {
  values: FormValues;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  coverFile: File | null;
  coverPreview: string | null;
  onCoverChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCoverClear: () => void;
}) {
  const toggleScope = (scope: string) => {
    setValues((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((item) => item !== scope)
        : [...current.scopes, scope],
    }));
  };

  return (
    <div className="space-y-7">
      <FieldShell label="Project title" hint="Use the title people will recognize on marketplace cards and detail pages.">
        <Input
          value={values.title}
          onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
          maxLength={256}
          placeholder="Mangrove restoration in Rufiji Delta"
          className="h-12 rounded-2xl bg-background/80 px-4 text-base"
        />
      </FieldShell>

      <FieldShell label="Cover image" hint="Optional, but strongly recommended. PNG, JPEG, or WebP up to 5MB.">
        <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="group relative grid h-40 cursor-pointer place-items-center overflow-hidden rounded-3xl border border-dashed border-primary/30 bg-primary/[0.06] text-center transition-colors hover:bg-primary/[0.09]">
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreview} alt="Selected cover" className="h-full w-full object-cover" />
            ) : (
              <span className="space-y-2 px-4 text-primary">
                <ImagePlusIcon className="mx-auto size-8" />
                <span className="block text-sm font-semibold">Upload cover</span>
              </span>
            )}
            <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="sr-only" onChange={onCoverChange} />
          </label>
          <div className="flex flex-col justify-center rounded-3xl border border-border bg-muted/35 p-5">
            <p className="text-sm leading-6 text-muted-foreground">
              A strong visual helps the Cert feel trustworthy and complete. The image is added only when you publish.
            </p>
            {coverFile ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-background px-3 py-1">{coverFile.name}</span>
                <span className="rounded-full bg-background px-3 py-1">{(coverFile.size / 1024 / 1024).toFixed(2)} MB</span>
                <button type="button" onClick={onCoverClear} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-destructive hover:bg-destructive/10">
                  <XIcon className="size-3" /> Remove
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </FieldShell>

      <FieldShell label="Work scope" hint="Choose every outcome category that applies.">
        <div className="flex flex-wrap gap-2">
          {WORK_SCOPES.map((scope) => (
            <ScopeChip key={scope} label={scope} active={values.scopes.includes(scope)} onClick={() => toggleScope(scope)} />
          ))}
        </div>
        <Input
          value={values.customScope}
          onChange={(event) => setValues((current) => ({ ...current, customScope: event.target.value }))}
          placeholder="Add another scope, e.g. Indigenous governance"
          className="mt-3 rounded-2xl bg-background/80"
        />
      </FieldShell>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell label="Start date">
          <div className="relative">
            <CalendarDaysIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={values.startDate}
              onChange={(event) => setValues((current) => ({ ...current, startDate: event.target.value }))}
              className="h-11 rounded-2xl bg-background/80 pl-9"
            />
          </div>
        </FieldShell>
        <FieldShell label="End date">
          <div className="space-y-3">
            <div className="relative">
              <CalendarDaysIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                value={values.endDate}
                disabled={values.ongoing}
                onChange={(event) => setValues((current) => ({ ...current, endDate: event.target.value }))}
                className="h-11 rounded-2xl bg-background/80 pl-9 disabled:opacity-40"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={values.ongoing}
                onChange={(event) => setValues((current) => ({ ...current, ongoing: event.target.checked, endDate: event.target.checked ? "" : current.endDate }))}
                className="size-4 rounded border-border accent-primary"
              />
              This work is ongoing
            </label>
          </div>
        </FieldShell>
      </div>
    </div>
  );
}

function StoryStep({ values, setValues }: { values: FormValues; setValues: React.Dispatch<React.SetStateAction<FormValues>> }) {
  const shortCount = clampDescription(values.shortDescription).length;
  return (
    <div className="space-y-7">
      <FieldShell label="Short summary" hint="The marketplace preview uses this first. Keep it concrete, funder-friendly, and under 300 characters.">
        <Textarea
          value={values.shortDescription}
          onChange={(event) => setValues((current) => ({ ...current, shortDescription: event.target.value.slice(0, 300) }))}
          placeholder="Local stewards restored degraded mangrove plots, verified survival rates, and documented biodiversity return across community-managed sites."
          className="min-h-28 rounded-3xl bg-background/80 p-4 text-base leading-7"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{shortCount < 30 ? "Aim for at least 30 characters." : "Preview-ready summary."}</span>
          <span>{shortCount}/300</span>
        </div>
      </FieldShell>

      <FieldShell label="Evidence story" hint="Explain the work, methodology, proof, beneficiaries, and what changed. Markdown is okay.">
        <Textarea
          value={values.description}
          onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
          placeholder={`What happened?\n\nHow was impact measured?\n\nWhat evidence should funders inspect?\n\nWho benefits and what happens next?`}
          className="min-h-72 rounded-3xl bg-background/80 p-4 font-mono text-sm leading-7"
        />
      </FieldShell>
    </div>
  );
}

function NetworkStep({
  values,
  setValues,
  sites,
  sitesStatus,
  sitesError,
  refreshSites,
}: {
  values: FormValues;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  sites: ManagedLocation[];
  sitesStatus: SitesStatus;
  sitesError: string | null;
  refreshSites: () => void;
}) {
  const updateContributor = (index: number, value: string) => {
    setValues((current) => ({
      ...current,
      contributors: current.contributors.map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  };
  const removeContributor = (index: number) => {
    setValues((current) => ({
      ...current,
      contributors: current.contributors.filter((_, itemIndex) => itemIndex !== index),
    }));
  };
  const toggleLocation = (uri: string) => {
    setValues((current) => ({
      ...current,
      selectedLocationUris: current.selectedLocationUris.includes(uri)
        ? current.selectedLocationUris.filter((item) => item !== uri)
        : [...current.selectedLocationUris, uri],
    }));
  };

  return (
    <div className="space-y-7">
      <FieldShell label="People named" hint="Add people, teams, or community groups that should appear with this story.">
        <div className="space-y-3">
          {values.contributors.map((contributor, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={contributor}
                onChange={(event) => updateContributor(index, event.target.value)}
                placeholder={index === 0 ? "Rufiji Mangrove Stewards" : "Person or group name"}
                className="h-11 rounded-2xl bg-background/80"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={values.contributors.length === 1}
                onClick={() => removeContributor(index)}
                aria-label="Remove person or group"
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setValues((current) => ({ ...current, contributors: [...current.contributors, ""] }))}
          className="mt-3"
        >
          <PlusIcon /> Add person or group
        </Button>
      </FieldShell>

      <FieldShell label="Sites" hint="Attach sites from your account. You can publish without them, but site-linked Certs are easier to understand.">
        <div className="rounded-3xl border border-border bg-background/70 p-3">
          {sitesStatus === "loading" ? (
            <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> Loading your sites…
            </div>
          ) : sitesStatus === "unauthorized" ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-sm leading-6 text-muted-foreground">
              Sign in to attach certified locations from your GainForest account. You can still draft the Cert locally before signing in.
            </div>
          ) : sitesStatus === "error" ? (
            <div className="space-y-3 p-4 text-sm text-muted-foreground">
              <p>{sitesError ?? "Could not load sites."}</p>
              <Button type="button" variant="outline" size="sm" onClick={refreshSites}>Retry</Button>
            </div>
          ) : sites.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-sm leading-6 text-muted-foreground">
              No certified locations found yet. Publish this Cert now, or create site boundaries under <Link href="/manage/sites" className="text-primary hover:underline">Manage → Sites</Link> and come back.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {sites.map((site) => {
                const active = values.selectedLocationUris.includes(site.metadata.uri);
                return (
                  <button
                    type="button"
                    key={site.metadata.uri}
                    onClick={() => toggleLocation(site.metadata.uri)}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border p-3 text-left transition-all",
                      active
                        ? "border-primary/40 bg-primary/[0.08]"
                        : "border-border bg-card hover:border-primary/25",
                    )}
                  >
                    <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <MapPinIcon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{site.record.name || "Unnamed site"}</span>
                      <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {site.record.description || site.record.locationType || "Project place"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </FieldShell>
    </div>
  );
}

function ReviewStep({ values, sites, publishError }: { values: FormValues; sites: ManagedLocation[]; publishError: string | null }) {
  const rows = [
    ["Title", values.title.trim() || "Missing"],
    ["Scope", scopeSummary(values)],
    ["Dates", values.startDate ? `${values.startDate} → ${values.ongoing ? "ongoing" : values.endDate || "missing"}` : "Missing"],
    ["Summary", clampDescription(values.shortDescription) || "Missing"],
    ["People named", contributorList(values).join(", ") || "Missing"],
    ["Sites", selectedLocations(values, sites).map((site) => site.record.name || "Project place").join(", ") || "None attached"],
  ];
  const validation = validateAll(values);
  return (
    <div className="space-y-6">
      <div className={cn("rounded-3xl border p-5", validation ? "border-warn/30 bg-warn/10" : "border-primary/20 bg-primary/[0.08]") }>
        <div className="flex items-start gap-3">
          {validation ? <HelpCircleIcon className="mt-0.5 size-5 text-warn" /> : <CheckCircle2Icon className="mt-0.5 size-5 text-primary" />}
          <div>
            <h3 className="font-semibold text-foreground">{validation ? "One more thing" : "Ready to publish"}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {validation || "Publishing adds this Cert to your public profile."}
            </p>
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-3xl border border-border bg-background/70">
        {rows.map(([label, value], index) => (
          <div key={label} className={cn("grid gap-2 p-4 sm:grid-cols-[10rem_minmax(0,1fr)]", index !== rows.length - 1 && "border-b border-border") }>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
            <p className="text-sm leading-6 text-foreground">{value}</p>
          </div>
        ))}
      </div>
      {publishError ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-4 text-sm leading-6 text-destructive">
          {publishError}
        </div>
      ) : null}
    </div>
  );
}

function PublishSuccess({ result, session, onReset }: { result: PublishResult; session: Extract<AuthSession, { isLoggedIn: true }>; onReset: () => void }) {
  const detailHref = localBumicertHref(session.handle || session.did, result.rkey);
  const hyperscanHref = hyperscanRecordHref(result.uri);
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="rounded-[1.7rem] border border-primary/20 bg-primary/[0.08] p-6 text-center shadow-sm"
    >
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20">
        <PartyPopperIcon className="size-8" />
      </div>
      <h2 className="font-serif text-4xl font-medium tracking-[-0.03em] text-foreground">Cert published</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        Your Cert was published. It can take a moment to appear everywhere.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={detailHref}>Open Cert <ArrowRightIcon /></Link>
        </Button>
        {hyperscanHref ? (
          <Button variant="outline" asChild>
            <a href={hyperscanHref} target="_blank" rel="noreferrer">Open public entry</a>
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onReset}>Create another</Button>
      </div>

    </motion.div>
  );
}

export function CreateBumicertClient({ session }: { session: AuthSession }) {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [activeStep, setActiveStep] = useState<StepId>("basics");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [sites, setSites] = useState<ManagedLocation[]>([]);
  const [sitesStatus, setSitesStatus] = useState<SitesStatus>(session.isLoggedIn ? "idle" : "unauthorized");
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const autosaveTimer = useRef<number | null>(null);

  useEffect(() => {
    setDrafts(loadDrafts());
  }, []);

  const refreshSites = useCallback(() => {
    if (!session.isLoggedIn) return;
    const controller = new AbortController();
    setSitesStatus("loading");
    setSitesError(null);
    fetch("/api/manage/sites", { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load sites");
        setSites(Array.isArray(json) ? json : []);
        setSitesStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSitesStatus("error");
        setSitesError(error instanceof Error ? error.message : "Failed to load sites");
      });
    return () => controller.abort();
  }, [session]);

  useEffect(() => {
    if (session.isLoggedIn && sitesStatus === "idle") {
      refreshSites();
    }
  }, [refreshSites, session, sitesStatus]);

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  useEffect(() => {
    if (publishResult) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      const hasContent = Boolean(
        values.title.trim() ||
          values.shortDescription.trim() ||
          values.description.trim() ||
          values.scopes.length ||
          values.customScope.trim() ||
          contributorList(values).length ||
          values.selectedLocationUris.length,
      );
      if (!hasContent) return;
      const id = activeDraftId ?? crypto.randomUUID();
      const draft: Draft = { id, updatedAt: new Date().toISOString(), values };
      setActiveDraftId(id);
      setDrafts((current) => {
        const next = [draft, ...current.filter((item) => item.id !== id)];
        saveDrafts(next);
        return next;
      });
    }, 900);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [activeDraftId, publishResult, values]);

  const stepIndex = STEPS.findIndex((step) => step.id === activeStep);
  const currentStepError = validateStep(activeStep, values);

  const completedSteps = useMemo(() => {
    const out = new Set<StepId>();
    for (const step of STEPS) {
      if (!validateStep(step.id, values)) out.add(step.id);
    }
    return out;
  }, [values]);

  const handleCoverChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setCoverError(null);
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setCoverError("Use PNG, JPEG, or WebP for the cover image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setCoverError("Cover image must be 5MB or smaller.");
      return;
    }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const clearCover = () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview(null);
    setCoverError(null);
  };

  const goNext = () => {
    const error = validateStep(activeStep, values);
    if (error) {
      setPublishError(error);
      return;
    }
    setPublishError(null);
    const next = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)];
    setActiveStep(next.id);
  };

  const goBack = () => {
    setPublishError(null);
    const prev = STEPS[Math.max(stepIndex - 1, 0)];
    setActiveStep(prev.id);
  };

  const handleLoadDraft = (draft: Draft) => {
    setValues({ ...EMPTY_FORM, ...draft.values });
    setActiveDraftId(draft.id);
    setPublishResult(null);
    setPublishError(null);
    window.location.hash = "create-studio";
  };

  const handleDeleteDraft = (id: string) => {
    setDrafts((current) => {
      const next = current.filter((draft) => draft.id !== id);
      saveDrafts(next);
      return next;
    });
    if (activeDraftId === id) setActiveDraftId(null);
  };

  const resetForm = () => {
    setValues(EMPTY_FORM);
    setActiveStep("basics");
    setActiveDraftId(null);
    setPublishResult(null);
    setPublishError(null);
    clearCover();
  };

  const handlePublish = async (event: FormEvent) => {
    event.preventDefault();
    if (!session.isLoggedIn) {
      setPublishError("Sign in before publishing a Cert.");
      return;
    }
    const validation = validateAll(values);
    if (validation) {
      setPublishError(validation);
      const firstBadStep = STEPS.find((step) => validateStep(step.id, values));
      if (firstBadStep) setActiveStep(firstBadStep.id);
      return;
    }
    setIsPublishing(true);
    setPublishError(null);
    try {
      let image: Record<string, unknown> | undefined;
      if (coverFile) {
        const blob = await uploadBlob(coverFile);
        image = {
          $type: "org.hypercerts.defs#smallImage",
          image: blob.ref,
        };
      }
      const selectedSiteRefs = selectedLocations(values, sites).map((site) => ({
        uri: site.metadata.uri,
        cid: site.metadata.cid,
      }));
      const record: Record<string, unknown> = {
        $type: COLLECTION,
        title: values.title.trim(),
        shortDescription: clampDescription(values.shortDescription),
        description: {
          $type: "org.hypercerts.defs#descriptionString",
          value: values.description.trim(),
        },
        workScope: {
          $type: "org.hypercerts.claim.activity#workScopeString",
          scope: scopeSummary(values),
        },
        startDate: dateToIso(values.startDate),
        ...(values.ongoing ? {} : { endDate: dateToIso(values.endDate) }),
        contributors: contributorList(values).map((identity) => ({
          contributorIdentity: {
            $type: "org.hypercerts.claim.activity#contributorIdentity",
            identity,
          },
        })),
        ...(selectedSiteRefs.length ? { locations: selectedSiteRefs } : {}),
        ...(image ? { image } : {}),
        createdAt: new Date().toISOString(),
      };
      const result = await createRecord(COLLECTION, record);
      const published = { uri: result.uri, cid: result.cid, rkey: extractRkey(result.uri) };
      setPublishResult(published);
      if (activeDraftId) handleDeleteDraft(activeDraftId);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Could not publish the Cert.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <main className="min-h-screen px-4 pb-12 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-8">
        <CreateHero session={session} />
        <DraftRail drafts={drafts} onLoad={handleLoadDraft} onDelete={handleDeleteDraft} />

        <section id="create-studio" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
          <form onSubmit={handlePublish} className="min-w-0 rounded-[1.7rem] border border-border bg-card/90 p-4 shadow-sm sm:p-6">
            <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Create studio</p>
                <h2 className="mt-2 font-serif text-4xl font-medium tracking-[-0.03em] text-foreground">Guided Cert builder</h2>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                <SproutIcon /> Fresh start
              </Button>
            </div>

            <div className="mb-7 -mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex min-w-max gap-2">
                {STEPS.map((step) => (
                  <StepPill
                    key={step.id}
                    step={step}
                    active={activeStep === step.id}
                    complete={completedSteps.has(step.id)}
                    onClick={() => {
                      setPublishError(null);
                      setActiveStep(step.id);
                    }}
                  />
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {activeStep === "basics" ? (
                  <BasicsStep
                    values={values}
                    setValues={setValues}
                    coverFile={coverFile}
                    coverPreview={coverPreview}
                    onCoverChange={handleCoverChange}
                    onCoverClear={clearCover}
                  />
                ) : null}
                {activeStep === "story" ? <StoryStep values={values} setValues={setValues} /> : null}
                {activeStep === "network" ? (
                  <NetworkStep
                    values={values}
                    setValues={setValues}
                    sites={sites}
                    sitesStatus={sitesStatus}
                    sitesError={sitesError}
                    refreshSites={refreshSites}
                  />
                ) : null}
                {activeStep === "review" ? <ReviewStep values={values} sites={sites} publishError={publishError} /> : null}
              </motion.div>
            </AnimatePresence>

            {coverError ? (
              <div className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {coverError}
              </div>
            ) : null}
            {publishError && activeStep !== "review" ? (
              <div className="mt-5 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-foreground">
                {publishError}
              </div>
            ) : null}

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" disabled={stepIndex === 0 || isPublishing} onClick={goBack}>
                <ArrowLeftIcon /> Back
              </Button>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="text-xs text-muted-foreground">
                  {activeDraftId ? "Autosaving draft" : "Autosave starts after you type"}
                </p>
                {activeStep === "review" ? (
                  <Button type="submit" disabled={Boolean(validateAll(values)) || isPublishing || !session.isLoggedIn} className="min-w-44 shadow-lg shadow-primary/15">
                    {isPublishing ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />}
                    {isPublishing ? "Publishing…" : "Publish Cert"}
                  </Button>
                ) : (
                  <Button type="button" onClick={goNext} disabled={Boolean(currentStepError) || isPublishing}>
                    Continue <ChevronRightIcon />
                  </Button>
                )}
              </div>
            </div>
          </form>

          <LivePreview values={values} coverPreview={coverPreview} sites={sites} />
        </section>

        {publishResult && session.isLoggedIn ? (
          <PublishSuccess result={publishResult} session={session} onReset={resetForm} />
        ) : null}
      </div>
    </main>
  );
}
