"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2Icon,
  CalendarIcon,
  GlobeIcon,
  ImageIcon,
  LockIcon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  PlusCircleIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AccountRouteData } from "@/app/account/_lib/account-route";
import { ManageNavGrid } from "./ManageNavGrid";
import { ManageAccountSetup } from "./ManageAccountSetup";
import { ManageAccountTabs } from "./ManageAccountTabs";
import type { ManageMode } from "./manageDashboardMode";
import { HeaderContent } from "@/app/_components/HeaderSlots";
import { RichText } from "@/app/_components/RichText";
import { countryFlag } from "@/app/_lib/format";
import { putRecord, uploadBlob } from "../_lib/mutations";
import Container from "@/components/ui/container";
import { useModal } from "@/components/ui/modal/context";
import {
  CountrySelectorModal,
  ImageEditorModal,
  StartDateSelectorModal,
  VisibilitySelectorModal,
  WebsiteEditorModal,
} from "../_modals/DashboardEditModals";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatWebsite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
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

// ── EditChip ──────────────────────────────────────────────────────────────────

function EditChip({
  onClick, className, children, isEditing, isEmpty = false,
}: {
  onClick?: () => void; className?: string; children: React.ReactNode; isEditing: boolean; isEmpty?: boolean;
}) {
  if (!isEditing) {
    if (isEmpty) return null;
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-foreground/60 bg-background/40 backdrop-blur-md border border-border/50 rounded-full px-2.5 py-1 font-medium", className)}>
        {children}
      </span>
    );
  }
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] rounded-full px-2.5 py-1 font-medium border cursor-pointer transition-colors",
        isEmpty
          ? "text-primary/70 bg-primary/5 border-primary/20 hover:bg-primary/10"
          : "text-foreground/60 bg-background/40 backdrop-blur-md border-border/50 hover:bg-background/60 hover:text-foreground/80",
        className,
      )}
    >
      {isEmpty && <PlusCircleIcon className="h-3 w-3 shrink-0" />}
      {!isEmpty && <PencilIcon className="h-3 w-3 shrink-0 opacity-60" />}
      {children}
    </motion.button>
  );
}

// ── EditableHero ──────────────────────────────────────────────────────────────

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

function EditableHero({
  account,
  isEditing,
  editState,
  onChange,
  onEditLogo,
  onEditCover,
  onEditCountry,
  onEditWebsite,
  onEditStartDate,
  onEditVisibility,
}: {
  account: AccountRouteData;
  isEditing: boolean;
  editState: HeroEditState;
  onChange: (field: keyof Omit<HeroEditState, "logoFile" | "coverFile">, value: string) => void;
  onEditLogo: () => void;
  onEditCover: () => void;
  onEditCountry: () => void;
  onEditWebsite: () => void;
  onEditStartDate: () => void;
  onEditVisibility: () => void;
}) {

  // Blob URLs for preview
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
  const hasPillRow = isEditing || sinceDate.state === "valid" || countryLabel !== null || resolvedWebsite !== null;

  return (
    <section className="relative min-h-[260px] md:min-h-[320px] flex flex-col overflow-hidden rounded-t-4xl border-t border-border">
      {/* Cover image */}
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

      {/* Bottom content */}
      <div className="relative z-10 flex-1 flex flex-col justify-end px-5 pb-6 pt-24">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-3">
          {/* Logo */}
          <div className="relative shrink-0">
            <div className="relative h-24 w-24 rounded-full overflow-hidden bg-muted border border-white/15 shadow-sm">
              {logoUrl ? (
                <Image src={logoUrl} alt={account.displayName} fill unoptimized className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">{initial}</div>
              )}
            </div>
            {isEditing && (
              <button
                type="button"
                onClick={onEditLogo}
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-background border border-border flex items-center justify-center shadow-sm hover:bg-muted/60 transition-colors cursor-pointer"
                aria-label="Change logo"
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Name + description */}
          <div className="max-w-3xl w-full min-w-0">
            {isEditing ? (
              <input
                type="text"
                value={editState.displayName}
                onChange={(e) => onChange("displayName", e.target.value)}
                placeholder="Organization name"
                className={cn(
                  "text-3xl sm:text-4xl md:text-5xl font-light tracking-[-0.02em] leading-none",
                  "font-instrument italic bg-transparent border-b-2 border-white/40 focus:border-primary/60 outline-none",
                  "text-foreground placeholder:text-foreground/40 w-full transition-colors",
                )}
              />
            ) : (
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-[-0.02em] leading-none text-foreground font-instrument italic">
                {account.displayName}
              </h1>
            )}
            {isEditing ? (
              <textarea
                value={editState.description}
                onChange={(e) => onChange("description", e.target.value)}
                placeholder="Short description…"
                rows={2}
                className={cn(
                  "mt-1 w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent border-b border-white/30 focus:border-primary/60 outline-none transition-colors field-sizing-content",
                  "text-muted-foreground placeholder:text-muted-foreground/60 leading-relaxed",
                )}
              />
            ) : (
              account.description && (
                <p className="text-muted-foreground line-clamp-4 md:line-clamp-2 mt-1">{account.description}</p>
              )
            )}
          </div>
        </div>

        {/* Pills row */}
        {hasPillRow && (
          <div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* Country */}
              {account.kind === "organization" && (
                <EditChip onClick={onEditCountry} isEditing={isEditing} isEmpty={!countryLabel}>
                  {flag && <span className="text-sm leading-none" aria-hidden="true">{flag}</span>}
                  {countryLabel ?? "Add country"}
                </EditChip>
              )}

              {/* Start date */}
              {account.kind === "organization" && (
                <EditChip
                  onClick={onEditStartDate}
                  isEditing={isEditing}
                  isEmpty={isEditing ? sinceDate.state === "empty" : sinceDate.state !== "valid"}
                >
                  <CalendarIcon className="h-3 w-3 shrink-0" />
                  {sinceDate.state === "valid" ? `Since ${sinceDate.label}` : isEditing && sinceDate.state === "invalid" ? "Invalid date" : "Add start date"}
                </EditChip>
              )}

              {/* Website */}
              <EditChip onClick={onEditWebsite} isEditing={isEditing} isEmpty={!resolvedWebsite}>
                <GlobeIcon className="h-3 w-3 shrink-0" />
                {resolvedWebsite ? formatWebsite(resolvedWebsite) : "Add website"}
              </EditChip>

              {/* Visibility (org only, edit mode or when unlisted) */}
              {account.kind === "organization" && (isEditing || editState.visibility === "Unlisted") && (
                <EditChip onClick={onEditVisibility} isEditing={isEditing} isEmpty={false}>
                  {editState.visibility === "Unlisted" ? <LockIcon className="h-3 w-3 shrink-0" /> : <MapPinIcon className="h-3 w-3 shrink-0" />}
                  {editState.visibility}
                </EditChip>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Top action row */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between p-4">
        <AnimatePresence>
          {isEditing && (
            <motion.button
              key="cover-btn"
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              onClick={onEditCover}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/55 backdrop-blur-xl border border-white/20 shadow-lg hover:bg-background/70 transition-colors cursor-pointer"
              aria-label="Change cover image"
            >
              <ImageIcon className="h-3.5 w-3.5 text-foreground/80 shrink-0" />
              <span className="text-xs font-medium text-foreground/80">Change cover</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Edit button in view mode */}
        {!isEditing && (
          <Link
            href="/manage?mode=edit"
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/55 backdrop-blur-xl border border-white/20 shadow-lg hover:bg-background/70 transition-colors text-xs font-medium text-foreground/80"
          >
            <PencilIcon className="h-3.5 w-3.5" />
            Edit profile
          </Link>
        )}
      </div>
    </section>
  );
}

// ── Header actions / EditBar ──────────────────────────────────────────────────

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

function EditBar({
  hasChanges,
  isSaving,
  saveError,
  onCancel,
}: { hasChanges: boolean; isSaving: boolean; saveError: string | null; onCancel: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex items-center justify-between gap-4 rounded-3xl bg-muted/80 px-4 py-2.5 mb-2"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
        {isSaving ? (
          <span className="text-primary text-sm font-medium flex items-center gap-1.5">
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />Saving…
          </span>
        ) : saveError ? (
          <span className="text-destructive text-xs truncate">{saveError}</span>
        ) : (
          <span>{hasChanges ? "You have unsaved changes." : "No changes yet."}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={isSaving}>
          <XIcon className="h-3.5 w-3.5" />Cancel
        </Button>
        <Button type="submit" form="manage-dashboard-save-form" disabled={isSaving || !hasChanges}>
          <SaveIcon className="h-3.5 w-3.5" />Save
        </Button>
      </div>
    </motion.div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export function ManageDashboardClient({
  account,
  mode,
}: {
  account: AccountRouteData;
  mode: ManageMode | null;
}) {
  const router = useRouter();
  const modal = useModal();

  // ── Edit state ─────────────────────────────────────────────────────────────
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isEditing = mode === "edit";
  const isOnboarding = mode === "onboard-user" || mode === "onboard-org" ||
    (!account.summary.hasCertifiedProfile && !account.summary.hasCertifiedOrg && !account.summary.hasGainforestOrg);

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

  const hasChanges =
    editDisplayName !== account.displayName ||
    editDescription !== (account.description ?? "") ||
    editWebsite !== (account.website ?? "") ||
    editCountry !== (account.country ?? "") ||
    editStartDate !== initialStartDate ||
    editVisibility !== initialVisibility ||
    logoFile !== null ||
    coverFile !== null;

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

  const handleCancel = () => {
    // Reset state
    setEditDisplayName(account.displayName);
    setEditDescription(account.description ?? "");
    setEditWebsite(account.website ?? "");
    setEditCountry(account.country ?? "");
    setEditStartDate(initialStartDate);
    setEditVisibility(initialVisibility);
    setLogoFile(null);
    setCoverFile(null);
    setSaveError(null);
    router.push("/manage");
  };

  const openDashboardModal = (id: string, content: React.ReactNode, dialogWidth = "max-w-sm") => {
    modal.pushModal({ id, content, dialogWidth }, true);
    void modal.show();
  };

  const openLogoModal = () => openDashboardModal(
    "manage-logo-editor",
    <ImageEditorModal
      title="Edit logo"
      description="Choose a square logo or avatar for this profile."
      currentUrl={account.avatarUrl}
      onConfirm={setLogoFile}
    />,
  );

  const openCoverModal = () => openDashboardModal(
    "manage-cover-editor",
    <ImageEditorModal
      title="Edit cover image"
      description="Choose a wide banner image for the top of your profile."
      currentUrl={account.coverUrl}
      onConfirm={setCoverFile}
    />,
    "max-w-2xl",
  );

  const openCountryModal = () => openDashboardModal(
    "manage-country-editor",
    <CountrySelectorModal currentCountry={editCountry} onConfirm={setEditCountry} />,
  );

  const openWebsiteModal = () => openDashboardModal(
    "manage-website-editor",
    <WebsiteEditorModal currentWebsite={editWebsite} onConfirm={setEditWebsite} />,
  );

  const openStartDateModal = () => openDashboardModal(
    "manage-start-date-editor",
    <StartDateSelectorModal currentDate={editStartDate} onConfirm={setEditStartDate} />,
  );

  const openVisibilityModal = () => openDashboardModal(
    "manage-visibility-editor",
    <VisibilitySelectorModal currentVisibility={editVisibility} onConfirm={setEditVisibility} />,
  );

  const handleSave = async () => {
    if (!hasChanges || isSaving) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      // Upload blobs if files selected
      let avatarBlob: { ref: unknown; mimeType: string; size: number } | null = null;
      let bannerBlob: { ref: unknown; mimeType: string; size: number } | null = null;
      if (logoFile) avatarBlob = await uploadBlob(logoFile);
      if (coverFile) bannerBlob = await uploadBlob(coverFile);

      // Build profile record
      const profileRecord: Record<string, unknown> = {
        $type: "app.bsky.actor.profile",
      };
      if (editDisplayName.trim()) profileRecord.displayName = editDisplayName.trim();
      if (editDescription.trim()) profileRecord.description = editDescription.trim();
      if (editWebsite.trim()) {
        const url = editWebsite.startsWith("http") ? editWebsite : `https://${editWebsite}`;
        profileRecord.website = url.trim();
      }
      if (avatarBlob) profileRecord.avatar = avatarBlob;
      if (bannerBlob) profileRecord.banner = bannerBlob;

      await putRecord("app.bsky.actor.profile", "self", profileRecord);

      // Update org record if applicable
      if (account.kind === "organization" && (editCountry !== (account.country ?? "") || editStartDate !== initialStartDate || editVisibility !== initialVisibility)) {
        const orgCollection = account.summary.hasGainforestOrg
          ? "app.gainforest.organization.info"
          : "app.certified.actor.organization";

        const orgRecord: Record<string, unknown> = {
          $type: orgCollection,
          visibility: editVisibility === "Unlisted" ? "unlisted" : "public",
        };
        if (editCountry.trim().length === 2) orgRecord.country = editCountry.trim().toUpperCase();
        if (editStartDate.trim()) orgRecord.foundedDate = `${editStartDate.trim()}T00:00:00.000Z`;

        await putRecord(orgCollection, "self", orgRecord);
      }

      // Navigate back to view mode and refresh data
      router.push("/manage");
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save. Please try again.");
      setIsSaving(false);
    }
  };

  // ── Onboarding ─────────────────────────────────────────────────────────────
  if (isOnboarding) {
    return (
      <Container className="pt-4 pb-8">
        <ManageAccountSetup did={account.did} mode={mode} />
      </Container>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <form
        id="manage-dashboard-save-form"
        onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
      >
        <HeaderContent
          {...(account.kind === "user" ? { right: registerOrganizationHeaderAction } : {})}
          sub={(
            <Container className="p-0 pt-1">
              <EditBar hasChanges={hasChanges} isSaving={isSaving} saveError={saveError} onCancel={handleCancel} />
            </Container>
          )}
        />
        <Container className="pt-4 pb-8 space-y-2">
          <EditableHero
            account={account}
            isEditing
            editState={editState}
            onChange={handleChange}
            onEditLogo={openLogoModal}
            onEditCover={openCoverModal}
            onEditCountry={openCountryModal}
            onEditWebsite={openWebsiteModal}
            onEditStartDate={openStartDateModal}
            onEditVisibility={openVisibilityModal}
          />
          <ManageAccountTabs account={account} />
          {/* About section */}
          {account.kind === "organization" && (
            <div className="py-4 space-y-2">
              <label className="text-sm font-medium text-foreground/70">About</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Tell your story — describe your organization's mission, work, and impact…"
                rows={6}
                className="resize-none text-sm"
              />
            </div>
          )}
        </Container>
      </form>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────────
  return (
    <>
      {account.kind === "user" ? <HeaderContent right={registerOrganizationHeaderAction} /> : null}
      <Container className="pt-4 pb-8 space-y-2">
      <EditableHero
        account={account}
        isEditing={false}
        editState={editState}
        onChange={handleChange}
        onEditLogo={openLogoModal}
        onEditCover={openCoverModal}
        onEditCountry={openCountryModal}
        onEditWebsite={openWebsiteModal}
        onEditStartDate={openStartDateModal}
        onEditVisibility={openVisibilityModal}
      />
      <ManageAccountTabs account={account} />
      {account.detail?.richBody?.length ? (
        <section className="py-6 md:py-8">
          <RichText blocks={account.detail.richBody} />
        </section>
      ) : account.description ? (
        <section className="py-6 md:py-8">
          <p className="max-w-3xl text-[14px] leading-[1.62] text-foreground/80">{account.description}</p>
        </section>
      ) : null}
        <ManageNavGrid accountKind={account.kind} />
      </Container>
    </>
  );
}
