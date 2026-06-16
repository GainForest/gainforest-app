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
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  EyeIcon,
  LeafIcon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { format } from "date-fns";
import { localBumicertHref, hyperscanRecordHref } from "@/app/_lib/urls";
import { canCreateRecord, canUpdateRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";
import { createRecord, putRecord, uploadBlob } from "@/app/(manage)/manage/_lib/mutations";
import { useModal } from "@/components/ui/modal/context";
import {
  SiteEditorModal,
  SiteEditorModalId,
} from "@/app/(manage)/manage/_modals/SiteEditorModal";
import { BumicertCardVisual } from "@/components/bumicert/BumicertCard";
import { TainaChatDock, TainaMobileTrigger } from "./Taina";
import { HeaderContent } from "@/app/_components/HeaderSlots";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarRange } from "@/components/ui/calendar-range";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { manageApiHref, manageHref, type ManageTarget } from "@/lib/links";

/* ── Types ──────────────────────────────────────────────────────────────── */

type ManagedLocation = {
  metadata: { did: string; uri: string; rkey: string; cid: string; createdAt: string | null };
  record: { name: string | null; description: string | null; locationType: string | null; location: unknown };
};

type ActorResult = { did: string; handle: string | null; displayName: string | null; avatar: string | null };
type ProfilePreview = { name: string; avatarUrl: string | null };

type FormValues = {
  title: string;
  shortDescription: string;
  description: string;
  scopes: string[];
  startDate: string;
  endDate: string;
  ongoing: boolean;
  contributors: string[];
  selectedLocationUris: string[];
  confirmedRights: boolean;
  acceptedTerms: boolean;
};

type Draft = { id: string; updatedAt: string; values: FormValues };
type PublishResult = { uri: string; cid: string; rkey: string };
export type LinkedProjectPrefill = {
  did: string;
  rkey: string;
  atUri: string;
  cid: string | null;
  title: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  locationUri: string | null;
  rawRecord: Record<string, unknown> | null;
  canLink: boolean;
};
type StepId = "basics" | "story" | "people" | "review";
type SitesStatus = "idle" | "loading" | "ready" | "error";
type FormField = "title" | "scopes" | "dates" | "shortDescription" | "description" | "contributors" | "confirmedRights" | "acceptedTerms";
type FormIssue = { field: FormField; step: StepId; message: string };

/* ── Constants ──────────────────────────────────────────────────────────── */

const DRAFT_STORAGE_KEY = "bumicerts:create-drafts:v1";
const COLLECTION = "org.hypercerts.claim.activity";
const PROJECT_COLLECTION = "org.hypercerts.collection";
const WORK_SCOPE_TAG_COLLECTION = "org.hypercerts.workscope.tag";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TITLE_MAX = 120;
const TERMS_URL = "https://www.certified.app/terms";

const EMPTY_FORM: FormValues = {
  title: "",
  shortDescription: "",
  description: "",
  scopes: [],
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: "",
  ongoing: true,
  contributors: [""],
  selectedLocationUris: [],
  confirmedRights: false,
  acceptedTerms: false,
};

const WORK_SCOPES = [
  { key: "reforestation", label: "Reforestation" },
  { key: "forest_protection", label: "Forest protection" },
  { key: "biodiversity_monitoring", label: "Biodiversity monitoring" },
  { key: "community_stewardship", label: "Community stewardship" },
  { key: "carbon_removal", label: "Carbon removal" },
  { key: "restoration_maintenance", label: "Restoration maintenance" },
] as const;

const STEPS: Array<{ id: StepId; label: string; title: string; subtitle: string }> = [
  { id: "basics", label: "Basics", title: "the basics", subtitle: "Name the work and set the dates. Add a cover photo on the card." },
  { id: "story", label: "Story", title: "tell the story", subtitle: "A short summary for cards, then the full description." },
  { id: "people", label: "People & places", title: "people & places", subtitle: "Credit who did the work and link the sites involved." },
  { id: "review", label: "Review", title: "review & publish", subtitle: "Verify it all reads well, then make it public." },
];

const FIELD =
  "w-full rounded-xl border border-border bg-background text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary/45 focus:bg-background focus:ring-2 focus:ring-primary/20";
const FIELD_ERROR = "!border-2 !border-destructive ring-2 ring-destructive/25 focus:!border-destructive focus:ring-2 focus:ring-destructive/30";
const ERROR_MESSAGE = "flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75";

/* ── Pure helpers ───────────────────────────────────────────────────────── */

function normalizeDraftValues(values: Partial<FormValues> & { customScope?: string }): FormValues {
  return {
    ...EMPTY_FORM,
    ...values,
    scopes: Array.isArray(values.scopes) ? values.scopes : [],
    contributors: Array.isArray(values.contributors) && values.contributors.length ? values.contributors : [""],
    selectedLocationUris: Array.isArray(values.selectedLocationUris) ? values.selectedLocationUris : [],
    acceptedTerms: values.acceptedTerms === true,
  };
}

function initialFormValues(project: LinkedProjectPrefill | null): FormValues {
  if (!project) return { ...EMPTY_FORM, scopes: [], contributors: [""], selectedLocationUris: [] };
  return {
    ...EMPTY_FORM,
    title: project.title,
    shortDescription: project.shortDescription ?? "",
    description: project.description ?? "",
    selectedLocationUris: project.locationUri ? [project.locationUri] : [],
    scopes: [],
    contributors: [""],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function projectItemUri(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const itemIdentifier = isRecord(value.itemIdentifier) ? value.itemIdentifier : value;
  return stringValue(itemIdentifier.uri);
}

function projectRecordWithBumicert(project: LinkedProjectPrefill, bumicert: { uri: string; cid: string }): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(project.rawRecord) ? { ...project.rawRecord } : {};
  const existingItems = Array.isArray(base.items) ? base.items.filter(isRecord) : [];
  const existingUris = new Set(existingItems.map(projectItemUri).filter((uri): uri is string => Boolean(uri)));
  const items = existingUris.has(bumicert.uri)
    ? existingItems
    : [...existingItems, { itemIdentifier: { uri: bumicert.uri, cid: bumicert.cid } }];

  return {
    ...base,
    $type: PROJECT_COLLECTION,
    title: stringValue(base.title) ?? project.title,
    type: "project",
    createdAt: stringValue(base.createdAt) ?? new Date().toISOString(),
    items,
  };
}

async function appendBumicertToProject(project: LinkedProjectPrefill, bumicert: { uri: string; cid: string }, target: ManageTarget) {
  await putRecord(
    PROJECT_COLLECTION,
    project.rkey,
    projectRecordWithBumicert(project, bumicert),
    { ...(project.cid ? { swapRecord: project.cid } : {}), ...(target.kind === "group" ? { repo: target.did } : {}) },
  );
}

function loadDrafts(): Draft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Draft[];
    return Array.isArray(parsed)
      ? parsed.slice(0, 12).map((draft) => ({ ...draft, values: normalizeDraftValues(draft.values as Partial<FormValues> & { customScope?: string }) }))
      : [];
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
function extractRkey(uri: string) {
  return uri.split("/").filter(Boolean).pop() ?? "";
}
function scopeList(values: FormValues) {
  const active = new Set(values.scopes);
  return WORK_SCOPES.filter((scope) => active.has(scope.key)).map((scope) => scope.label);
}
function scopeKeys(values: FormValues) {
  const active = new Set(values.scopes);
  return WORK_SCOPES.filter((scope) => active.has(scope.key));
}
function buildWorkScopeExpression(values: FormValues) {
  const keys = scopeKeys(values).map((scope) => `'${scope.key}'`).join(", ");
  return `scope.hasAny([${keys}])`;
}
function contributorList(values: FormValues) {
  return values.contributors.map((item) => item.trim()).filter(Boolean);
}
function selectedLocations(values: FormValues, sites: ManagedLocation[]) {
  const selected = new Set(values.selectedLocationUris);
  return sites.filter((site) => selected.has(site.metadata.uri));
}
function selectedLocationRefs(values: FormValues, sites: ManagedLocation[], linkedProject: LinkedProjectPrefill | null) {
  const refs: Array<{ uri: string; cid?: string }> = selectedLocations(values, sites).map((site) => ({ uri: site.metadata.uri, cid: site.metadata.cid }));
  if (
    linkedProject?.locationUri &&
    values.selectedLocationUris.includes(linkedProject.locationUri) &&
    !refs.some((ref) => ref.uri === linkedProject.locationUri)
  ) {
    refs.push({ uri: linkedProject.locationUri });
  }
  return refs;
}
function siteSubtitle(site: ManagedLocation) {
  return site.record.description || (site.record.locationType ? "Map area" : "Project place");
}
function getFormIssues(values: FormValues): FormIssue[] {
  const issues: FormIssue[] = [];
  if (values.title.trim().length < 4) issues.push({ field: "title", step: "basics", message: "Add a title with at least 4 characters." });
  if (scopeKeys(values).length === 0) issues.push({ field: "scopes", step: "basics", message: "Pick at least one type of work." });
  if (!values.startDate) issues.push({ field: "dates", step: "basics", message: "Add when the work started." });
  else if (!values.ongoing && !values.endDate) issues.push({ field: "dates", step: "basics", message: "Add an end date, or mark the work as ongoing." });
  else if (!values.ongoing && values.endDate < values.startDate) issues.push({ field: "dates", step: "basics", message: "The end date can’t be before the start date." });
  if (clampDescription(values.shortDescription).length < 30) issues.push({ field: "shortDescription", step: "story", message: "Write at least 30 characters for the summary." });
  if (values.description.trim().length < 80) issues.push({ field: "description", step: "story", message: "Write at least 80 characters for the full description." });
  if (contributorList(values).length === 0) issues.push({ field: "contributors", step: "people", message: "Add at least one person or group." });
  if (!values.confirmedRights) issues.push({ field: "confirmedRights", step: "review", message: "Confirm you have permission to publish this work." });
  if (!values.acceptedTerms) issues.push({ field: "acceptedTerms", step: "review", message: "Agree to the terms before publishing." });
  return issues;
}
function issuesByField(issues: FormIssue[]): Partial<Record<FormField, FormIssue>> {
  return Object.fromEntries(issues.map((issue) => [issue.field, issue])) as Partial<Record<FormField, FormIssue>>;
}
function firstStepIssue(issues: FormIssue[], step: StepId): FormIssue | undefined {
  return issues.find((issue) => issue.step === step);
}
function stepIssueCount(issues: FormIssue[], step: StepId): number {
  return issues.filter((issue) => issue.step === step).length;
}
function validateStep(step: StepId, values: FormValues): string | null {
  return firstStepIssue(getFormIssues(values), step)?.message ?? null;
}
function validateAll(values: FormValues): string | null {
  return getFormIssues(values)[0]?.message ?? null;
}

/* ── Field wrapper ──────────────────────────────────────────────────────── */

function Field({ label, hint, htmlFor, error, children }: { label: string; hint?: string; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {hint ? <span className="ml-2 font-normal text-muted-foreground">{hint}</span> : null}
      </label>
      {children}
      {error ? <p className={ERROR_MESSAGE}><TriangleAlertIcon className="size-3.5 text-warn" /> {error}</p> : null}
    </div>
  );
}

/* ── Section header (editorial display type per section) ────────────────── */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-8">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/65">{eyebrow}</p>
      </div>
      <h2 className="font-instrument text-[2.5rem] italic leading-[1.05] tracking-[-0.01em] text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
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
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/35 hover:text-foreground",
      )}
    >
      {active ? <CheckIcon className="size-3.5" /> : <PlusIcon className="size-3.5 opacity-60" />}
      {label}
    </button>
  );
}

function dateFromValue(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function valueFromDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function DateRangePicker({
  startDate,
  endDate,
  ongoing,
  error,
  onChange,
}: {
  startDate: string;
  endDate: string;
  ongoing: boolean;
  error?: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
}) {
  const start = dateFromValue(startDate) ?? new Date();
  const end = dateFromValue(endDate) ?? new Date();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          id="project-date-range"
          type="button"
          className={cn("group flex w-full cursor-pointer items-center justify-center rounded-md border border-transparent bg-foreground/2 p-2 text-center transition-all duration-300", error && "border-2 border-destructive ring-2 ring-destructive/25")}
        >
          <span className="text-2xl font-medium text-foreground group-hover:text-primary">
            {format(start, "LLL dd, y")} → {ongoing || !endDate ? "Ongoing" : format(end, "LLL dd, y")}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <CalendarRange
          value={[start, end]}
          onValueChange={(value) => {
            if (!value) return;
            onChange({
              startDate: valueFromDate(value[0]),
              endDate: ongoing ? "" : valueFromDate(value[1]),
            });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ── Contributor input with actor autocomplete ──────────────────────────── */

function actorLabel(actor: ActorResult) {
  return actor.displayName ?? actor.handle ?? "Selected profile";
}

function ActorAvatar({ actor, size = "size-8" }: { actor: ActorResult; size?: string }) {
  return actor.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={actor.avatar} alt="" className={cn(size, "shrink-0 rounded-full object-cover")} />
  ) : (
    <span className={cn(size, "flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary")}>
      {actorLabel(actor).charAt(0).toUpperCase()}
    </span>
  );
}

function ContributorInput({
  value,
  actor,
  onChange,
  onActorChange,
  onRemove,
  canRemove,
  placeholder,
  error,
}: {
  value: string;
  actor: ActorResult | null;
  onChange: (value: string) => void;
  onActorChange: (actor: ActorResult | null) => void;
  onRemove: () => void;
  canRemove: boolean;
  placeholder: string;
  error?: string;
}) {
  const [results, setResults] = useState<ActorResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim();
    if (!focused || actor) return;
    setOpen(true);
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
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
          setOpen(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [actor, value, focused]);

  useEffect(() => {
    if (actor || !value.trim()) return;
    const query = value.trim();
    if (query.length < 3) return;
    const controller = new AbortController();
    fetch(`/api/actors/resolve?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { actor?: ActorResult | null }) => {
        if (d.actor) onActorChange(d.actor);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [actor, onActorChange, value]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const choose = (nextActor: ActorResult) => {
    onActorChange(nextActor);
    onChange(nextActor.did);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={boxRef} className="relative flex items-center gap-2">
      <div className="relative flex-1">
        {actor ? (
          <div className={cn("flex min-h-11 items-center gap-3 rounded-xl border bg-background px-3 py-2", error ? "border-2 border-destructive ring-2 ring-destructive/25" : "border-border")}>
            <ActorAvatar actor={actor} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{actorLabel(actor)}</span>
              {actor.handle ? <span className="block truncate text-xs text-muted-foreground">@{actor.handle}</span> : null}
            </span>
            <button
              type="button"
              onClick={() => {
                onActorChange(null);
                onChange("");
              }}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Change person or group"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        ) : (
          <input
            value={value}
            onChange={(e) => {
              onActorChange(null);
              onChange(e.target.value);
            }}
            onFocus={() => {
              setFocused(true);
              setOpen(true);
            }}
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
            className={cn(FIELD, "px-4 py-2.5 text-sm", error && FIELD_ERROR)}
          />
        )}
        {loading && !actor ? <Loader2Icon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground/60" /> : null}

        <AnimatePresence>
          {open && !actor ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.14 }}
              className="absolute z-[1000] mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              {value.trim().length < 2 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">Start typing to get suggestions.</p>
              ) : loading ? (
                <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" /> Loading suggestions…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">No matches yet. You can keep typing a name.</p>
              ) : (
                <ul>
                  {results.map((nextActor, i) => (
                    <li key={nextActor.did}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(nextActor)}
                        onMouseEnter={() => setHighlight(i)}
                        className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors", i === highlight ? "bg-muted" : "hover:bg-muted/60")}
                      >
                        <ActorAvatar actor={nextActor} size="size-7" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">{actorLabel(nextActor)}</span>
                          {nextActor.handle ? <span className="block truncate text-xs text-muted-foreground">@{nextActor.handle}</span> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <Button type="button" variant="ghost" size="icon-sm" disabled={!canRemove} onClick={onRemove} aria-label="Remove person or group" className="shrink-0 text-muted-foreground hover:text-destructive">
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}

/* ── Steps ──────────────────────────────────────────────────────────────── */

function BasicsStep({
  values,
  setValues,
  issues,
  onFieldChange,
}: {
  values: FormValues;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  issues: Partial<Record<FormField, FormIssue>>;
  onFieldChange: (field: FormField) => void;
}) {
  const toggleScope = (scopeKey: string) => {
    onFieldChange("scopes");
    setValues((c) => ({ ...c, scopes: c.scopes.includes(scopeKey) ? c.scopes.filter((s) => s !== scopeKey) : [...c.scopes, scopeKey] }));
  };

  return (
    <div className="space-y-8">
      <Field label="Title" hint="what people will recognise" htmlFor="bumicert-title" error={issues.title?.message}>
        <input
          id="bumicert-title"
          value={values.title}
          maxLength={TITLE_MAX}
          onChange={(e) => {
            onFieldChange("title");
            setValues((c) => ({ ...c, title: e.target.value }));
          }}
          placeholder="Mangrove restoration in the Rufiji Delta"
          className={cn(FIELD, "px-4 py-3 font-instrument text-2xl italic tracking-[-0.01em]", issues.title && FIELD_ERROR)}
        />
        <div className="mt-1.5 text-right text-xs text-muted-foreground">{values.title.length} / {TITLE_MAX}</div>
      </Field>

      <Field label="Type of work" hint="pick everything this covers" error={issues.scopes?.message}>
        <div className={cn("flex flex-wrap gap-2 rounded-2xl transition-colors", issues.scopes && "border-2 border-destructive p-3 ring-2 ring-destructive/20")}>
          {WORK_SCOPES.map((scope) => (
            <ScopeTag key={scope.key} label={scope.label} active={values.scopes.includes(scope.key)} onClick={() => toggleScope(scope.key)} />
          ))}
        </div>
      </Field>

      <Field label="Time period" error={issues.dates?.message}>
        <div className="mt-1 flex flex-col gap-2">
          <DateRangePicker
            startDate={values.startDate}
            endDate={values.endDate}
            ongoing={values.ongoing}
            error={issues.dates?.message}
            onChange={({ startDate, endDate }) => {
              onFieldChange("dates");
              setValues((c) => ({ ...c, startDate, endDate }));
            }}
          />
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              id="is-ongoing"
              checked={values.ongoing}
              onCheckedChange={(checked) => {
                onFieldChange("dates");
                setValues((c) => ({
                  ...c,
                  ongoing: checked === true,
                  endDate: checked === true ? "" : valueFromDate(new Date()),
                }));
              }}
            />
            <label htmlFor="is-ongoing" className="cursor-pointer select-none text-sm text-muted-foreground">
              This work is ongoing
            </label>
          </div>
        </div>
      </Field>
    </div>
  );
}


function StoryStep({
  values,
  setValues,
  issues,
  onFieldChange,
}: {
  values: FormValues;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  issues: Partial<Record<FormField, FormIssue>>;
  onFieldChange: (field: FormField) => void;
}) {
  const shortCount = clampDescription(values.shortDescription).length;
  return (
    <div className="space-y-8">
      <Field label="Summary" hint="shown on cards — lead with the outcome" htmlFor="summary" error={issues.shortDescription?.message}>
        <textarea
          id="summary"
          value={values.shortDescription}
          onChange={(e) => {
            onFieldChange("shortDescription");
            setValues((c) => ({ ...c, shortDescription: e.target.value.slice(0, 300) }));
          }}
          placeholder="Local stewards restored degraded mangrove plots, tracked survival rates, and documented biodiversity return across community-managed land."
          className={cn(FIELD, "min-h-24 resize-none px-4 py-3 text-[15px] leading-7", issues.shortDescription && FIELD_ERROR)}
        />
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>{shortCount < 30 ? "At least 30 characters" : "Looks good"}</span>
          <span>{shortCount} / 300</span>
        </div>
      </Field>

      <Field label="Full description" hint="what happened, the evidence, the outcome" htmlFor="description" error={issues.description?.message}>
        <textarea
          id="description"
          value={values.description}
          onChange={(e) => {
            onFieldChange("description");
            setValues((c) => ({ ...c, description: e.target.value }));
          }}
          placeholder={"What happened on the ground?\n\nHow was impact measured?\n\nWhat evidence should a funder look at?\n\nWho benefits, and what comes next?"}
          className={cn(FIELD, "min-h-64 resize-y px-4 py-3.5 text-[15px] leading-7", issues.description && FIELD_ERROR)}
        />
      </Field>
    </div>
  );
}


function PeopleStep({
  did,
  target,
  values,
  setValues,
  sites,
  sitesStatus,
  sitesError,
  refreshSites,
  contributorProfiles,
  setContributorProfile,
  onSiteCreated,
  createPermissionReason = null,
  issues,
  onFieldChange,
}: {
  did: string;
  target: ManageTarget;
  values: FormValues;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  sites: ManagedLocation[];
  sitesStatus: SitesStatus;
  sitesError: string | null;
  refreshSites: () => void;
  contributorProfiles: Record<string, ActorResult>;
  setContributorProfile: (identity: string, actor: ActorResult | null) => void;
  onSiteCreated: (site: ManagedLocation) => void;
  createPermissionReason?: string | null;
  issues: Partial<Record<FormField, FormIssue>>;
  onFieldChange: (field: FormField) => void;
}) {
  const [showAllSites, setShowAllSites] = useState(false);
  const { pushModal, show } = useModal();
  const updateContributor = (index: number, value: string) => {
    onFieldChange("contributors");
    setValues((c) => ({ ...c, contributors: c.contributors.map((v, i) => (i === index ? value : v)) }));
  };
  const removeContributor = (index: number) => {
    onFieldChange("contributors");
    setValues((c) => ({ ...c, contributors: c.contributors.filter((_, i) => i !== index) }));
  };
  const toggleLocation = (uri: string) =>
    setValues((c) => ({
      ...c,
      selectedLocationUris: c.selectedLocationUris.includes(uri) ? c.selectedLocationUris.filter((u) => u !== uri) : [...c.selectedLocationUris, uri],
    }));
  const selectedSiteUris = new Set(values.selectedLocationUris);
  const visibleSites = showAllSites
    ? sites
    : sites.filter((site) => selectedSiteUris.has(site.metadata.uri)).concat(sites.filter((site) => !selectedSiteUris.has(site.metadata.uri)).slice(0, 6));

  return (
    <div className="space-y-8">
      <Field label="People named" hint="search a name or @handle" error={issues.contributors?.message}>
        <div className="space-y-2.5">
          {values.contributors.map((contributor, index) => (
            <ContributorInput
              key={index}
              value={contributor}
              actor={contributorProfiles[contributor] ?? null}
              onChange={(v) => updateContributor(index, v)}
              onActorChange={(actor) => setContributorProfile(contributor, actor)}
              onRemove={() => removeContributor(index)}
              canRemove={values.contributors.length > 1}
              placeholder={index === 0 ? "Search e.g. “Rufiji Stewards” or @handle" : "Name or @handle"}
              error={issues.contributors?.message}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onFieldChange("contributors");
            setValues((c) => ({ ...c, contributors: [...c.contributors, ""] }));
          }}
          className="mt-2 -ml-2 text-primary hover:text-primary"
        >
          <PlusIcon className="size-4" /> Add person or group
        </Button>
      </Field>

      <Field label="Sites" hint="optional — but it makes the work easier to verify">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(createPermissionReason)}
            title={createPermissionReason ?? undefined}
            onClick={() => {
              if (createPermissionReason) return;
              pushModal(
                {
                  id: SiteEditorModalId,
                  dialogWidth: "max-w-lg",
                  content: (
                    <SiteEditorModal
                      did={did}
                      target={target}
                      initialData={null}
                      onSaved={(savedRef) => {
                        const optimisticSite: ManagedLocation = {
                          metadata: {
                            did,
                            uri: savedRef.uri,
                            rkey: savedRef.rkey,
                            cid: savedRef.cid,
                            createdAt: new Date().toISOString(),
                          },
                          record: {
                            name: savedRef.name,
                            description: null,
                            locationType: "geojson-point",
                            location: null,
                          },
                        };
                        onSiteCreated(optimisticSite);
                        setValues((current) => ({
                          ...current,
                          selectedLocationUris: [
                            ...current.selectedLocationUris,
                            savedRef.uri,
                          ],
                        }));
                      }}
                    />
                  ),
                },
                true,
              );
              void show();
            }}
          >
            <PlusIcon className="size-4" /> Add a site
          </Button>
          {sites.length > 6 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAllSites((current) => !current)}>
              {showAllSites ? "Show fewer sites" : `Show all ${sites.length} sites`}
            </Button>
          ) : null}
        </div>
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
            You don’t have any sites yet. You can publish without one, add one here, or add project places under{" "}
            <Link href={manageHref(target, "sites")} className="text-primary underline-offset-2 hover:underline">Manage → Sites</Link> and come back.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {visibleSites.map((site) => {
              const active = values.selectedLocationUris.includes(site.metadata.uri);
              return (
                <button
                  key={site.metadata.uri}
                  type="button"
                  onClick={() => toggleLocation(site.metadata.uri)}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                    active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/30",
                  )}
                >
                  <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full transition-colors", active ? "bg-primary text-primary-foreground" : "bg-background/70 text-muted-foreground")}>
                    {active ? <CheckIcon className="size-3.5" /> : <MapPinIcon className="size-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-sm font-medium", active ? "text-primary" : "text-foreground")}>{site.record.name || "Unnamed site"}</span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{siteSubtitle(site)}</span>
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

function ConfirmStep({
  values,
  setValues,
  publishError,
  issues,
  isComplete,
  onFieldChange,
}: {
  values: FormValues;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  publishError: string | null;
  issues: FormIssue[];
  isComplete: boolean;
  onFieldChange: (field: FormField) => void;
}) {
  const validation = issues[0]?.message ?? null;
  const fieldIssues = issuesByField(issues);
  const statusLabel = validation ?? (isComplete ? "Ready to publish" : "Complete the required details");

  return (
    <div className="space-y-5">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium", validation ? "bg-warn/15 text-foreground" : isComplete ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
        {validation ? <TriangleAlertIcon className="size-3.5" /> : isComplete ? <CheckIcon className="size-3.5" /> : <LeafIcon className="size-3.5" />}
        {statusLabel}
      </span>

      <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border bg-background px-4 py-3.5 transition-colors", fieldIssues.confirmedRights ? "border-2 border-destructive ring-2 ring-destructive/25" : "border-border")}>
        <Checkbox
          checked={values.confirmedRights}
          onCheckedChange={(checked) => {
            onFieldChange("confirmedRights");
            setValues((c) => ({ ...c, confirmedRights: checked === true }));
          }}
          className="mt-0.5"
        />
        <span className="text-[13px] leading-6 text-foreground">
          I confirm I have permission to create this Bumicert for the work and sites above, and that the details are accurate.
          {fieldIssues.confirmedRights ? <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75"><TriangleAlertIcon className="size-3.5 text-warn" /> {fieldIssues.confirmedRights.message}</span> : null}
        </span>
      </label>

      <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border bg-background px-4 py-3.5 transition-colors", fieldIssues.acceptedTerms ? "border-2 border-destructive ring-2 ring-destructive/25" : "border-border")}>
        <Checkbox
          checked={values.acceptedTerms}
          onCheckedChange={(checked) => {
            onFieldChange("acceptedTerms");
            setValues((c) => ({ ...c, acceptedTerms: checked === true }));
          }}
          className="mt-0.5"
        />
        <span className="text-[13px] leading-6 text-foreground">
          I agree to the <a href={TERMS_URL} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">terms and conditions</a>.
          {fieldIssues.acceptedTerms ? <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75"><TriangleAlertIcon className="size-3.5 text-warn" /> {fieldIssues.acceptedTerms.message}</span> : null}
        </span>
      </label>

      <p className="text-[13px] leading-6 text-muted-foreground">
        Publishing adds this Bumicert to your public profile — it becomes visible to everyone.
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
  profile,
  did,
  onCoverChange,
  onCoverFile,
  onCoverClear,
  coverError,
}: {
  values: FormValues;
  coverPreview: string | null;
  sites: ManagedLocation[];
  profile: ProfilePreview;
  did: string;
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
          logoUrl={profile.avatarUrl}
          ownerDid={did}
          title={values.title.trim() || "Your Bumicert title"}
          organizationName={profile.name}
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

function DraftsSubheader({
  drafts,
  activeDraftId,
  onLoadDraft,
  onDeleteDraft,
}: {
  drafts: Draft[];
  activeDraftId: string | null;
  onLoadDraft: (draft: Draft) => void;
  onDeleteDraft: (id: string) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max items-center gap-2 border-b border-border/70 pb-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/80">Drafts</span>
        {drafts.slice(0, 5).map((draft) => (
          <span key={draft.id} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors", draft.id === activeDraftId ? "border-primary bg-primary/12 text-primary" : "border-border bg-background hover:bg-muted/60")}>
            <button type="button" onClick={() => onLoadDraft(draft)} className="font-medium">
              {titleFromDraft(draft)}
              <span className="ml-1.5 font-normal text-muted-foreground">· {formatDraftDate(draft.updatedAt)}</span>
            </button>
            <button type="button" onClick={() => onDeleteDraft(draft.id)} aria-label="Delete draft" className="text-muted-foreground transition-colors hover:text-destructive">
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Published ──────────────────────────────────────────────────────────── */

function PublishedView({ result, target, ownerIdentifier, onReset }: { result: PublishResult; target: ManageTarget; ownerIdentifier: string; onReset: () => void }) {
  const detailHref = localBumicertHref(ownerIdentifier, result.rkey);
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
          <Link href={manageHref(target, "bumicerts")}>Back to Bumicerts</Link>
        </Button>
        {hyperscanHref ? (
          <Button asChild variant="ghost">
            <a href={hyperscanHref} target="_blank" rel="noreferrer">View public details</a>
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onReset}>Create another</Button>
      </div>

    </motion.div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────── */

export function NewBumicertClient({
  did,
  target,
  ownerIdentifier,
  profile,
  linkedProject = null,
}: {
  did: string;
  target: ManageTarget;
  ownerIdentifier: string;
  profile: ProfilePreview;
  linkedProject?: LinkedProjectPrefill | null;
}) {
  const [values, setValues] = useState<FormValues>(() => initialFormValues(linkedProject));
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [prefilledCoverUrl, setPrefilledCoverUrl] = useState<string | null>(() => linkedProject?.imageUrl ?? null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [sites, setSites] = useState<ManagedLocation[]>([]);
  const [sitesStatus, setSitesStatus] = useState<SitesStatus>("idle");
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [contributorProfiles, setContributorProfiles] = useState<Record<string, ActorResult>>({});
  const [touchedFields, setTouchedFields] = useState<Partial<Record<FormField, boolean>>>({});
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [mobileSheet, setMobileSheet] = useState<"preview" | null>(null);
  const publishPermission = canCreateRecord(target);
  const linkedProjectUpdatePermission = canUpdateRecord(target);
  const canLinkToProject = Boolean(linkedProject?.canLink && linkedProjectUpdatePermission.allowed);
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
    fetch(manageApiHref("/api/manage/sites", target), { signal: controller.signal })
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
  }, [target]);

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

  const formIssues = getFormIssues(values);
  const visibleIssues = formIssues.filter((issue) => publishAttempted || touchedFields[issue.field]);
  const fieldIssues = issuesByField(visibleIssues);

  const markFieldChanged = useCallback((field: FormField) => {
    setTouchedFields((current) => current[field] ? current : { ...current, [field]: true });
  }, []);

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
      setPrefilledCoverUrl(null);
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
    setPrefilledCoverUrl(null);
    setCoverError(null);
  };

  const setContributorProfile = useCallback((identity: string, actor: ActorResult | null) => {
    setContributorProfiles((current) => {
      const next = { ...current };
      if (identity) delete next[identity];
      if (actor) {
        next[actor.did] = actor;
        if (actor.handle) next[actor.handle] = actor;
      }
      return next;
    });
  }, []);

  const handleSiteCreated = useCallback((site: ManagedLocation) => {
    setSites((current) => [site, ...current.filter((item) => item.metadata.uri !== site.metadata.uri)]);
  }, []);

  const handleLoadDraft = (draft: Draft) => {
    setValues(normalizeDraftValues(draft.values));
    setActiveDraftId(draft.id);
    setPublishResult(null);
    setPublishError(null);
    setPublishAttempted(false);
    setTouchedFields({});
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
    setValues(initialFormValues(linkedProject));
    setActiveDraftId(null);
    setPublishResult(null);
    setPublishError(null);
    setPublishAttempted(false);
    setTouchedFields({});
    clearCover();
    setPrefilledCoverUrl(linkedProject?.imageUrl ?? null);
  };

  const buildWorkScopeRecord = async () => {
    const createdAt = new Date().toISOString();
    const refs = await Promise.all(scopeKeys(values).map(async (scope) => {
      const result = await putRecord(WORK_SCOPE_TAG_COLLECTION, scope.key, {
        $type: WORK_SCOPE_TAG_COLLECTION,
        key: scope.key,
        name: scope.label,
        category: "topic",
        createdAt,
      }, target.kind === "group" ? { repo: target.did } : undefined);
      return { uri: result.uri, cid: result.cid };
    }));
    return {
      $type: "org.hypercerts.workscope.cel",
      expression: buildWorkScopeExpression(values),
      usedTags: refs,
      version: "v1",
      createdAt,
    };
  };

  const handlePublish = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateAll(values);
    if (validation) {
      setPublishAttempted(true);
      setPublishError(validation);
      return;
    }
    if (!publishPermission.allowed) {
      setPublishError(publishPermission.reason ?? "You cannot publish for this organization.");
      return;
    }
    setIsPublishing(true);
    setPublishError(null);
    try {
      let image: Record<string, unknown> | undefined;
      if (coverFile) {
        const blob = await uploadBlob(coverFile, target.kind === "group" ? { repo: target.did } : undefined);
        image = { $type: "org.hypercerts.defs#smallImage", image: blob.ref };
      } else if (prefilledCoverUrl) {
        image = { $type: "org.hypercerts.defs#uri", uri: prefilledCoverUrl };
      }
      const [siteRefs, workScope] = await Promise.all([
        Promise.resolve(selectedLocationRefs(values, sites, linkedProject)),
        buildWorkScopeRecord(),
      ]);
      const record: Record<string, unknown> = {
        $type: COLLECTION,
        title: values.title.trim(),
        shortDescription: clampDescription(values.shortDescription),
        description: { $type: "org.hypercerts.defs#descriptionString", value: values.description.trim() },
        workScope,
        startDate: dateToIso(values.startDate),
        ...(values.ongoing ? {} : { endDate: dateToIso(values.endDate) }),
        contributors: contributorList(values).map((identity) => ({
          contributorIdentity: { $type: "org.hypercerts.claim.activity#contributorIdentity", identity },
        })),
        ...(siteRefs.length ? { locations: siteRefs } : {}),
        ...(image ? { image } : {}),
        createdAt: new Date().toISOString(),
      };
      const result = await createRecord(COLLECTION, record, undefined, target.kind === "group" ? { repo: target.did } : undefined);
      if (linkedProject?.canLink && linkedProjectUpdatePermission.allowed) await appendBumicertToProject(linkedProject, result, target);
      setPublishResult({ uri: result.uri, cid: result.cid, rkey: extractRkey(result.uri) });
      if (activeDraftId) handleDeleteDraft(activeDraftId);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Could not publish the Bumicert.");
    } finally {
      setIsPublishing(false);
    }
  };

  const previewProps = {
    values,
    coverPreview: coverPreview ?? prefilledCoverUrl,
    sites,
    profile,
    did,
    onCoverChange: handleCoverChange,
    onCoverFile: applyCoverFile,
    onCoverClear: clearCover,
    coverError,
  };

  return (
    <div className="relative">
      {/* soft sage wash */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[20rem] bg-gradient-to-b from-primary/[0.07] via-primary/[0.02] to-transparent" />

      {/* Start over in the header */}
      <HeaderContent
        right={
          !publishResult ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="text-muted-foreground">
              <RotateCcwIcon className="size-4" /> <span className="hidden sm:inline">Start over</span>
            </Button>
          ) : null
        }
        sub={
          !publishResult && drafts.length > 0 ? (
            <DraftsSubheader drafts={drafts} activeDraftId={activeDraftId} onLoadDraft={handleLoadDraft} onDeleteDraft={handleDeleteDraft} />
          ) : null
        }
      />

      <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 sm:py-9">
        {publishResult ? (
          <PublishedView result={publishResult} target={target} ownerIdentifier={ownerIdentifier} onReset={resetForm} />
        ) : (
          <>
            <form onSubmit={handlePublish} className="mt-2 grid gap-x-14 gap-y-12 xl:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="min-w-0">
                <section>
                  <SectionHeader eyebrow="Basics" title={STEPS[0].title} subtitle={STEPS[0].subtitle} />
                  <BasicsStep values={values} setValues={setValues} issues={fieldIssues} onFieldChange={markFieldChanged} />

                  {/* Mobile: live preview shown inline */}
                  <div className="mt-10 xl:hidden">
                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">Live preview</p>
                    <div className="mx-auto max-w-[18rem]">
                      <PreviewContent {...previewProps} />
                    </div>
                  </div>
                </section>

                <section className="mt-14 border-t border-border/40 pt-14">
                  <SectionHeader eyebrow="Story" title={STEPS[1].title} subtitle={STEPS[1].subtitle} />
                  <StoryStep values={values} setValues={setValues} issues={fieldIssues} onFieldChange={markFieldChanged} />
                </section>

                <section className="mt-14 border-t border-border/40 pt-14">
                  <SectionHeader eyebrow="People & places" title={STEPS[2].title} subtitle={STEPS[2].subtitle} />
                  <PeopleStep
                    did={did}
                    target={target}
                    values={values}
                    setValues={setValues}
                    sites={sites}
                    sitesStatus={sitesStatus}
                    sitesError={sitesError}
                    refreshSites={refreshSites}
                    contributorProfiles={contributorProfiles}
                    setContributorProfile={setContributorProfile}
                    onSiteCreated={handleSiteCreated}
                    createPermissionReason={publishPermission.reason}
                    issues={fieldIssues}
                    onFieldChange={markFieldChanged}
                  />
                </section>

                <section className="mt-14 border-t border-border/40 pt-14">
                  <SectionHeader eyebrow="Publish" title="ready to publish?" subtitle="One last verification, then make it public." />
                  <ConfirmStep values={values} setValues={setValues} publishError={publishError} issues={visibleIssues} isComplete={formIssues.length === 0} onFieldChange={markFieldChanged} />
                </section>

                <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
                  <span className="hidden text-xs text-muted-foreground sm:block">{activeDraftId ? "Saved" : "Not saved yet"}</span>
                  <Button type="submit" size="lg" disabled={isPublishing || !publishPermission.allowed} title={publishPermission.reason ?? undefined}>
                    {isPublishing ? <Loader2Icon className="size-4 animate-spin" /> : <LeafIcon className="size-4" />}
                    {isPublishing ? "Publishing…" : canLinkToProject ? "Publish to the project" : "Publish"}
                  </Button>
                </div>
              </div>

              {/* Desktop sidebar: live preview, with Taina's chat docked
                  just below it (where the static Tips list used to be). */}
              <aside className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
                <div className="space-y-8">
                  <div>
                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">Live preview</p>
                    <PreviewContent {...previewProps} />
                  </div>
                  <TainaChatDock />
                </div>
              </aside>
            </form>
          </>
        )}
      </div>

      {/* Mobile floating Preview button + sheet */}
      {!publishResult ? (
        <>
          <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 xl:hidden">
            {/* Taina sits just above the Preview button — where the old
                "Tips" button used to be. Tapping opens her chat in a sheet. */}
            <TainaMobileTrigger />
            <Button type="button" variant="outline" size="sm" onClick={() => setMobileSheet("preview")} className="shadow-lg">
              <EyeIcon className="size-4" /> Preview
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
                    <span className="font-instrument text-2xl italic text-foreground">Preview</span>
                    <button type="button" onClick={() => setMobileSheet(null)} aria-label="Close" className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted">
                      <XIcon className="size-5" />
                    </button>
                  </div>
                  <div className="mx-auto max-w-[18rem]">
                    <PreviewContent {...previewProps} />
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
    </div>
  );
}
