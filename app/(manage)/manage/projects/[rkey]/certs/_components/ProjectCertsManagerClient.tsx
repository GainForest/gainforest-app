"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CirclePlusIcon,
  EyeIcon,
  LeafIcon,
  Link2Icon,
  Loader2Icon,
  RefreshCcwIcon,
  SearchIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { manageApiHref, manageHref, type ManageTarget } from "@/lib/links";
import { localBumicertHref } from "@/app/_lib/urls";
import { canUpdateRecord } from "../../../../_lib/cgs-permissions";
import { putRecord } from "../../../../_lib/mutations";

const PROJECT_COLLECTION = "org.hypercerts.collection";

type ManagedProject = {
  kind: "project";
  id: string;
  did: string;
  rkey: string;
  atUri: string;
  cid: string | null;
  title: string;
  shortDescription: string | null;
  createdAt: string;
  imageUrl: string | null;
  bumicertUris: string[];
  bumicertCount: number;
  rawRecord: Record<string, unknown> | null;
};

type ManagedCert = {
  kind: "bumicert";
  id: string;
  did: string;
  rkey: string;
  atUri: string;
  cid: string | null;
  title: string;
  shortDescription: string | null;
  startDate: string | null;
  endDate: string | null;
  contributorCount: number;
  locationCount: number;
  scopeTags: string[];
  createdAt: string;
  imageUrl: string | null;
  creatorName: string | null;
  linked: boolean;
};

type ProjectCertsResponse = {
  project: ManagedProject;
  certs: ManagedCert[];
};

type PendingAction = { uri: string; action: "add" | "unlink" } | null;

export function ProjectCertsManagerClient({ target, projectRkey }: { target: ManageTarget; projectRkey: string }) {
  const t = useTranslations("marketplace.manageProjectCerts");
  const [data, setData] = useState<ProjectCertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const updatePermission = canUpdateRecord(target);
  const repoOptions = target.kind === "group" ? { repo: target.did } : undefined;

  const loadCerts = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(manageApiHref(`/api/manage/projects/${encodeURIComponent(projectRkey)}/certs`, target), { cache: "no-store" });
      const result = (await response.json()) as ProjectCertsResponse | { error?: string };
      if (!response.ok || !("project" in result)) {
        setError("error" in result && result.error ? result.error : t("errors.loadFallback"));
        if (showLoading) setData(null);
        return;
      }
      setData(result);
    } catch {
      setError(t("errors.network"));
      if (showLoading) setData(null);
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  }, [projectRkey, target, t]);

  useEffect(() => {
    void loadCerts({ showLoading: true });
  }, [loadCerts]);

  const matchesQuery = useCallback(
    (cert: ManagedCert) => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) return true;
      return `${cert.title} ${cert.shortDescription ?? ""}`.toLowerCase().includes(normalized);
    },
    [query],
  );

  const allCerts = useMemo(() => data?.certs ?? [], [data?.certs]);
  // "Minted from this project" = Certs currently attached to it. "Linkable" =
  // the steward's other Certs that could be attached as a secondary action.
  const mintedCerts = useMemo(() => allCerts.filter((cert) => cert.linked && matchesQuery(cert)), [allCerts, matchesQuery]);
  const linkableAll = useMemo(() => allCerts.filter((cert) => !cert.linked), [allCerts]);
  const linkableCerts = useMemo(() => linkableAll.filter(matchesQuery), [linkableAll, matchesQuery]);
  const mintedCount = allCerts.filter((cert) => cert.linked).length;
  const hasQuery = query.trim().length > 0;
  const project = data?.project ?? null;
  const newCertHref = project ? manageHref(target, "newBumicert", { forProject: `${project.did}/${project.rkey}` }) : manageHref(target, "newBumicert");

  async function toggleCert(cert: ManagedCert) {
    if (!project || !data) return;
    if (!updatePermission.allowed) {
      setError(updatePermission.reason ?? t("errors.noPermission"));
      return;
    }
    if (!project.rawRecord) {
      setError(t("errors.projectUnavailable"));
      return;
    }

    const action = cert.linked ? "unlink" : "add";
    try {
      setPending({ uri: cert.atUri, action });
      setError(null);
      const record = projectRecordWithCert(project, cert, action);
      await putRecord(PROJECT_COLLECTION, project.rkey, record, {
        ...(project.cid ? { swapRecord: project.cid } : {}),
        ...(repoOptions ?? {}),
      });
      setData((current) => current ? projectCertsWithLocalChange(current, cert, record, action === "add") : current);
      void loadCerts({ showLoading: false });
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : t("errors.updateFallback"));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`${target.basePath}/projects`}>
            <ArrowLeftIcon className="size-4" />
            {t("nav.projects")}
          </Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void loadCerts({ showLoading: false })} disabled={loading || refreshing || pending !== null}>
          <RefreshCcwIcon className={cn("size-4", (loading || refreshing) && "animate-spin")} />
          {t("nav.refresh")}
        </Button>
      </div>

      {loading ? (
        <CertsSkeleton />
      ) : error && !project ? (
        <ErrorState title={t("errors.loadTitle")} message={error} retryLabel={t("actions.retry")} onRetry={() => void loadCerts({ showLoading: true })} />
      ) : project ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="font-instrument text-3xl font-light italic tracking-[-0.03em] text-foreground sm:text-5xl">
                {project.title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("hero.description")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-3 py-1">{t("stats.minted", { count: mintedCount })}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="group/input-group border-input relative flex h-10 min-w-0 flex-1 items-center rounded-full border bg-background/70 shadow-xs backdrop-blur transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 sm:w-72 sm:flex-none">
                <SearchIcon className="ml-3 h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={t("search.ariaLabel")}
                  placeholder={t("search.placeholder")}
                  className="min-w-0 flex-1 truncate border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Button asChild>
                <Link href={newCertHref}>
                  <CirclePlusIcon className="size-4" />
                  {t("actions.mint")}
                </Link>
              </Button>
            </div>
          </div>

          {!updatePermission.allowed ? (
            <div className="flex items-center gap-2 rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-foreground">
              <TriangleAlertIcon className="size-4 text-warn" />
              {updatePermission.reason ?? t("errors.noPermission")}
            </div>
          ) : null}

          {error ? (
            <div className="flex items-center gap-2 rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-foreground">
              <TriangleAlertIcon className="size-4 text-warn" />
              {error}
            </div>
          ) : null}

          {mintedCerts.length === 0 ? (
            <EmptyState
              hasQuery={hasQuery}
              createHref={newCertHref}
              canLink={updatePermission.allowed && linkableAll.length > 0}
              onLink={() => setShowLink(true)}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" role="list">
              {mintedCerts.map((cert) => (
                <CertTile
                  key={cert.atUri}
                  cert={cert}
                  pending={pending && pending.uri === cert.atUri ? pending.action : null}
                  disabled={!updatePermission.allowed || pending !== null}
                  disabledReason={updatePermission.reason}
                  onToggle={() => void toggleCert(cert)}
                />
              ))}
            </ul>
          )}

          {updatePermission.allowed && linkableAll.length > 0 ? (
            <LinkExistingSection
              open={showLink}
              onToggle={() => setShowLink((value) => !value)}
              certs={linkableCerts}
              hasQuery={hasQuery}
              availableCount={linkableAll.length}
              pending={pending}
              disabled={pending !== null}
              disabledReason={updatePermission.reason}
              onAdd={(cert) => void toggleCert(cert)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CertTile({
  cert,
  pending,
  disabled,
  disabledReason,
  onToggle,
}: {
  cert: ManagedCert;
  pending: NonNullable<PendingAction>["action"] | null;
  disabled: boolean;
  disabledReason: string | null;
  onToggle: () => void;
}) {
  const t = useTranslations("marketplace.manageProjectCerts");
  const details = certDetails(cert, t);

  return (
    <li className={cn("group overflow-hidden rounded-3xl border bg-card shadow-sm transition", cert.linked ? "border-primary/25" : "border-border")}>
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-28 sm:w-32">
          {cert.imageUrl ? (
            <Image src={cert.imageUrl} alt={cert.title} fill unoptimized sizes="128px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="grid h-full place-items-center text-primary/60">
              <LeafIcon className="size-8" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <h2 className="line-clamp-2 font-instrument text-2xl italic leading-tight tracking-[-0.02em] text-foreground">{cert.title}</h2>
              {cert.linked ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-medium text-primary">
                  <CheckIcon className="size-3.5" />
                  {t("status.linked")}
                </span>
              ) : null}
            </div>
            {cert.shortDescription ? (
              <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{cert.shortDescription}</p>
            ) : (
              <p className="text-sm italic leading-6 text-muted-foreground">{t("card.noSummary")}</p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {details.map((detail) => <span key={detail}>{detail}</span>)}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button asChild type="button" variant="outline" size="sm" className="h-8">
                <Link href={localBumicertHref(cert.did, cert.rkey)}>
                  <EyeIcon className="size-3.5" />
                  {t("actions.view")}
                </Link>
              </Button>
              <Button
                type="button"
                variant={cert.linked ? "outline" : "default"}
                size="sm"
                disabled={disabled}
                title={disabledReason ?? undefined}
                onClick={onToggle}
                className="h-8"
              >
                {pending ? <Loader2Icon className="size-3.5 animate-spin" /> : cert.linked ? <XIcon className="size-3.5" /> : <Link2Icon className="size-3.5" />}
                {pending ? t("actions.saving") : cert.linked ? t("actions.unlink") : t("actions.link")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function CertsSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-28 rounded-3xl" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="flex gap-4 rounded-3xl border border-border bg-card p-4">
            <Skeleton className="h-28 w-32 shrink-0 rounded-2xl" />
            <div className="flex flex-1 flex-col justify-between py-1">
              <div className="space-y-3">
                <Skeleton className="h-6 w-3/4 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" />
                <Skeleton className="h-4 w-2/3 rounded-full" />
              </div>
              <Skeleton className="h-8 w-24 self-end rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  hasQuery,
  createHref,
  canLink,
  onLink,
}: {
  hasQuery: boolean;
  createHref: string;
  canLink: boolean;
  onLink: () => void;
}) {
  const t = useTranslations("marketplace.manageProjectCerts");
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-[2rem] border border-dashed border-border bg-muted/20 px-6 text-center">
      <LeafIcon className="mb-4 size-10 text-primary" />
      <h2 className="font-instrument text-2xl font-light italic tracking-[-0.02em] text-foreground">
        {hasQuery ? t("empty.noMatchingTitle") : t("empty.noCertsTitle")}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {hasQuery ? t("empty.noMatchingDescription") : t("empty.noCertsDescription")}
      </p>
      {!hasQuery ? (
        <div className="mt-5 flex flex-col items-center gap-2">
          <Button asChild size="sm">
            <Link href={createHref}>
              <CirclePlusIcon className="size-4" />
              {t("actions.mintFirst")}
            </Link>
          </Button>
          {canLink ? (
            <Button type="button" variant="ghost" size="sm" onClick={onLink} className="text-muted-foreground">
              <Link2Icon className="size-4" />
              {t("linkExisting.toggle")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LinkExistingSection({
  open,
  onToggle,
  certs,
  hasQuery,
  availableCount,
  pending,
  disabled,
  disabledReason,
  onAdd,
}: {
  open: boolean;
  onToggle: () => void;
  certs: ManagedCert[];
  hasQuery: boolean;
  availableCount: number;
  pending: PendingAction;
  disabled: boolean;
  disabledReason: string | null;
  onAdd: (cert: ManagedCert) => void;
}) {
  const t = useTranslations("marketplace.manageProjectCerts");
  return (
    <section className="overflow-hidden rounded-3xl border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 sm:px-5"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Link2Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-instrument text-xl italic text-foreground">{t("linkExisting.title")}</span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{t("stats.available", { count: availableCount })}</span>
        </span>
        <ChevronDownIcon className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t border-border/60 px-4 py-4 sm:px-5">
          <p className="mb-4 max-w-2xl text-sm leading-6 text-muted-foreground">{t("linkExisting.description")}</p>
          {certs.length === 0 ? (
            <p className="rounded-2xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
              {hasQuery ? t("empty.noMatchingDescription") : t("linkExisting.empty")}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" role="list">
              {certs.map((cert) => (
                <CertTile
                  key={cert.atUri}
                  cert={cert}
                  pending={pending && pending.uri === cert.atUri ? pending.action : null}
                  disabled={disabled}
                  disabledReason={disabledReason}
                  onToggle={() => onAdd(cert)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ErrorState({ title, message, retryLabel, onRetry }: { title: string; message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-[2rem] bg-muted/30 px-6 text-center">
      <TriangleAlertIcon className="mb-4 size-9 text-muted-foreground opacity-70" />
      <h2 className="font-instrument text-2xl font-medium italic tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-5">
        {retryLabel}
      </Button>
    </div>
  );
}

function certDetails(cert: ManagedCert, t: ReturnType<typeof useTranslations>): string[] {
  return [
    cert.locationCount > 0 ? t("details.sites", { count: cert.locationCount }) : null,
    cert.contributorCount > 0 ? t("details.contributors", { count: cert.contributorCount }) : null,
    cert.startDate || cert.endDate ? t("details.impactPeriod") : null,
    !cert.locationCount && !cert.contributorCount && !cert.startDate && !cert.endDate ? createdDetail(cert.createdAt, t) : null,
  ].filter((detail): detail is string => Boolean(detail));
}

function projectCertsWithLocalChange(
  current: ProjectCertsResponse,
  cert: ManagedCert,
  nextRecord: Record<string, unknown>,
  linked: boolean,
): ProjectCertsResponse {
  const bumicertUris = Array.isArray(nextRecord.items)
    ? nextRecord.items.map(projectItemUri).filter((uri): uri is string => Boolean(uri))
    : current.project.bumicertUris;

  return {
    project: {
      ...current.project,
      rawRecord: nextRecord,
      bumicertUris,
      bumicertCount: bumicertUris.length,
    },
    certs: current.certs.map((item) => item.atUri === cert.atUri ? { ...item, linked } : item),
  };
}

function projectRecordWithCert(project: ManagedProject, cert: ManagedCert, action: "add" | "unlink"): Record<string, unknown> {
  const base = isRecord(project.rawRecord) ? { ...project.rawRecord } : {};
  const existingItems = Array.isArray(base.items) ? base.items.filter(isRecord) : [];
  const nextItems = action === "unlink"
    ? existingItems.filter((item) => projectItemUri(item) !== cert.atUri)
    : existingItems.some((item) => projectItemUri(item) === cert.atUri)
      ? existingItems
      : [...existingItems, { itemIdentifier: { uri: cert.atUri, ...(cert.cid ? { cid: cert.cid } : {}) } }];

  return {
    ...base,
    $type: PROJECT_COLLECTION,
    title: stringValue(base.title) ?? project.title,
    type: "project",
    createdAt: stringValue(base.createdAt) ?? project.createdAt ?? new Date().toISOString(),
    items: nextItems,
  };
}

function projectItemUri(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const itemIdentifier = isRecord(value.itemIdentifier) ? value.itemIdentifier : value;
  return stringValue(itemIdentifier.uri);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function createdDetail(value: string, t: ReturnType<typeof useTranslations>): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return t("details.created", { date: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date) });
}
