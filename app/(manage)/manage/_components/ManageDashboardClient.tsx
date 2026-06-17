"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Building2Icon,
  CalendarIcon,
  CheckIcon,
  EyeIcon,
  GlobeIcon,
  ImagePlusIcon,
  Link2Icon,
  Loader2Icon,
  LockIcon,
  MapPinIcon,
  PencilIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
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
import { canEditGroupProfile } from "../_lib/cgs-permissions";
import Container from "@/components/ui/container";
import { useModal } from "@/components/ui/modal/context";
import {
  OrgTypeEditorModal,
  SocialLinksEditorModal,
  StartDateSelectorModal,
  VisibilitySelectorModal,
  WebsiteEditorModal,
} from "../_modals/DashboardEditModals";
import CountrySelectorModal from "@/components/modals/country-selector";
import { ImageEditorModal } from "@/components/modals/image-editor";
import { SocialGlyph } from "@/app/_components/SocialIcon";
import { GroupMembers } from "../groups/_components/GroupMembers";
import { ManageGroupsClient } from "../groups/_components/ManageGroupsClient";
import { useAccountList } from "@/app/_lib/account-switcher";
import type { CgsMember, CgsRole } from "../_lib/cgs";

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
  longDescription: string;
  website: string;
  country: string;
  startDate: string;
  visibility: "Public" | "Unlisted";
  orgType: string;
  socials: string[];
  logoFile: File | null;
  coverFile: File | null;
};

type InlineField = "profile" | "about" | null;

const SECTION_EASE = [0.25, 0.1, 0.25, 1] as const;

/** Classify a URL into a social-icon platform key (mirrors the indexer). */
function classifySocial(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "link";
  }
  if (host.includes("facebook.") || host === "fb.com") return "facebook";
  if (host.includes("instagram.")) return "instagram";
  if (host.includes("youtube.") || host === "youtu.be") return "youtube";
  if (host.includes("linkedin.")) return "linkedin";
  if (host === "x.com" || host.includes("twitter.")) return "x";
  if (host === "t.me" || host.includes("telegram.")) return "telegram";
  if (host.includes("tiktok.")) return "tiktok";
  if (host.includes("github.")) return "github";
  if (host.includes("bsky.") || host.includes("bluesky.")) return "bluesky";
  return "website";
}

function AboutSection({
  value,
  draft,
  isEditing,
  isSaving,
  saveError,
  onEdit,
  onChange,
  onSave,
  onCancel,
  editDisabledReason = null,
}: {
  value: string;
  draft: string;
  isEditing: boolean;
  isSaving: boolean;
  saveError: string | null;
  onEdit: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  editDisabledReason?: string | null;
}) {
  const t = useTranslations("upload.dashboardClient");
  const text = value.trim();
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: SECTION_EASE }}
    >
      <div className="flex items-center gap-2">
        <h2 className="font-instrument text-2xl italic leading-none text-foreground">{t("about.title")}</h2>
        {isEditing || editDisabledReason ? null : (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full p-1 text-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t("about.editAria")}
          >
            <PencilIcon className="size-4" />
          </button>
        )}
      </div>
      {isEditing ? (
        <div className="mt-3 max-w-2xl space-y-2">
          <textarea
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("about.placeholder")}
            rows={6}
            className="w-full resize-none rounded-xl border border-border/50 bg-transparent p-3 text-sm leading-relaxed text-foreground outline-none transition-colors field-sizing-content placeholder:text-muted-foreground/60 focus:border-primary/60"
            autoFocus
          />
          <InlineEditActions isSaving={isSaving} onSave={onSave} onCancel={onCancel} />
          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
        </div>
      ) : (
        <>
          <p className={cn("mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed", text ? "text-muted-foreground" : "text-muted-foreground/60")}>
            {text || t("about.empty")}
          </p>
          {editDisabledReason ? <p className="mt-2 text-xs text-muted-foreground">{editDisabledReason}</p> : null}
        </>
      )}
    </motion.section>
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
  const t = useTranslations("upload.dashboardClient");
  return (
    <span className="mt-2 flex items-center gap-1.5">
      <Button type="button" size="sm" onClick={onSave} disabled={isSaving}>
        {isSaving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        {t("actions.save")}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSaving}>
        <XIcon /> {t("actions.cancel")}
      </Button>
    </span>
  );
}

function EditableHero({
  account,
  basePath,
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
  onEditOrgType,
  onEditSocials,
  editDisabledReason = null,
}: {
  account: AccountRouteData;
  basePath: string;
  editState: HeroEditState;
  inlineField: InlineField;
  isSaving: boolean;
  saveError: string | null;
  onChange: (field: keyof Omit<HeroEditState, "logoFile" | "coverFile" | "socials">, value: string) => void;
  onEditField: (field: InlineField) => void;
  onSaveInline: () => void;
  onCancelInline: () => void;
  onEditLogo: () => void;
  onEditCover: () => void;
  onEditCountry: () => void;
  onEditWebsite: () => void;
  onEditStartDate: () => void;
  onEditVisibility: () => void;
  onEditOrgType: () => void;
  onEditSocials: () => void;
  editDisabledReason?: string | null;
}) {
  const t = useTranslations("upload.dashboardClient");
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

  const editing = inlineField === "profile";
  const canEdit = !editDisabledReason;

  const isOrg = account.kind === "organization";
  const resolvedWebsite = editState.website || account.website;
  const resolvedCountry = editState.country || account.country;
  const countryLabel = resolvedCountry ? countryName(resolvedCountry) : null;
  const flag = resolvedCountry ? countryFlag(resolvedCountry) : "";
  const sinceDate = formatSinceDate(editState.startDate);

  return (
    <section className="overflow-hidden rounded-3xl border border-border/60 bg-card">
      {/* Cover band — click anywhere to change; icon reveals on hover/focus */}
      <div className="relative h-32 sm:h-40 md:h-44">
        <button
          type="button"
          onClick={canEdit ? onEditCover : undefined}
          disabled={!canEdit}
          title={editDisabledReason ?? undefined}
          className="group/cover absolute inset-0 block w-full overflow-hidden disabled:cursor-not-allowed"
          aria-label={coverImageUrl ? t("hero.changeCoverImage") : t("hero.addCoverImage")}
        >
          {coverImageUrl ? (
            <Image src={coverImageUrl} alt={`${account.displayName} cover image`} fill priority unoptimized className="object-cover object-center" sizes="(max-width: 1152px) 100vw, 1152px" />
          ) : (
            <div className="absolute inset-0 bg-muted" style={{ backgroundImage: "radial-gradient(circle at 22% 40%, oklch(0.5 0.07 157 / 0.14) 0%, transparent 55%), radial-gradient(circle at 82% 18%, oklch(0.5 0.07 157 / 0.08) 0%, transparent 50%)" }} />
          )}
          {/* gentle fade into the card at the bottom */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-linear-to-t from-card to-transparent" />
          {/* hover/focus affordance */}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center gap-1.5 transition-all duration-300",
              coverImageUrl
                ? "bg-black/0 opacity-0 backdrop-blur-0 group-hover/cover:bg-black/30 group-hover/cover:opacity-100 group-hover/cover:backdrop-blur-[2px] group-focus-visible/cover:bg-black/30 group-focus-visible/cover:opacity-100 group-focus-visible/cover:backdrop-blur-[2px]"
                : "opacity-100",
            )}
          >
            <ImagePlusIcon className={cn("size-5", coverImageUrl ? "text-white drop-shadow" : "text-muted-foreground")} />
            {!coverImageUrl ? <span className="text-xs font-medium text-muted-foreground">{t("hero.addCoverImage")}</span> : null}
          </div>
        </button>

        {/* Settings shortcut */}
        <Link
          href={`${basePath}/settings`}
          className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full border border-border/50 bg-background/65 text-foreground/70 shadow-sm backdrop-blur-xl transition-colors hover:bg-background/90 hover:text-foreground"
          aria-label={t("hero.settings")}
          title={t("hero.settings")}
        >
          <SettingsIcon className="size-4" />
        </Link>
      </div>

      {/* Identity */}
      <div className="relative z-10 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-12 flex flex-col gap-4 md:flex-row md:items-end md:gap-5">
        <button
          type="button"
          onClick={canEdit ? onEditLogo : undefined}
          disabled={!canEdit}
          title={editDisabledReason ?? undefined}
          className="group/avatar relative block size-24 shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted ring-4 ring-card disabled:cursor-not-allowed"
          aria-label={logoUrl ? (account.kind === "organization" ? t("hero.changeLogo") : t("hero.changePhoto")) : (account.kind === "organization" ? t("hero.addLogo") : t("hero.addPhoto"))}
        >
          {logoUrl ? (
            <Image src={logoUrl} alt={account.displayName} fill unoptimized className="object-cover" />
          ) : null}
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-all duration-300",
              logoUrl
                ? "bg-black/0 opacity-0 backdrop-blur-0 group-hover/avatar:bg-black/35 group-hover/avatar:opacity-100 group-hover/avatar:backdrop-blur-[2px] group-focus-visible/avatar:bg-black/35 group-focus-visible/avatar:opacity-100 group-focus-visible/avatar:backdrop-blur-[2px]"
                : "opacity-100",
            )}
          >
            <ImagePlusIcon className={cn("size-6", logoUrl ? "text-white drop-shadow" : "text-muted-foreground")} />
          </span>
        </button>

        <div className="min-w-0 max-w-2xl md:flex-1 md:pb-1">
          {editing ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editState.displayName}
                onChange={(e) => onChange("displayName", e.target.value)}
                placeholder={account.kind === "organization" ? t("hero.organizationName") : t("hero.displayName")}
                className="w-full border-b-2 border-border/50 bg-transparent font-instrument text-3xl font-light italic leading-[1.1] tracking-[-0.02em] text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-primary/60 md:text-4xl"
                autoFocus
              />
              <textarea
                value={editState.description}
                onChange={(e) => onChange("description", e.target.value)}
                placeholder={t("hero.shortBioPlaceholder")}
                rows={3}
                className="w-full resize-none border-b border-border/40 bg-transparent text-sm leading-relaxed text-muted-foreground outline-none transition-colors field-sizing-content placeholder:text-muted-foreground/60 focus:border-primary/60"
              />
              <InlineEditActions isSaving={isSaving} onSave={onSaveInline} onCancel={onCancelInline} />
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <h1 className="font-instrument text-3xl font-light italic leading-[1.1] tracking-[-0.02em] text-foreground md:text-4xl">
                  {editState.displayName || account.displayName}
                </h1>
                {canEdit ? (
                  <button type="button" onClick={() => onEditField("profile")} className="mt-1 rounded-full p-1 text-foreground/40 transition-colors hover:bg-muted hover:text-foreground" aria-label={t("hero.editProfileAria")}>
                    <PencilIcon className="size-4" />
                  </button>
                ) : null}
              </div>
              <p className={cn("mt-1.5 line-clamp-2 text-sm leading-relaxed", editState.description ? "text-muted-foreground" : "text-muted-foreground/60")}>
                {editState.description || t("hero.noBio")}
              </p>
              {editDisabledReason ? <p className="mt-2 text-xs text-muted-foreground">{editDisabledReason}</p> : null}
            </>
          )}
          {saveError ? <p className="mt-2 text-sm text-destructive">{saveError}</p> : null}
        </div>
        </div>

        {/* Detail buttons */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {isOrg ? (
            <Button variant="outline" onClick={onEditOrgType} disabled={!canEdit} title={editDisabledReason ?? undefined} className={cn(!editState.orgType.trim() && "text-muted-foreground")}>
              <Building2Icon /> {editState.orgType.trim() || t("hero.addType")}
            </Button>
          ) : null}
          {isOrg ? (
            <Button variant="outline" onClick={onEditCountry} disabled={!canEdit} title={editDisabledReason ?? undefined} className={cn(!countryLabel && "text-muted-foreground")}>
              {flag ? <span className="text-base leading-none" aria-hidden="true">{flag}</span> : <MapPinIcon />}
              {countryLabel ?? t("hero.addCountry")}
            </Button>
          ) : null}
          {isOrg ? (
            <Button variant="outline" onClick={onEditStartDate} disabled={!canEdit} title={editDisabledReason ?? undefined} className={cn(sinceDate.state === "empty" && "text-muted-foreground")}>
              <CalendarIcon />
              {sinceDate.state === "valid" ? t("hero.sinceDate", { date: sinceDate.label ?? "" }) : sinceDate.state === "invalid" ? t("hero.invalidDate") : t("hero.addStartDate")}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onEditWebsite} disabled={!canEdit} title={editDisabledReason ?? undefined} className={cn(!resolvedWebsite && "text-muted-foreground")}>
            <GlobeIcon /> {resolvedWebsite ? formatWebsite(resolvedWebsite) : t("hero.addWebsite")}
          </Button>
          {isOrg ? (
            <Button variant="outline" onClick={onEditVisibility} disabled={!canEdit} title={editDisabledReason ?? undefined}>
              {editState.visibility === "Unlisted" ? <LockIcon /> : <EyeIcon />} {editState.visibility}
            </Button>
          ) : null}
          {isOrg ? (
            <Button variant="outline" onClick={onEditSocials} disabled={!canEdit} title={editDisabledReason ?? undefined} className={cn(!editState.socials.length && "text-muted-foreground")}>
              {editState.socials.length ? (
                editState.socials.map((url) => <SocialGlyph key={url} platform={classifySocial(url)} />)
              ) : (
                <>
                  <Link2Icon /> {t("hero.addSocialLinks")}
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CreateOrganizationButton() {
  const t = useTranslations("upload.dashboardClient");
  return (
    <Button asChild variant="secondary">
      <Link href="/manage?mode=onboard-org">
        <Building2Icon />
        {t("actions.createOrganization")}
      </Link>
    </Button>
  );
}

function CreateOrganizationHeaderSlot({ did }: { did: string }) {
  const { groups, status } = useAccountList(did);
  const showCreateOrganization = status === "ready" && groups.length === 0;

  return <HeaderContent right={showCreateOrganization ? <CreateOrganizationButton /> : null} />;
}

export function ManageDashboardClient({
  account,
  mode,
  basePath = "/manage",
  writeRepoDid,
  groupRole,
  currentUserDid,
  initialGroupMembers,
  initialGroupMembersError,
  children,
}: {
  account: AccountRouteData;
  mode?: ManageMode | null;
  basePath?: string;
  writeRepoDid?: string;
  /** When scoped into an organization, the current user's role — enables the members list. */
  groupRole?: CgsRole;
  currentUserDid?: string | null;
  initialGroupMembers?: CgsMember[];
  initialGroupMembersError?: string | null;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/manage";
  const canonicalPathname = stripLocaleFromPathname(pathname);
  const searchParams = useSearchParams();
  const modal = useModal();
  const t = useTranslations("upload.dashboardClient");
  const rawMode = mode === undefined ? searchParams.get("mode") ?? undefined : mode ?? undefined;
  const parsedMode = mode === undefined ? parseManageMode(rawMode) : mode;
  const hasCompletedSetup = account.summary.hasCertifiedProfile || account.summary.hasCertifiedOrg;
  const resolvedMode = hasCompletedSetup
    ? resolveDashboardMode({ currentKind: account.kind, mode: parsedMode })
    : parsedMode ?? "onboard-user";
  const isAccountManageRoute = canonicalPathname === basePath || decodePath(canonicalPathname) === decodePath(basePath);

  useEffect(() => {
    if (!isAccountManageRoute || mode !== undefined) return;
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (!hasCompletedSetup) {
      if (rawMode === "onboard-user") return;
      nextSearchParams.set("mode", "onboard-user");
      router.replace(`${pathname}?${nextSearchParams.toString()}`);
      return;
    }

    if (!shouldClearDashboardMode({ currentKind: account.kind, rawMode })) return;
    nextSearchParams.delete("mode");
    const query = nextSearchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [account.kind, hasCompletedSetup, isAccountManageRoute, mode, pathname, rawMode, router, searchParams]);

  const [editDisplayName, setEditDisplayName] = useState(account.displayName);
  const [editDescription, setEditDescription] = useState(account.description ?? "");
  const [editLongDescription, setEditLongDescription] = useState(account.longDescription ?? "");
  const [editWebsite, setEditWebsite] = useState(account.website ?? "");
  const [editCountry, setEditCountry] = useState(account.country ?? "");
  const initialStartDate = account.foundedDate ? new Date(account.foundedDate).toISOString().slice(0, 10) : "";
  const initialVisibility = account.visibility ?? "Public";
  const [editStartDate, setEditStartDate] = useState(initialStartDate);
  const [editVisibility, setEditVisibility] = useState<"Public" | "Unlisted">(initialVisibility);
  const [editOrgType, setEditOrgType] = useState(account.orgType ?? "");
  const [editSocials, setEditSocials] = useState<string[]>(account.socialLinks ?? []);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [inlineField, setInlineField] = useState<InlineField>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isOnboarding = resolvedMode === "onboard-user" || resolvedMode === "onboard-org" || !hasCompletedSetup;
  const profileEditPermission = writeRepoDid
    ? canEditGroupProfile({ kind: "group", role: groupRole })
    : { allowed: true, reason: null };

  const editState: HeroEditState = {
    displayName: editDisplayName,
    description: editDescription,
    longDescription: editLongDescription,
    website: editWebsite,
    country: editCountry,
    startDate: editStartDate,
    visibility: editVisibility,
    orgType: editOrgType,
    socials: editSocials,
    logoFile,
    coverFile,
  };

  const applyState = (next: HeroEditState) => {
    setEditDisplayName(next.displayName);
    setEditDescription(next.description);
    setEditLongDescription(next.longDescription);
    setEditWebsite(next.website);
    setEditCountry(next.country);
    setEditStartDate(next.startDate);
    setEditVisibility(next.visibility);
    setEditOrgType(next.orgType);
    setEditSocials(next.socials);
    setLogoFile(next.logoFile);
    setCoverFile(next.coverFile);
  };

  const resetState = () => {
    applyState({
      displayName: account.displayName,
      description: account.description ?? "",
      longDescription: account.longDescription ?? "",
      website: account.website ?? "",
      country: account.country ?? "",
      startDate: initialStartDate,
      visibility: initialVisibility,
      orgType: account.orgType ?? "",
      socials: account.socialLinks ?? [],
      logoFile: null,
      coverFile: null,
    });
    setInlineField(null);
    setSaveError(null);
  };

  const handleChange = (field: keyof Omit<HeroEditState, "logoFile" | "coverFile" | "socials">, value: string) => {
    switch (field) {
      case "displayName": setEditDisplayName(value); break;
      case "description": setEditDescription(value); break;
      case "longDescription": setEditLongDescription(value); break;
      case "website": setEditWebsite(value); break;
      case "country": setEditCountry(value); break;
      case "startDate": setEditStartDate(value); break;
      case "visibility": setEditVisibility(value as "Public" | "Unlisted"); break;
      case "orgType": setEditOrgType(value); break;
    }
  };

  const saveChanges = async (overrides: Partial<HeroEditState> = {}) => {
    if (isSaving) return;
    if (!profileEditPermission.allowed) {
      setSaveError(profileEditPermission.reason);
      return;
    }
    const next: HeroEditState = { ...editState, ...overrides };
    if (!next.displayName.trim()) {
      setSaveError(t("errors.nameRequired"));
      return;
    }
    if (!isValidWebsite(next.website)) {
      setSaveError(t("errors.invalidWebsite"));
      return;
    }
    if (account.kind === "organization" && next.country.trim() && !normalizeCountryCode(next.country)) {
      setSaveError(t("errors.invalidCountry"));
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
        "country" in overrides || "startDate" in overrides || "visibility" in overrides ||
        "orgType" in overrides || "socials" in overrides || "longDescription" in overrides
      );
      if (shouldWriteOrg) {
        const repo = writeRepoDid ?? account.did;
        // Read-merge: preserve fields we don't touch (longDescription, etc.).
        const existingOrg = await fetchExistingSelfRecord(repo, "app.certified.actor.organization");
        const orgRecord: Record<string, unknown> = {
          ...existingOrg,
          $type: "app.certified.actor.organization",
          createdAt: typeof existingOrg.createdAt === "string" ? existingOrg.createdAt : account.createdAt ?? new Date().toISOString(),
          visibility: next.visibility === "Unlisted" ? "unlisted" : "public",
        };
        if ("country" in overrides) {
          if (next.country.trim()) orgRecord.location = await createCountryLocationStrongRef(next.country, writeOptions);
          else delete orgRecord.location;
        }
        if ("startDate" in overrides) {
          if (next.startDate.trim()) orgRecord.foundedDate = `${next.startDate.trim()}T00:00:00.000Z`;
          else delete orgRecord.foundedDate;
        }
        if ("orgType" in overrides) {
          if (next.orgType.trim()) orgRecord.organizationType = [next.orgType.trim()];
          else delete orgRecord.organizationType;
        }
        if ("socials" in overrides) {
          if (next.socials.length) orgRecord.urls = next.socials.map((url) => ({ url }));
          else delete orgRecord.urls;
        }
        if ("longDescription" in overrides) {
          if (next.longDescription.trim()) {
            orgRecord.longDescription = {
              $type: "org.hypercerts.defs#descriptionString",
              value: next.longDescription.trim(),
            };
          } else {
            delete orgRecord.longDescription;
          }
        }
        await putRecord("app.certified.actor.organization", "self", orgRecord, writeOptions);
      }

      setInlineField(null);
      setLogoFile(null);
      setCoverFile(null);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("errors.saveFailed"));
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
      title={account.kind === "organization" ? t("modals.editLogo") : t("modals.editPhoto")}
      description={account.kind === "organization" ? t("modals.logoDescription") : t("modals.photoDescription")}
      initialImage={account.avatarUrl ?? undefined}
      onImageChange={(image) => { if (image) void saveChanges({ logoFile: image }); }}
    />,
  );

  const openCoverModal = () => openDashboardModal(
    "manage-cover-editor",
    <ImageEditorModal
      title={t("modals.editCoverImage")}
      description={t("modals.coverDescription")}
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

  const openOrgTypeModal = () => openDashboardModal(
    "manage-org-type-editor",
    <OrgTypeEditorModal current={editOrgType || null} onConfirm={(orgType) => void saveChanges({ orgType: orgType ?? "" })} />,
  );

  const openSocialsModal = () => openDashboardModal(
    "manage-socials-editor",
    <SocialLinksEditorModal current={editSocials} onConfirm={(socials) => void saveChanges({ socials })} />,
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
      {account.kind === "user" ? <CreateOrganizationHeaderSlot did={account.did} /> : null}
      <Container className="space-y-6 pt-4 pb-12">
        <EditableHero
          account={account}
          basePath={basePath}
          editState={editState}
          inlineField={inlineField}
          isSaving={isSaving}
          saveError={inlineField === "about" ? null : saveError}
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
          onEditOrgType={openOrgTypeModal}
          onEditSocials={openSocialsModal}
          editDisabledReason={profileEditPermission.reason}
        />
        {account.kind === "organization" ? (
          <>
            <AboutSection
              value={account.longDescription ?? ""}
              draft={editLongDescription}
              isEditing={inlineField === "about"}
              isSaving={isSaving}
              saveError={inlineField === "about" ? saveError : null}
              onEdit={() => { setEditLongDescription(account.longDescription ?? ""); setSaveError(null); setInlineField("about"); }}
              onChange={setEditLongDescription}
              onSave={() => void saveChanges({ longDescription: editLongDescription })}
              onCancel={() => { setEditLongDescription(account.longDescription ?? ""); setSaveError(null); setInlineField(null); }}
              editDisabledReason={profileEditPermission.reason}
            />
            {writeRepoDid && groupRole ? (
              <GroupMembers
                groupDid={writeRepoDid}
                currentRole={groupRole}
                currentUserDid={currentUserDid}
                variant="section"
                initialMembers={initialGroupMembers}
                initialError={initialGroupMembersError}
              />
            ) : null}
          </>
        ) : null}
        {account.kind === "user" ? <ManageGroupsClient sessionDid={account.did} /> : null}
        {children}
      </Container>
    </>
  );
}
