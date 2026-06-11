"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Building2Icon,
  CalendarIcon,
  CheckIcon,
  GlobeIcon,
  ImageIcon,
  Loader2Icon,
  LockIcon,
  MapPinIcon,
  PencilIcon,
  PlusCircleIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountRouteData } from "@/app/account/_lib/account-route";
import { ManageAccountSetup } from "./ManageAccountSetup";
import {
  parseManageMode,
  resolveDashboardMode,
  shouldClearDashboardMode,
  type ManageMode,
} from "./manageDashboardMode";
import { HeaderContent } from "@/app/_components/HeaderSlots";
import { countryFlag } from "@/app/_lib/format";
import { resolvePdsHost } from "@/app/_lib/pds";
import { putRecord, uploadBlob } from "../_lib/mutations";
import { createCountryLocationStrongRef, normalizeCountryCode } from "../_lib/country-location";
import Container from "@/components/ui/container";
import { useModal } from "@/components/ui/modal/context";
import {
  StartDateSelectorModal,
  VisibilitySelectorModal,
  WebsiteEditorModal,
} from "../_modals/DashboardEditModals";
import CountrySelectorModal from "@/components/modals/country-selector";
import { ImageEditorModal } from "@/components/modals/image-editor";

function formatWebsite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function isValidWebsite(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    return parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

function formatSinceDate(value: string | null): { label: string | null; state: "empty" | "valid" | "invalid" } {
  if (!value) return { label: null, state: "empty" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: null, state: "invalid" };
  return { label: date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), state: "valid" };
}

function countryName(code: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code; }
  catch { return code; }
}

async function fetchExistingSelfRecord(repo: string, collection: string): Promise<Record<string, unknown>> {
  const host = await resolvePdsHost(repo).catch(() => null);
  if (!host) return {};
  const params = new URLSearchParams({ repo, collection, rkey: "self" });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) return {};
  const data = (await response.json().catch(() => ({}))) as { value?: unknown };
  return typeof data.value === "object" && data.value !== null && !Array.isArray(data.value)
    ? data.value as Record<string, unknown>
    : {};
}

type HeroEditState = {
  displayName: string;
  description: string;
  website: string;
  country: string;
  startDate: string;
  visibility: "Public" | "Unlisted";
  logoFile: File | null;
  coverFile: File | null;
};

type InlineField = "displayName" | "description" | null;

function EditableChip({
  onClick,
  className,
  children,
  isEmpty = false,
}: {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  isEmpty?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] backdrop-blur-md transition-colors",
        isEmpty
          ? "border-primary/20 bg-primary/5 text-primary/70 hover:bg-primary/10"
          : "border-border/50 bg-background/40 text-foreground/60 hover:bg-background/60 hover:text-foreground/80",
        className,
      )}
    >
      {isEmpty ? <PlusCircleIcon className="h-3 w-3 shrink-0" /> : <PencilIcon className="h-3 w-3 shrink-0 opacity-60" />}
      {children}
    </motion.button>
  );
}

function InlineEditActions({
  isSaving,
  onSave,
  onCancel,
}: {
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="mt-2 flex items-center gap-1.5">
      <Button type="button" size="sm" onClick={onSave} disabled={isSaving}>
        {isSaving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSaving}>
        <XIcon /> Cancel
      </Button>
    </span>
  );
}

function EditableHero({
  account,
  editState,
  inlineField,
  isSaving,
  saveError,
  onChange,
  onEditField,
  onSaveInline,
  onCancelInline,
  onEditLogo,
  onEditCover,
  onEditCountry,
  onEditWebsite,
  onEditStartDate,
  onEditVisibility,
}: {
  account: AccountRouteData;
  editState: HeroEditState;
  inlineField: InlineField;
  isSaving: boolean;
  saveError: string | null;
  onChange: (field: keyof Omit<HeroEditState, "logoFile" | "coverFile">, value: string) => void;
  onEditField: (field: InlineField) => void;
  onSaveInline: () => void;
  onCancelInline: () => void;
  onEditLogo: () => void;
  onEditCover: () => void;
  onEditCountry: () => void;
  onEditWebsite: () => void;
  onEditStartDate: () => void;
  onEditVisibility: () => void;
}) {
  const logoObjectUrl = useMemo(
    () => (editState.logoFile ? URL.createObjectURL(editState.logoFile) : null),
    [editState.logoFile],
  );
  const coverObjectUrl = useMemo(
    () => (editState.coverFile ? URL.createObjectURL(editState.coverFile) : null),
    [editState.coverFile],
  );
  useEffect(() => () => { if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl); }, [logoObjectUrl]);
  useEffect(() => () => { if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl); }, [coverObjectUrl]);

  const coverImageUrl = coverObjectUrl ?? account.coverUrl;
  const logoUrl = logoObjectUrl ?? account.avatarUrl;
  const initial = (editState.displayName || account.displayName).charAt(0).toUpperCase();
  const sinceDate = formatSinceDate(editState.startDate);
  const flag = editState.country ? countryFlag(editState.country) : (account.country ? countryFlag(account.country) : "");
  const resolvedCountry = editState.country || account.country;
  const countryLabel = resolvedCountry ? countryName(resolvedCountry) : null;
  const resolvedWebsite = editState.website || account.website;

  return (
    <section className="relative flex min-h-[260px] flex-col overflow-hidden rounded-t-4xl border-t border-border md:min-h-[320px]">
      <div className="absolute inset-0 z-0">
        <motion.div
          initial={{ scale: 1.08, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute inset-0"
        >
          {coverImageUrl ? (
            <Image src={coverImageUrl} alt={`${account.displayName} cover image`} fill priority unoptimized className="object-cover object-center" sizes="(max-width: 1152px) 100vw, 1152px" />
          ) : (
            <div className="absolute inset-0 bg-muted" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, oklch(0.5 0.07 157 / 0.08) 0%, transparent 60%), radial-gradient(circle at 75% 25%, oklch(0.5 0.07 157 / 0.05) 0%, transparent 50%)" }} />
          )}
          <div className="absolute inset-0 bg-linear-to-b from-background/0 via-background/75 to-background" />
        </motion.div>
      </div>

      <div className="absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onEditCover}
          className="flex items-center gap-1.5 rounded-full border border-white/20 bg-background/55 px-3 py-1.5 shadow-lg backdrop-blur-xl transition-colors hover:bg-background/70"
          aria-label="Change cover image"
        >
          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-foreground/80" />
          <span className="text-xs font-medium text-foreground/80">Change cover</span>
        </motion.button>
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-end px-5 pb-6 pt-24">
        <div className="mb-3 flex flex-col items-start gap-3 md:flex-row md:items-center">
          <div className="relative shrink-0">
            <div className="relative h-24 w-24 overflow-hidden rounded-full border border-white/15 bg-muted shadow-sm">
              {logoUrl ? (
                <Image src={logoUrl} alt={account.displayName} fill unoptimized className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">{initial}</div>
              )}
            </div>
            <button
              type="button"
              onClick={onEditLogo}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-muted/60"
              aria-label={account.kind === "organization" ? "Change logo" : "Change photo"}
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="w-full max-w-3xl min-w-0">
            {inlineField === "displayName" ? (
              <div>
                <input
                  type="text"
                  value={editState.displayName}
                  onChange={(e) => onChange("displayName", e.target.value)}
                  placeholder={account.kind === "organization" ? "Organization name" : "Display name"}
                  className="w-full border-b-2 border-white/40 bg-transparent font-instrument text-3xl font-light italic leading-none tracking-[-0.02em] text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-primary/60 sm:text-4xl md:text-5xl"
                  autoFocus
                />
                <InlineEditActions isSaving={isSaving} onSave={onSaveInline} onCancel={onCancelInline} />
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <h1 className="font-instrument text-3xl font-light italic leading-none tracking-[-0.02em] text-foreground sm:text-4xl md:text-5xl">
                  {editState.displayName || account.displayName}
                </h1>
                <button type="button" onClick={() => onEditField("displayName")} className="mt-1 rounded-full p-1 text-foreground/50 hover:bg-background/60 hover:text-foreground" aria-label="Edit display name">
                  <PencilIcon className="h-4 w-4" />
                </button>
              </div>
            )}

            {inlineField === "description" ? (
              <div className="mt-2">
                <textarea
                  value={editState.description}
                  onChange={(e) => onChange("description", e.target.value)}
                  placeholder="Short description…"
                  rows={3}
                  className="w-full resize-none border-b border-white/30 bg-transparent leading-relaxed text-muted-foreground outline-none transition-colors field-sizing-content placeholder:text-muted-foreground/60 focus:border-primary/60"
                  autoFocus
                />
                <InlineEditActions isSaving={isSaving} onSave={onSaveInline} onCancel={onCancelInline} />
              </div>
            ) : (
              <div className="mt-1 flex items-start gap-2">
                {editState.description ? (
                  <p className="line-clamp-4 text-muted-foreground md:line-clamp-2">{editState.description}</p>
                ) : (
                  <p className="text-muted-foreground/70">Add a short description.</p>
                )}
                <button type="button" onClick={() => onEditField("description")} className="rounded-full p-1 text-foreground/50 hover:bg-background/60 hover:text-foreground" aria-label="Edit description">
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {saveError ? <p className="mt-2 text-sm text-destructive">{saveError}</p> : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {account.kind === "organization" && (
            <EditableChip onClick={onEditCountry} isEmpty={!countryLabel}>
              {flag && <span className="text-sm leading-none" aria-hidden="true">{flag}</span>}
              {countryLabel ?? "Add country"}
            </EditableChip>
          )}
          {account.kind === "organization" && (
            <EditableChip onClick={onEditStartDate} isEmpty={sinceDate.state === "empty"}>
              <CalendarIcon className="h-3 w-3 shrink-0" />
              {sinceDate.state === "valid" ? `Since ${sinceDate.label}` : sinceDate.state === "invalid" ? "Invalid date" : "Add start date"}
            </EditableChip>
          )}
          <EditableChip onClick={onEditWebsite} isEmpty={!resolvedWebsite}>
            <GlobeIcon className="h-3 w-3 shrink-0" />
            {resolvedWebsite ? formatWebsite(resolvedWebsite) : "Add website"}
          </EditableChip>
          {account.kind === "organization" && (
            <EditableChip onClick={onEditVisibility}>
              {editState.visibility === "Unlisted" ? <LockIcon className="h-3 w-3 shrink-0" /> : <MapPinIcon className="h-3 w-3 shrink-0" />}
              {editState.visibility}
            </EditableChip>
          )}
        </div>
      </div>
    </section>
  );
}

function RegisterOrganizationButton() {
  return (
    <Button asChild variant="secondary">
      <Link href="/manage?mode=onboard-org">
        <Building2Icon />
        Register as an Organization
      </Link>
    </Button>
  );
}

export function ManageDashboardClient({
  account,
  mode,
  basePath = "/manage",
  writeRepoDid,
  children,
}: {
  account: AccountRouteData;
  mode?: ManageMode | null;
  basePath?: string;
  writeRepoDid?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/manage";
  const searchParams = useSearchParams();
  const modal = useModal();
  const rawMode = mode === undefined ? searchParams.get("mode") ?? undefined : mode ?? undefined;
  const parsedMode = mode === undefined ? parseManageMode(rawMode) : mode;
  const hasCompletedSetup = account.summary.hasCertifiedProfile || account.summary.hasCertifiedOrg;
  const resolvedMode = hasCompletedSetup
    ? resolveDashboardMode({ currentKind: account.kind, mode: parsedMode })
    : parsedMode;
  const isAccountManageRoute = pathname === basePath;

  useEffect(() => {
    if (!isAccountManageRoute || mode !== undefined) return;
    if (hasCompletedSetup) {
      if (!shouldClearDashboardMode({ currentKind: account.kind, rawMode })) return;
    } else if (rawMode === undefined || parseManageMode(rawMode) !== null) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete("mode");
    const query = nextSearchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [account.kind, hasCompletedSetup, isAccountManageRoute, mode, pathname, rawMode, router, searchParams]);

  const [editDisplayName, setEditDisplayName] = useState(account.displayName);
  const [editDescription, setEditDescription] = useState(account.description ?? "");
  const [editWebsite, setEditWebsite] = useState(account.website ?? "");
  const [editCountry, setEditCountry] = useState(account.country ?? "");
  const initialStartDate = account.foundedDate ? new Date(account.foundedDate).toISOString().slice(0, 10) : "";
  const initialVisibility = account.visibility ?? "Public";
  const [editStartDate, setEditStartDate] = useState(initialStartDate);
  const [editVisibility, setEditVisibility] = useState<"Public" | "Unlisted">(initialVisibility);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [inlineField, setInlineField] = useState<InlineField>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isOnboarding = resolvedMode === "onboard" || resolvedMode === "onboard-user" || resolvedMode === "onboard-org" || !hasCompletedSetup;

  const editState: HeroEditState = {
    displayName: editDisplayName,
    description: editDescription,
    website: editWebsite,
    country: editCountry,
    startDate: editStartDate,
    visibility: editVisibility,
    logoFile,
    coverFile,
  };

  const registerOrganizationHeaderAction = useMemo(() => <RegisterOrganizationButton />, []);

  const applyState = (next: HeroEditState) => {
    setEditDisplayName(next.displayName);
    setEditDescription(next.description);
    setEditWebsite(next.website);
    setEditCountry(next.country);
    setEditStartDate(next.startDate);
    setEditVisibility(next.visibility);
    setLogoFile(next.logoFile);
    setCoverFile(next.coverFile);
  };

  const resetState = () => {
    applyState({
      displayName: account.displayName,
      description: account.description ?? "",
      website: account.website ?? "",
      country: account.country ?? "",
      startDate: initialStartDate,
      visibility: initialVisibility,
      logoFile: null,
      coverFile: null,
    });
    setInlineField(null);
    setSaveError(null);
  };

  const handleChange = (field: keyof Omit<HeroEditState, "logoFile" | "coverFile">, value: string) => {
    switch (field) {
      case "displayName": setEditDisplayName(value); break;
      case "description": setEditDescription(value); break;
      case "website": setEditWebsite(value); break;
      case "country": setEditCountry(value); break;
      case "startDate": setEditStartDate(value); break;
      case "visibility": setEditVisibility(value as "Public" | "Unlisted"); break;
    }
  };

  const saveChanges = async (overrides: Partial<HeroEditState> = {}) => {
    if (isSaving) return;
    const next: HeroEditState = { ...editState, ...overrides };
    if (!next.displayName.trim()) {
      setSaveError("Add a name before saving.");
      return;
    }
    if (!isValidWebsite(next.website)) {
      setSaveError("Enter a valid website address.");
      return;
    }
    if (account.kind === "organization" && next.country.trim() && !normalizeCountryCode(next.country)) {
      setSaveError("Choose a country from the list.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    applyState(next);

    try {
      let avatarBlob: { ref: unknown; mimeType: string; size: number } | null = null;
      let bannerBlob: { ref: unknown; mimeType: string; size: number } | null = null;
      const writeOptions = writeRepoDid ? { repo: writeRepoDid } : undefined;
      if (next.logoFile) avatarBlob = await uploadBlob(next.logoFile, writeOptions);
      if (next.coverFile) bannerBlob = await uploadBlob(next.coverFile, writeOptions);

      const shouldWriteProfile = Object.keys(overrides).length === 0 || (
        "displayName" in overrides ||
        "description" in overrides ||
        "website" in overrides ||
        "logoFile" in overrides ||
        "coverFile" in overrides
      );
      if (shouldWriteProfile) {
        const repo = writeRepoDid ?? account.did;
        const [existingProfile, existingCertifiedProfile] = await Promise.all([
          fetchExistingSelfRecord(repo, "app.bsky.actor.profile"),
          fetchExistingSelfRecord(repo, "app.certified.actor.profile"),
        ]);
        const profileRecord: Record<string, unknown> = { ...existingProfile, $type: "app.bsky.actor.profile" };
        const certifiedProfileRecord: Record<string, unknown> = {
          ...existingCertifiedProfile,
          $type: "app.certified.actor.profile",
          createdAt: typeof existingCertifiedProfile.createdAt === "string" ? existingCertifiedProfile.createdAt : account.createdAt ?? new Date().toISOString(),
        };
        if (next.displayName.trim()) {
          profileRecord.displayName = next.displayName.trim();
          certifiedProfileRecord.displayName = next.displayName.trim();
        } else {
          delete profileRecord.displayName;
          delete certifiedProfileRecord.displayName;
        }
        if (next.description.trim()) {
          profileRecord.description = next.description.trim();
          certifiedProfileRecord.description = next.description.trim();
        } else {
          delete profileRecord.description;
          delete certifiedProfileRecord.description;
        }
        if (next.website.trim()) {
          const url = next.website.startsWith("http") ? next.website : `https://${next.website}`;
          profileRecord.website = url.trim();
          certifiedProfileRecord.website = url.trim();
        } else {
          delete profileRecord.website;
          delete certifiedProfileRecord.website;
        }
        if (avatarBlob) {
          profileRecord.avatar = avatarBlob;
          certifiedProfileRecord.avatar = { $type: "org.hypercerts.defs#smallImage", image: avatarBlob.ref };
        }
        if (bannerBlob) profileRecord.banner = bannerBlob;

        await Promise.all([
          putRecord("app.bsky.actor.profile", "self", profileRecord, writeOptions),
          putRecord("app.certified.actor.profile", "self", certifiedProfileRecord, writeOptions),
        ]);
      }

      const shouldWriteOrg = account.kind === "organization" && (
        "country" in overrides || "startDate" in overrides || "visibility" in overrides
      );
      if (shouldWriteOrg) {
        const orgRecord: Record<string, unknown> = {
          $type: "app.certified.actor.organization",
          createdAt: account.createdAt ?? new Date().toISOString(),
          visibility: next.visibility === "Unlisted" ? "unlisted" : "public",
        };
        if (next.country.trim()) orgRecord.location = await createCountryLocationStrongRef(next.country, writeOptions);
        if (next.startDate.trim()) orgRecord.foundedDate = `${next.startDate.trim()}T00:00:00.000Z`;
        await putRecord("app.certified.actor.organization", "self", orgRecord, writeOptions);
      }

      setInlineField(null);
      setLogoFile(null);
      setCoverFile(null);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const openDashboardModal = (id: string, content: React.ReactNode) => {
    modal.pushModal({ id, content }, true);
    void modal.show();
  };

  const openLogoModal = () => openDashboardModal(
    "manage-logo-editor",
    <ImageEditorModal
      title={account.kind === "organization" ? "Edit logo" : "Edit photo"}
      description={account.kind === "organization" ? "Choose a square logo for this profile." : "Choose a square photo for this profile."}
      initialImage={account.avatarUrl ?? undefined}
      onImageChange={(image) => { if (image) void saveChanges({ logoFile: image }); }}
    />,
  );

  const openCoverModal = () => openDashboardModal(
    "manage-cover-editor",
    <ImageEditorModal
      title="Edit cover image"
      description="Choose a wide banner image for the top of your profile."
      initialImage={account.coverUrl ?? undefined}
      onImageChange={(image) => { if (image) void saveChanges({ coverFile: image }); }}
    />,
  );

  const openCountryModal = () => openDashboardModal(
    "manage-country-editor",
    <CountrySelectorModal initialCountryCode={editCountry} onCountryChange={(country) => void saveChanges({ country })} />,
  );

  const openWebsiteModal = () => openDashboardModal(
    "manage-website-editor",
    <WebsiteEditorModal currentUrl={editWebsite || null} onConfirm={(url) => void saveChanges({ website: url ?? "" })} />,
  );

  const openStartDateModal = () => openDashboardModal(
    "manage-start-date-editor",
    <StartDateSelectorModal currentDate={editStartDate || null} onConfirm={(date) => void saveChanges({ startDate: date ?? "" })} />,
  );

  const openVisibilityModal = () => openDashboardModal(
    "manage-visibility-editor",
    <VisibilitySelectorModal current={editVisibility} onConfirm={(visibility) => void saveChanges({ visibility })} />,
  );

  if (!isAccountManageRoute) {
    return <>{children}</>;
  }

  if (isOnboarding) {
    return (
      <Container className="pt-4 pb-8">
        <ManageAccountSetup did={account.did} mode={resolvedMode} />
      </Container>
    );
  }

  return (
    <>
      {account.kind === "user" ? <HeaderContent right={registerOrganizationHeaderAction} /> : null}
      <Container className="space-y-4 pt-4 pb-8">
        <EditableHero
          account={account}
          editState={editState}
          inlineField={inlineField}
          isSaving={isSaving}
          saveError={saveError}
          onChange={handleChange}
          onEditField={setInlineField}
          onSaveInline={() => void saveChanges()}
          onCancelInline={resetState}
          onEditLogo={openLogoModal}
          onEditCover={openCoverModal}
          onEditCountry={openCountryModal}
          onEditWebsite={openWebsiteModal}
          onEditStartDate={openStartDateModal}
          onEditVisibility={openVisibilityModal}
        />
        {children}
      </Container>
    </>
  );
}
