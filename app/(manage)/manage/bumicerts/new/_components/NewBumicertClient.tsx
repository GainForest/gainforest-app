"use client";

/**
 * New Bumicert creation flow.
 *
 * Editorial, border-free layout: open page, soft sage wash, Instrument Serif
 * italic display type, soft filled surfaces. The step bar lives in the sticky
 * sub-header; "Start over" lives in the header. The cover photo is set directly
 * on the live Bumicert card preview. Contributors support actor autocomplete.
 */

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlignLeftIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarRangeIcon,
  CameraIcon,
  CheckIcon,
  LeafIcon,
  LightbulbIcon,
  Loader2Icon,
  MapPinIcon,
  PlusIcon,
  RotateCcwIcon,
  TagIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UsersIcon,
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
  type ReactNode,
} from "react";
import { localBumicertHref, hyperscanRecordHref } from "@/app/_lib/urls";
import { createRecord, uploadBlob } from "@/app/(manage)/manage/_lib/mutations";
import { BumicertCardVisual } from "@/components/bumicert/BumicertCard";
import { HeaderContent } from "@/app/_components/HeaderSlots";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

/* ── Types ──────────────────────────────────────────────────────────────── */

type ManagedLocation = {
  metadata: { did: string; uri: string; rkey: string; cid: string; createdAt: string | null };
  record: { name: string | null; description: string | null; locationType: string | null; location: unknown };
};

type ActorResult = { did: string; handle: string | null; displayName: string | null; avatar: string | null };

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
  confirmedRights: boolean;
};

type Draft = { id: string; updatedAt: string; values: FormValues };
type PublishResult = { uri: string; cid: string; rkey: string };
type StepId = "basics" | "story" | "people" | "review";
type SitesStatus = "idle" | "loading" | "ready" | "error";

/* ── Constants ──────────────────────────────────────────────────────────── */

const DRAFT_STORAGE_KEY = "bumicerts:create-drafts:v1";
const COLLECTION = "org.hypercerts.claim.activity";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TITLE_MAX = 120;

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
  confirmedRights: false,
};

const WORK_SCOPES = [
  "Reforestation",
  "Forest protection",
  "Biodiversity monitoring",
  "Community stewardship",
  "Carbon removal",
  "Restoration maintenance",
] as const;

const STEPS: Array<{ id: StepId; label: string; title: string; subtitle: string }> = [
  { id: "basics", label: "Basics", title: "the basics", subtitle: "Name the work and set the dates. Add a cover photo on the card." },
  { id: "story", label: "Story", title: "tell the story", subtitle: "A short summary for cards, then the full description." },
  { id: "people", label: "People & places", title: "people & places", subtitle: "Credit who did the work and link the sites involved." },
  { id: "review", label: "Review", title: "review & publish", subtitle: "Check it all reads well, then make it public." },
];

const TIPS: Record<StepId, string[]> = {
  basics: [
    "A clear, recognisable title travels further than a clever one.",
    "A single honest photo builds more trust than none.",
    "Mark the work “ongoing” if there’s no clean end date yet.",
  ],
  story: [
    "Lead the summary with the outcome, not the method.",
    "In the description, name your evidence: counts, plots, dates.",
    "Write for a funder skimming a long list of projects.",
  ],
  people: [
    "Start typing a name or @handle to find people on the network.",
    "Credit communities and teams, not only individuals.",
    "Linked sites make a Bumicert much easier to verify.",
  ],
  review: [
    "Publishing adds this to your public profile.",
    "Records can take a moment to appear everywhere.",
    "You can always create another from your drafts.",
  ],
};

/* Soft, border-free field styling */
const FIELD =
  "w-full rounded-xl border-0 bg-muted/60 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground/65 focus:bg-muted focus:ring-2 focus:ring-primary/25";

/* ── Pure helpers ───────────────────────────────────────────────────────── */

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
  return draft.values.title.trim() || "Untitled Bumicert";
}
function formatDraftDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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
function prettyDate(date: string) {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
  } catch {
    return date;
  }
}
function extractRkey(uri: string) {
  return uri.split("/").filter(Boolean).pop() ?? "";
}
function scopeList(values: FormValues) {
  return [...values.scopes, values.customScope.trim()].filter(Boolean);
}
function scopeSummary(values: FormValues) {
  const list = scopeList(values);
  return list.length ? list.join(", ") : "";
}
function contributorList(values: FormValues) {
  return values.contributors.map((item) => item.trim()).filter(Boolean);
}
function selectedLocations(values: FormValues, sites: ManagedLocation[]) {
  const selected = new Set(values.selectedLocationUris);
  return sites.filter((site) => selected.has(site.metadata.uri));
}
function validateStep(step: StepId, values: FormValues): string | null {
  if (step === "basics") {
    if (values.title.trim().length < 4) return "Give your Bumicert a clear title.";
    if (!values.startDate) return "Add when the work started.";
    if (!values.ongoing && !values.endDate) return "Add an end date, or mark the work as ongoing.";
    if (!values.ongoing && values.endDate < values.startDate) return "The end date can’t be before the start date.";
    if (scopeList(values).length === 0) return "Pick at least one type of work.";
  }
  if (step === "story") {
    if (clampDescription(values.shortDescription).length < 30) return "The summary needs at least 30 characters.";
    if (values.description.trim().length < 80) return "The description should cover what happened, the evidence, and the outcome.";
  }
  if (step === "people") {
    if (contributorList(values).length === 0) return "Add at least one contributor.";
  }
  if (step === "review") {
    if (!values.confirmedRights) return "Confirm you have permission to publish this work.";
  }
  return null;
}
function validateAll(values: FormValues): string | null {
  for (const step of STEPS) {
    const error = validateStep(step.id, values);
    if (error) return error;
  }
  return null;
}

/* ── Field wrapper ──────────────────────────────────────────────────────── */

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {hint ? <span className="ml-2 font-normal text-muted-foreground">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

/* ── Step rail (rendered in the sticky sub-header) ──────────────────────── */

function StepRail({
  activeStep,
  completed,
  onSelect,
}: {
  activeStep: StepId;
  completed: Set<StepId>;
  onSelect: (id: StepId) => void;
}) {
  const activeIndex = STEPS.findIndex((s) => s.id === activeStep);
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((step, idx) => {
        const isActive = step.id === activeStep;
        const isDone = completed.has(step.id) && !isActive;
        const isReached = idx <= activeIndex || isDone;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(step.id)}
            className="group flex flex-1 flex-col gap-1.5 text-left outline-none"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium transition-all duration-300",
                  isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/70",
                )}
              >
                {isDone ? <CheckIcon className="size-3" /> : idx + 1}
              </span>
              <span className={cn("hidden text-xs transition-colors sm:block", isActive ? "font-medium text-foreground" : "text-muted-foreground/80")}>
                {step.label}
              </span>
            </span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <motion.span
                className="block h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: isReached ? "100%" : "0%" }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Scope toggle ───────────────────────────────────────────────────────── */

function ScopeTag({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {active ? <CheckIcon className="size-3.5" /> : <PlusIcon className="size-3.5 opacity-60" />}
      {label}
    </button>
  );
}

/* ── Contributor input with actor autocomplete ──────────────────────────── */

function ContributorInput({
  value,
  onChange,
  onRemove,
  canRemove,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  placeholder: string;
}) {
  const [results, setResults] = useState<ActorResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim();
    if (!focused || query.length < 2 || query.startsWith("did:")) {
      setResults([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/actors/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d: { results?: ActorResult[] }) => {
          setResults(d.results ?? []);
          setHighlight(0);
          setOpen((d.results?.length ?? 0) > 0);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, focused]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const choose = (actor: ActorResult) => {
    onChange(actor.handle ?? actor.did);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={boxRef} className="relative flex items-center gap-2">
      <div className="relative flex-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (!open || results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(results[highlight]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className={cn(FIELD, "px-4 py-2.5 text-sm")}
        />
        {loading ? <Loader2Icon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground/60" /> : null}

        <AnimatePresence>
          {open && results.length > 0 ? (
            <motion.ul
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.14 }}
              className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl bg-card p-1.5 shadow-xl"
            >
              {results.map((actor, i) => (
                <li key={actor.did}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(actor)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors", i === highlight ? "bg-muted" : "hover:bg-muted/60")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {actor.avatar ? (
                      <img src={actor.avatar} alt="" className="size-7 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                        {(actor.displayName ?? actor.handle ?? "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{actor.displayName ?? actor.handle ?? actor.did}</span>
                      {actor.handle ? <span className="block truncate text-xs text-muted-foreground">@{actor.handle}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>

      <Button type="button" variant="ghost" size="icon-sm" disabled={!canRemove} onClick={onRemove} aria-label="Remove contributor" className="shrink-0 text-muted-foreground hover:text-destructive">
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}

/* ── Steps ──────────────────────────────────────────────────────────────── */

function BasicsStep({ values, setValues }: { values: FormValues; setValues: React.Dispatch<React.SetStateAction<FormValues>> }) {
  const toggleScope = (scope: string) =>
    setValues((c) => ({ ...c, scopes: c.scopes.includes(scope) ? c.scopes.filter((s) => s !== scope) : [...c.scopes, scope] }));

  return (
    <div className="space-y-8">
      <Field label="Title" hint="what people will recognise" htmlFor="bumicert-title">
        <input
          id="bumicert-title"
          value={values.title}
          maxLength={TITLE_MAX}
          onChange={(e) => setValues((c) => ({ ...c, title: e.target.value }))}
          placeholder="Mangrove restoration in the Rufiji Delta"
          className={cn(FIELD, "px-4 py-3 font-instrument text-2xl italic tracking-[-0.01em]")}
        />
        <div className="mt-1.5 text-right text-xs text-muted-foreground">{values.title.length} / {TITLE_MAX}</div>
      </Field>

      <Field label="Type of work" hint="pick everything this covers">
        <div className="flex flex-wrap gap-2">
          {WORK_SCOPES.map((scope) => (
            <ScopeTag key={scope} label={scope} active={values.scopes.includes(scope)} onClick={() => toggleScope(scope)} />
          ))}
        </div>
        <input
          value={values.customScope}
          onChange={(e) => setValues((c) => ({ ...c, customScope: e.target.value }))}
          placeholder="Add another, e.g. Indigenous governance"
          className={cn(FIELD, "mt-3 px-4 py-2.5 text-sm")}
        />
      </Field>

      <Field label="Time period">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="block text-xs text-muted-foreground">Start date</span>
            <DatePicker
              value={values.startDate}
              onChange={(startDate) => setValues((c) => ({ ...c, startDate }))}
              placeholder="When it began"
            />
          </div>
          <div className={cn("space-y-1.5 transition-opacity", values.ongoing && "opacity-50")}>
            <span className="block text-xs text-muted-foreground">End date</span>
            <DatePicker
              value={values.endDate}
              onChange={(endDate) => setValues((c) => ({ ...c, endDate }))}
              disabled={values.ongoing}
              min={values.startDate}
              placeholder={values.ongoing ? "Ongoing" : "When it wrapped"}
            />
          </div>
        </div>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
          <Checkbox
            checked={values.ongoing}
            onCheckedChange={(checked) =>
              setValues((c) => ({ ...c, ongoing: checked === true, endDate: checked === true ? "" : c.endDate }))
            }
          />
          This work is ongoing
        </label>
      </Field>
    </div>
  );
}

function StoryStep({ values, setValues }: { values: FormValues; setValues: React.Dispatch<React.SetStateAction<FormValues>> }) {
  const shortCount = clampDescription(values.shortDescription).length;
  return (
    <div className="space-y-8">
      <Field label="Summary" hint="shown on cards — lead with the outcome" htmlFor="summary">
        <textarea
          id="summary"
          value={values.shortDescription}
          onChange={(e) => setValues((c) => ({ ...c, shortDescription: e.target.value.slice(0, 300) }))}
          placeholder="Local stewards restored degraded mangrove plots, tracked survival rates, and documented biodiversity return across community-managed land."
          className={cn(FIELD, "min-h-24 resize-none px-4 py-3 text-[15px] leading-7")}
        />
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>{shortCount < 30 ? "At least 30 characters" : "Looks good"}</span>
          <span>{shortCount} / 300</span>
        </div>
      </Field>

      <Field label="Full description" hint="what happened, the evidence, the outcome" htmlFor="description">
        <textarea
          id="description"
          value={values.description}
          onChange={(e) => setValues((c) => ({ ...c, description: e.target.value }))}
          placeholder={"What happened on the ground?\n\nHow was impact measured?\n\nWhat evidence should a funder look at?\n\nWho benefits, and what comes next?"}
          className={cn(FIELD, "min-h-64 resize-y px-4 py-3.5 text-[15px] leading-7")}
        />
      </Field>
    </div>
  );
}

function PeopleStep({
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
  const updateContributor = (index: number, value: string) =>
    setValues((c) => ({ ...c, contributors: c.contributors.map((v, i) => (i === index ? value : v)) }));
  const removeContributor = (index: number) =>
    setValues((c) => ({ ...c, contributors: c.contributors.filter((_, i) => i !== index) }));
  const toggleLocation = (uri: string) =>
    setValues((c) => ({
      ...c,
      selectedLocationUris: c.selectedLocationUris.includes(uri) ? c.selectedLocationUris.filter((u) => u !== uri) : [...c.selectedLocationUris, uri],
    }));

  return (
    <div className="space-y-8">
      <Field label="Contributors" hint="search a name or @handle, or type any identity">
        <div className="space-y-2.5">
          {values.contributors.map((contributor, index) => (
            <ContributorInput
              key={index}
              value={contributor}
              onChange={(v) => updateContributor(index, v)}
              onRemove={() => removeContributor(index)}
              canRemove={values.contributors.length > 1}
              placeholder={index === 0 ? "Search e.g. “Rufiji Stewards” or @handle" : "Name, @handle, or DID"}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setValues((c) => ({ ...c, contributors: [...c.contributors, ""] }))}
          className="mt-2 -ml-2 text-primary hover:text-primary"
        >
          <PlusIcon className="size-4" /> Add contributor
        </Button>
      </Field>

      <Field label="Sites" hint="optional — but it makes the work easier to verify">
        {sitesStatus === "loading" ? (
          <div className="flex items-center gap-2.5 py-2 text-[13px] text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Loading your sites…
          </div>
        ) : sitesStatus === "error" ? (
          <div className="space-y-2 py-2 text-[13px] text-muted-foreground">
            <p>{sitesError ?? "Could not load sites."}</p>
            <Button type="button" variant="secondary" size="sm" onClick={refreshSites}>Retry</Button>
          </div>
        ) : sites.length === 0 ? (
          <p className="rounded-2xl bg-muted/50 px-4 py-3.5 text-[13px] leading-6 text-muted-foreground">
            You don’t have any sites yet. You can publish without one, or add site boundaries under{" "}
            <Link href="/manage/sites" className="text-primary underline-offset-2 hover:underline">Manage → Sites</Link> and come back.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {sites.map((site) => {
              const active = values.selectedLocationUris.includes(site.metadata.uri);
              return (
                <button
                  key={site.metadata.uri}
                  type="button"
                  onClick={() => toggleLocation(site.metadata.uri)}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors",
                    active ? "bg-primary/10" : "bg-muted/50 hover:bg-muted",
                  )}
                >
                  <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full transition-colors", active ? "bg-primary text-primary-foreground" : "bg-background/70 text-muted-foreground")}>
                    {active ? <CheckIcon className="size-3.5" /> : <MapPinIcon className="size-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-sm font-medium", active ? "text-primary" : "text-foreground")}>{site.record.name || "Unnamed site"}</span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{site.record.description || site.record.locationType || site.metadata.rkey}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Field>
    </div>
  );
}

function Facet({ icon: Icon, label, full, children }: { icon: typeof TagIcon; label: string; full?: boolean; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl bg-muted/45 p-4", full && "sm:col-span-2")}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-2.5 text-[15px] leading-6 text-foreground">{children}</div>
    </div>
  );
}

function ReviewStep({
  values,
  setValues,
  sites,
  coverPreview,
  publishError,
}: {
  values: FormValues;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  sites: ManagedLocation[];
  coverPreview: string | null;
  publishError: string | null;
}) {
  const validation = validateAll(values);
  const scopes = scopeList(values);
  const contributors = contributorList(values);
  const linkedSites = selectedLocations(values, sites);
  const summary = clampDescription(values.shortDescription);
  const period = values.startDate
    ? `${prettyDate(values.startDate)} → ${values.ongoing ? "Ongoing" : prettyDate(values.endDate) || "—"}`
    : "Not set";
  const title = values.title.trim();

  return (
    <div className="space-y-6">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium", validation ? "bg-warn/15 text-foreground" : "bg-primary/15 text-primary")}>
        {validation ? <TriangleAlertIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
        {validation ? "Almost there" : "Ready to publish"}
      </span>

      {coverPreview ? (
        <div className="relative overflow-hidden rounded-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverPreview} alt="" className="h-52 w-full object-cover sm:h-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
          <h3 className="absolute inset-x-0 bottom-0 p-5 font-instrument text-3xl italic leading-tight text-white sm:text-4xl">{title || "Untitled Bumicert"}</h3>
        </div>
      ) : (
        <div className="rounded-3xl bg-gradient-to-br from-primary/12 to-primary/[0.04] px-6 py-8">
          <h3 className="font-instrument text-3xl italic leading-tight text-foreground sm:text-4xl">{title || "Untitled Bumicert"}</h3>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Facet icon={TagIcon} label="Type of work">
          {scopes.length ? (
            <div className="flex flex-wrap gap-1.5">
              {scopes.map((s) => <span key={s} className="rounded-full bg-background/70 px-2.5 py-1 text-[13px]">{s}</span>)}
            </div>
          ) : <span className="text-muted-foreground">—</span>}
        </Facet>

        <Facet icon={CalendarRangeIcon} label="Time period">{period}</Facet>

        <Facet icon={UsersIcon} label={`Contributors · ${contributors.length}`}>
          {contributors.length ? (
            <div className="flex flex-wrap gap-1.5">
              {contributors.map((c) => <span key={c} className="rounded-full bg-background/70 px-2.5 py-1 text-[13px]">{c}</span>)}
            </div>
          ) : <span className="text-muted-foreground">—</span>}
        </Facet>

        <Facet icon={MapPinIcon} label={`Sites · ${linkedSites.length}`}>
          {linkedSites.length ? (
            <div className="flex flex-wrap gap-1.5">
              {linkedSites.map((s) => <span key={s.metadata.uri} className="rounded-full bg-background/70 px-2.5 py-1 text-[13px]">{s.record.name || s.metadata.rkey}</span>)}
            </div>
          ) : <span className="text-muted-foreground">None linked</span>}
        </Facet>

        <Facet icon={AlignLeftIcon} label="Summary" full>
          {summary ? <span className="text-muted-foreground">{summary}</span> : <span className="text-muted-foreground">—</span>}
        </Facet>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-muted/45 px-4 py-3.5">
        <Checkbox
          checked={values.confirmedRights}
          onCheckedChange={(checked) => setValues((c) => ({ ...c, confirmedRights: checked === true }))}
          className="mt-0.5"
        />
        <span className="text-[13px] leading-6 text-foreground">
          I confirm I have permission to create this Bumicert for the work and sites above, and that the details are accurate.
        </span>
      </label>

      <p className="text-[13px] leading-6 text-muted-foreground">
        {validation ?? "Publishing adds this Bumicert to your public profile — it becomes visible to everyone."}
      </p>

      {publishError ? <div className="rounded-2xl bg-destructive/10 px-5 py-3.5 text-[13px] leading-6 text-destructive">{publishError}</div> : null}
    </div>
  );
}

/* ── Preview (card only) + cover uploader ───────────────────────────────── */

function PreviewContent({
  values,
  coverPreview,
  sites,
  onCoverChange,
  onCoverFile,
  onCoverClear,
  coverError,
}: {
  values: FormValues;
  coverPreview: string | null;
  sites: ManagedLocation[];
  onCoverChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onCoverFile: (file: File | null) => void;
  onCoverClear: () => void;
  coverError: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  void sites;
  return (
    <div className="space-y-2.5">
      <div
        className="group/cover relative"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onCoverFile(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <BumicertCardVisual
          coverImage={coverPreview}
          logoUrl={null}
          title={values.title.trim() || "Your Bumicert title"}
          organizationName="Your profile"
          objectives={scopeList(values)}
          description={clampDescription(values.shortDescription) || undefined}
        />

        {/* Cover photo uploader — overlays the card's image area */}
        <label className="absolute inset-x-0 top-0 z-10 flex aspect-4/3 cursor-pointer items-center justify-center rounded-t-2xl transition-colors group-hover/cover:bg-foreground/25">
          <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="sr-only" onChange={onCoverChange} />
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-md transition-opacity",
              coverPreview ? "opacity-0 group-hover/cover:opacity-100" : dragging ? "opacity-100 ring-2 ring-primary" : "opacity-100",
            )}
          >
            <CameraIcon className="size-3.5" />
            {coverPreview ? "Change cover" : "Add cover photo"}
          </span>
        </label>

        {coverPreview ? (
          <button
            type="button"
            onClick={onCoverClear}
            aria-label="Remove cover photo"
            className="absolute right-2 top-2 z-20 rounded-full bg-background/90 p-1.5 text-muted-foreground shadow-md transition-colors hover:text-destructive"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      {coverError ? <p className="text-xs text-destructive">{coverError}</p> : null}
    </div>
  );
}

function TipsContent({ activeStep }: { activeStep: StepId }) {
  return (
    <ul className="space-y-2.5">
      {TIPS[activeStep].map((tip) => (
        <li key={tip} className="flex gap-2.5 text-[13px] leading-5 text-muted-foreground">
          <LeafIcon className="mt-0.5 size-3.5 shrink-0 text-primary/55" />
          {tip}
        </li>
      ))}
    </ul>
  );
}

/* ── Published ──────────────────────────────────────────────────────────── */

function PublishedView({ result, did, onReset }: { result: PublishResult; did: string; onReset: () => void }) {
  const detailHref = localBumicertHref(did, result.rkey);
  const hyperscanHref = hyperscanRecordHref(result.uri);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }} className="mx-auto max-w-xl py-16 text-center">
      <motion.div
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 16 }}
        className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/12 text-primary"
      >
        <CheckIcon className="size-8" />
      </motion.div>
      <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-primary/70">Published</p>
      <h2 className="mt-2 font-instrument text-5xl italic tracking-[-0.01em] text-foreground">It’s live.</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Your Bumicert is on your public profile now. It may take a moment to appear everywhere.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={detailHref}>Open Bumicert <ArrowRightIcon className="size-4" /></Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/manage/bumicerts">Back to Bumicerts</Link>
        </Button>
        {hyperscanHref ? (
          <Button asChild variant="ghost">
            <a href={hyperscanHref} target="_blank" rel="noreferrer">View record</a>
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onReset}>Create another</Button>
      </div>
      <p className="mx-auto mt-7 max-w-md break-all rounded-xl bg-muted/60 px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{result.uri}</p>
    </motion.div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────── */

export function NewBumicertClient({ did }: { did: string }) {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [activeStep, setActiveStep] = useState<StepId>("basics");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [sites, setSites] = useState<ManagedLocation[]>([]);
  const [sitesStatus, setSitesStatus] = useState<SitesStatus>("idle");
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [mobileSheet, setMobileSheet] = useState<"preview" | "tips" | null>(null);
  const autosaveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!mobileSheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileSheet]);

  useEffect(() => {
    setDrafts(loadDrafts());
  }, []);

  const refreshSites = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (sitesStatus === "idle") refreshSites();
  }, [refreshSites, sitesStatus]);

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

  const stepIndex = STEPS.findIndex((s) => s.id === activeStep);
  const currentStepError = validateStep(activeStep, values);

  const completedSteps = useMemo(() => {
    const out = new Set<StepId>();
    for (const step of STEPS) if (!validateStep(step.id, values)) out.add(step.id);
    return out;
  }, [values]);

  const applyCoverFile = useCallback(
    (file: File | null) => {
      setCoverError(null);
      if (!file) return;
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
        setCoverError("Use a PNG, JPEG, or WebP image.");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setCoverError("The image must be 5 MB or smaller.");
        return;
      }
      setCoverFile(file);
      setCoverPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    },
    [],
  );

  const handleCoverChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    applyCoverFile(file);
  };

  const clearCover = () => {
    setCoverPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCoverFile(null);
    setCoverError(null);
  };

  const goNext = () => {
    const error = validateStep(activeStep, values);
    if (error) {
      setPublishError(error);
      return;
    }
    setPublishError(null);
    setActiveStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].id);
  };

  const goBack = () => {
    setPublishError(null);
    setActiveStep(STEPS[Math.max(stepIndex - 1, 0)].id);
  };

  const handleLoadDraft = (draft: Draft) => {
    setValues({ ...EMPTY_FORM, ...draft.values });
    setActiveDraftId(draft.id);
    setActiveStep("basics");
    setPublishResult(null);
    setPublishError(null);
  };

  const handleDeleteDraft = (id: string) => {
    setDrafts((current) => {
      const next = current.filter((d) => d.id !== id);
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
    const validation = validateAll(values);
    if (validation) {
      setPublishError(validation);
      const firstBad = STEPS.find((s) => validateStep(s.id, values));
      if (firstBad) setActiveStep(firstBad.id);
      return;
    }
    setIsPublishing(true);
    setPublishError(null);
    try {
      let image: Record<string, unknown> | undefined;
      if (coverFile) {
        const blob = await uploadBlob(coverFile);
        image = { $type: "org.hypercerts.defs#smallImage", image: blob.ref };
      }
      const siteRefs = selectedLocations(values, sites).map((s) => ({ uri: s.metadata.uri, cid: s.metadata.cid }));
      const record: Record<string, unknown> = {
        $type: COLLECTION,
        title: values.title.trim(),
        shortDescription: clampDescription(values.shortDescription),
        description: { $type: "org.hypercerts.defs#descriptionString", value: values.description.trim() },
        workScope: { $type: "org.hypercerts.claim.activity#workScopeString", scope: scopeSummary(values) },
        startDate: dateToIso(values.startDate),
        ...(values.ongoing ? {} : { endDate: dateToIso(values.endDate) }),
        contributors: contributorList(values).map((identity) => ({
          contributorIdentity: { $type: "org.hypercerts.claim.activity#contributorIdentity", identity },
        })),
        ...(siteRefs.length ? { locations: siteRefs } : {}),
        ...(image ? { image } : {}),
        createdAt: new Date().toISOString(),
      };
      const result = await createRecord(COLLECTION, record);
      setPublishResult({ uri: result.uri, cid: result.cid, rkey: extractRkey(result.uri) });
      if (activeDraftId) handleDeleteDraft(activeDraftId);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Could not publish the Bumicert.");
    } finally {
      setIsPublishing(false);
    }
  };

  const activeStepMeta = STEPS[stepIndex];
  const isReview = activeStep === "review";

  const previewProps = {
    values,
    coverPreview,
    sites,
    onCoverChange: handleCoverChange,
    onCoverFile: applyCoverFile,
    onCoverClear: clearCover,
    coverError,
  };

  return (
    <div className="relative">
      {/* soft sage wash */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[20rem] bg-gradient-to-b from-primary/[0.07] via-primary/[0.02] to-transparent" />

      {/* Step bar in the sticky sub-header + Start over in the header */}
      {!publishResult ? (
        <HeaderContent
          right={
            <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="text-muted-foreground">
              <RotateCcwIcon className="size-4" /> <span className="hidden sm:inline">Start over</span>
            </Button>
          }
          sub={
            <div className="mx-auto w-full max-w-5xl px-0 sm:px-2">
              <StepRail
                activeStep={activeStep}
                completed={completedSteps}
                onSelect={(id) => {
                  setPublishError(null);
                  setActiveStep(id);
                }}
              />
            </div>
          }
        />
      ) : null}

      <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 sm:py-9">
        {publishResult ? (
          <PublishedView result={publishResult} did={did} onReset={resetForm} />
        ) : (
          <>
            {drafts.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/80">Drafts</span>
                {drafts.slice(0, 5).map((draft) => (
                  <span key={draft.id} className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs transition-colors", draft.id === activeDraftId ? "bg-primary/12 text-primary" : "bg-muted/60 hover:bg-muted")}>
                    <button type="button" onClick={() => handleLoadDraft(draft)} className="font-medium">
                      {titleFromDraft(draft)}
                      <span className="ml-1.5 font-normal text-muted-foreground">· {formatDraftDate(draft.updatedAt)}</span>
                    </button>
                    <button type="button" onClick={() => handleDeleteDraft(draft.id)} aria-label="Delete draft" className="text-muted-foreground transition-colors hover:text-destructive">
                      <XIcon className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <form onSubmit={handlePublish} className={cn("grid gap-x-14 gap-y-12 xl:grid-cols-[minmax(0,1fr)_18rem]", drafts.length > 0 ? "mt-8" : "mt-2")}>
              <div className="min-w-0">
                <div className="mb-8">
                  <h2 className="font-instrument text-[2.5rem] italic leading-[1.05] tracking-[-0.01em] text-foreground">{activeStepMeta.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{activeStepMeta.subtitle}</p>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div key={activeStep} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}>
                    {activeStep === "basics" ? <BasicsStep values={values} setValues={setValues} /> : null}
                    {activeStep === "story" ? <StoryStep values={values} setValues={setValues} /> : null}
                    {activeStep === "people" ? <PeopleStep values={values} setValues={setValues} sites={sites} sitesStatus={sitesStatus} sitesError={sitesError} refreshSites={refreshSites} /> : null}
                    {isReview ? <ReviewStep values={values} setValues={setValues} sites={sites} coverPreview={coverPreview} publishError={publishError} /> : null}
                  </motion.div>
                </AnimatePresence>

                {/* Mobile: live preview shown by default at the end of step 1 */}
                {activeStep === "basics" ? (
                  <div className="mt-10 xl:hidden">
                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">Live preview</p>
                    <div className="mx-auto max-w-[18rem]">
                      <PreviewContent {...previewProps} />
                    </div>
                  </div>
                ) : null}

                {publishError && !isReview ? <p className="mt-6 rounded-xl bg-warn/10 px-4 py-2.5 text-[13px] text-foreground">{publishError}</p> : null}

                <div className="mt-10 flex items-center justify-between">
                  <Button type="button" variant="ghost" onClick={goBack} disabled={stepIndex === 0 || isPublishing} className="-ml-2 text-muted-foreground">
                    <ArrowLeftIcon className="size-4" /> Back
                  </Button>

                  <div className="flex items-center gap-4">
                    <span className="hidden text-xs text-muted-foreground sm:block">{activeDraftId ? "Saved" : "Not saved yet"}</span>
                    {isReview ? (
                      <Button type="submit" size="lg" disabled={Boolean(validateAll(values)) || isPublishing}>
                        {isPublishing ? <Loader2Icon className="size-4 animate-spin" /> : <LeafIcon className="size-4" />}
                        {isPublishing ? "Publishing…" : "Publish Bumicert"}
                      </Button>
                    ) : (
                      <Button type="button" size="lg" onClick={goNext} disabled={Boolean(currentStepError) || isPublishing}>
                        Continue <ArrowRightIcon className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop sidebar: separate Preview and Tips sections */}
              <aside className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
                <div className="space-y-8">
                  <div>
                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">Live preview</p>
                    <PreviewContent {...previewProps} />
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">Tips</p>
                    <TipsContent activeStep={activeStep} />
                  </div>
                </div>
              </aside>
            </form>
          </>
        )}
      </div>

      {/* Mobile floating buttons (left) + sheets */}
      {!publishResult ? (
        <>
          <div className="fixed bottom-5 left-5 z-40 flex flex-col gap-2 xl:hidden">
            <Button type="button" variant="outline" size="sm" onClick={() => setMobileSheet("tips")} className="shadow-lg">
              <LightbulbIcon className="size-4" /> Tips
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setMobileSheet("preview")} className="shadow-lg">
              <CameraIcon className="size-4" /> Preview
            </Button>
          </div>

          <AnimatePresence>
            {mobileSheet ? (
              <motion.div className="fixed inset-0 z-50 xl:hidden" initial={false}>
                <motion.div
                  className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMobileSheet(null)}
                />
                <motion.div
                  className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-background px-5 pb-10 pt-3 shadow-2xl"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", stiffness: 320, damping: 34 }}
                >
                  <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
                  <div className="mb-5 flex items-center justify-between">
                    <span className="font-instrument text-2xl italic text-foreground">{mobileSheet === "preview" ? "Preview" : "Tips"}</span>
                    <button type="button" onClick={() => setMobileSheet(null)} aria-label="Close" className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted">
                      <XIcon className="size-5" />
                    </button>
                  </div>
                  {mobileSheet === "preview" ? (
                    <div className="mx-auto max-w-[18rem]">
                      <PreviewContent {...previewProps} />
                    </div>
                  ) : (
                    <TipsContent activeStep={activeStep} />
                  )}
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
    </div>
  );
}
