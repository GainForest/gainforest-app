"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import type { AccountRouteData } from "@/app/account/_lib/account-route";
import type { AccountOrganization } from "@/app/account/_components/AccountOrganizationsGrid";
import { AccountAwards } from "@/app/account/_components/AccountAwards";
import { AccountMemberships } from "@/app/account/_components/AccountMemberships";
import { AccountWalletSupport } from "@/app/account/_components/AccountWalletSupport";
import { ExpandableBio } from "@/app/account/_components/ExpandableBio";
import { countryFlag } from "@/app/_lib/format";
import { countryCodeFromLocationLabel, getCountry } from "@/app/_lib/countries";
import { resolvePdsHost } from "@/app/_lib/pds";
import { putRecord, uploadBlob } from "../_lib/mutations";
import {
  displayLocationFromChoice,
  saveOrganizationLocation,
  type OrgLocationChoice,
} from "../_lib/org-location";
import { canEditGroupProfile } from "../_lib/cgs-permissions";
import { useModal } from "@/components/ui/modal/context";
import {
  OrgTypeEditorModal,
  SocialLinksEditorModal,
  StartDateSelectorModal,
  VisibilitySelectorModal,
  WebsiteEditorModal,
} from "../_modals/DashboardEditModals";
import { LocationEditorModal, LocationEditorModalId } from "../_modals/LocationEditorModal";
import { ImageEditorModal } from "@/components/modals/image-editor";
import { SocialGlyph } from "@/app/_components/SocialIcon";
import { FollowStats } from "@/app/_components/FollowButton";
import type { CgsRole } from "../_lib/cgs";

const SECTION_EASE = [0.25, 0.1, 0.25, 1] as const;

function formatWebsite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function externalHref(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
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

/** The hero's view of the org's declared location. */
export type HeroLocationState = {
  /** Display label — the referenced location record's name. */
  name: string | null;
  /** ISO-2 code when the location is a picked country (drives the flag). */
  country: string;
  /** Saved coordinates, so the editor can open on the spot. For an
   *  approximate location: the published circle's center. */
  latitude?: number | null;
  longitude?: number | null;
  approximate?: boolean;
  /** A freshly picked location, consumed by the save; absent otherwise. */
  pendingChoice?: OrgLocationChoice | null;
};

export type HeroEditState = {
  displayName: string;
  description: string;
  longDescription: string;
  website: string;
  location: HeroLocationState;
  startDate: string;
  visibility: "Public" | "Unlisted";
  orgType: string;
  socials: string[];
  logoFile: File | null;
  coverFile: File | null;
};

type InlineField = "profile" | "about" | null;
type OptimisticField = keyof HeroEditState;

type PendingOptimisticSave = {
  state: HeroEditState;
  fields: OptimisticField[];
  previousAvatarUrl: string | null;
  previousCoverUrl: string | null;
};

function startDateInputValue(value: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function visibilityInputValue(value: AccountRouteData["visibility"]): "Public" | "Unlisted" {
  return value ?? "Public";
}

function heroStateFromAccount(account: AccountRouteData): HeroEditState {
  return {
    displayName: account.displayName,
    description: account.description ?? "",
    longDescription: account.longDescription ?? "",
    website: account.website ?? "",
    location: {
      name: account.locationName,
      country: account.country ?? "",
      latitude: account.locationLatitude,
      longitude: account.locationLongitude,
      approximate: account.locationApproximate,
    },
    startDate: startDateInputValue(account.foundedDate),
    visibility: visibilityInputValue(account.visibility),
    orgType: account.orgType ?? "",
    socials: account.socialLinks ?? [],
    logoFile: null,
    coverFile: null,
  };
}

function canonicalText(value: string): string {
  return value.trim();
}

function canonicalUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed ? (trimmed.startsWith("http") ? trimmed : `https://${trimmed}`) : "";
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function accountCaughtUpWithOptimisticSave(account: AccountRouteData, pending: PendingOptimisticSave): boolean {
  const current = heroStateFromAccount(account);

  return pending.fields.every((field) => {
    switch (field) {
      case "displayName":
      case "description":
      case "longDescription":
      case "orgType":
        return canonicalText(current[field]) === canonicalText(pending.state[field]);
      case "website":
        return canonicalUrl(current.website) === canonicalUrl(pending.state.website);
      case "location":
        // Wait until both the record name and the derived country the account
        // reads back match what the save published (both empty after a clear).
        return (
          canonicalText(current.location.name ?? "") === canonicalText(pending.state.location.name ?? "") &&
          current.location.country.toUpperCase() === pending.state.location.country.toUpperCase()
        );
      case "startDate":
      case "visibility":
        return current[field] === pending.state[field];
      case "socials":
        return sameStringList(current.socials, pending.state.socials);
      case "logoFile":
        return !pending.state.logoFile || (Boolean(account.avatarUrl) && account.avatarUrl !== pending.previousAvatarUrl);
      case "coverFile":
        return !pending.state.coverFile || (Boolean(account.coverUrl) && account.coverUrl !== pending.previousCoverUrl);
    }
  });
}

function optimisticFieldsForSave(overrides: Partial<HeroEditState>): OptimisticField[] {
  const fields = Object.keys(overrides) as OptimisticField[];
  return fields.length ? fields : ["displayName", "description", "website", "logoFile"];
}

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
          <p className={cn("mt-3 max-w-3xl whitespace-pre-line text-base leading-7 md:text-lg md:leading-8", text ? "text-foreground/85" : "text-muted-foreground/60")}>
            {text || t("about.empty")}
          </p>
          {editDisabledReason ? <p className="mt-2 text-xs text-muted-foreground">{editDisabledReason}</p> : null}
        </>
      )}
    </motion.section>
  );
}

function EditableHero({
  account,
  settingsHref,
  viewPublicHref,
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
  onEditLocation,
  onEditWebsite,
  onEditStartDate,
  onEditVisibility,
  onEditOrgType,
  onEditSocials,
  editDisabledReason = null,
  memberships,
}: {
  account: AccountRouteData;
  settingsHref: string;
  viewPublicHref: string | null;
  memberships: AccountOrganization[];
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
  onEditLocation: () => void;
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
  const canEditCover = false;

  const isOrg = account.kind === "organization";
  const resolvedWebsite = editState.website;
  // The location chip prefers the derived country (flag + localized name);
  // otherwise it falls back to the referenced location record's own name.
  const countryLabel = editState.location.country ? countryName(editState.location.country) : null;
  const locationLabel = countryLabel ?? editState.location.name;
  // A place name like "Zurich, Switzerland" earns its country's flag too.
  const flag = editState.location.country
    ? countryFlag(editState.location.country)
    : getCountry(countryCodeFromLocationLabel(editState.location.name))?.emoji ?? "";
  const sinceDate = formatSinceDate(editState.startDate);

  return (
    <section className="overflow-hidden rounded-3xl border border-border/60 bg-card">
      {/* Cover band — click anywhere to change; icon reveals on hover/focus */}
      <div className="relative h-32 sm:h-40 md:h-44">
        <button
          type="button"
          onClick={canEditCover ? onEditCover : undefined}
          disabled={!canEditCover}
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
          {canEditCover ? (
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
          ) : null}
        </button>

        <div className="absolute end-3 top-3 z-10 flex items-center gap-2">
          {viewPublicHref ? (
            <Button asChild variant="outline" size="sm" aria-label={t("hero.viewPublicPage")} title={t("hero.viewPublicPage")}>
              <Link href={viewPublicHref}>
                <EyeIcon />
                <span className="hidden sm:inline">{t("hero.viewPublicPage")}</span>
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="icon" aria-label={t("hero.settings")} title={t("hero.settings")}>
            <Link href={settingsHref}>
              <SettingsIcon />
            </Link>
          </Button>
        </div>
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
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => onEditField("profile")} aria-label={t("hero.editProfileAria")}>
                    <PencilIcon />
                  </Button>
                ) : null}
              </div>
              <ExpandableBio
                text={editState.description}
                placeholder={t("hero.noBio")}
                emptyClassName="text-muted-foreground/60"
                className="mt-1.5"
              />
              <FollowStats targetDid={account.did} identifier={account.urlIdentifier} className="mt-2.5" />
              <AccountAwards did={account.did} className="mt-3 w-fit" />
              <AccountMemberships organizations={memberships} className="mt-3" />
              {editDisabledReason ? <p className="mt-2 text-xs text-muted-foreground">{editDisabledReason}</p> : null}
            </>
          )}
          {saveError ? <p className="mt-2 text-sm text-destructive">{saveError}</p> : null}
        </div>
        </div>

        {/* Editable facts — quiet, text-like chips that open their editors.
            Mirrors the public hero, where facts read as metadata; the hover
            pencil (and dashed outline when empty) marks them as editable. */}
        <div className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-1.5">
          {isOrg ? (
            <FactChip onClick={onEditOrgType} disabled={!canEdit} title={editDisabledReason ?? undefined} empty={!editState.orgType.trim()}>
              <Building2Icon className="size-3.5 opacity-70" aria-hidden />
              {editState.orgType.trim() || t("hero.addType")}
            </FactChip>
          ) : null}
          {isOrg ? (
            <FactChip onClick={onEditLocation} disabled={!canEdit} title={editDisabledReason ?? undefined} empty={!locationLabel}>
              {flag ? <span className="text-sm leading-none" aria-hidden="true">{flag}</span> : <MapPinIcon className="size-3.5 opacity-70" aria-hidden />}
              {locationLabel ?? t("hero.addLocation")}
            </FactChip>
          ) : null}
          {isOrg ? (
            <FactChip onClick={onEditStartDate} disabled={!canEdit} title={editDisabledReason ?? undefined} empty={sinceDate.state === "empty"}>
              <CalendarIcon className="size-3.5 opacity-70" aria-hidden />
              {sinceDate.state === "valid" ? t("hero.sinceDate", { date: sinceDate.label ?? "" }) : sinceDate.state === "invalid" ? t("hero.invalidDate") : t("hero.addStartDate")}
            </FactChip>
          ) : null}
          <FactChip
            onClick={onEditWebsite}
            disabled={!canEdit}
            title={resolvedWebsite ? formatWebsite(resolvedWebsite) : editDisabledReason ?? undefined}
            empty={!resolvedWebsite}
          >
            <GlobeIcon className="size-3.5 opacity-70" aria-hidden />
            {resolvedWebsite ? formatWebsite(resolvedWebsite) : t("hero.addWebsite")}
          </FactChip>
          {isOrg ? (
            <FactChip onClick={onEditVisibility} disabled={!canEdit} title={editDisabledReason ?? undefined}>
              {editState.visibility === "Unlisted" ? <LockIcon className="size-3.5 opacity-70" aria-hidden /> : <EyeIcon className="size-3.5 opacity-70" aria-hidden />}
              {editState.visibility}
            </FactChip>
          ) : null}
        </div>

        {/* Actions — same-height pills: direct support, then social links. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <AccountWalletSupport
            did={account.did}
            name={editState.displayName || account.displayName}
            image={account.avatarUrl}
          />
          {isOrg ? (
            <>
              {editState.socials.length > 0 ? (
                <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
              ) : null}
              {editState.socials.map((url) => {
                const label = formatWebsite(url);
                return (
                  <Button key={url} asChild variant="outline" size="icon" className="text-muted-foreground hover:text-foreground" title={label} aria-label={t("hero.openSocialLink", { link: label })}>
                    <Link href={externalHref(url)} target="_blank" rel="noopener noreferrer">
                      <SocialGlyph platform={classifySocial(url)} />
                    </Link>
                  </Button>
                );
              })}
              <Button variant="outline" onClick={onEditSocials} disabled={!canEdit} title={editDisabledReason ?? undefined} className="border-dashed text-muted-foreground hover:text-foreground">
                <Link2Icon />
                {t("hero.addSocialLinks")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** A quiet, editable fact in the hero: reads as metadata text, reveals a
 *  pencil on hover, and switches to a dashed outline while still unset. */
function FactChip({
  onClick,
  disabled,
  title,
  empty = false,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "group inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        empty
          ? "border border-dashed border-border text-muted-foreground/70 hover:border-foreground/25 hover:text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
      <PencilIcon className="size-3 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60" aria-hidden />
    </button>
  );
}

/**
 * The inline-editable account header (cover, avatar, name, bio, detail chips,
 * and — for organizations — the About section). It owns the whole edit engine:
 * optimistic local state, blob uploads, and the profile/org record writes. It's
 * shared by the (legacy) manage dashboard and the account profile so owners can
 * edit in place wherever they are.
 */
export function EditableAccountHeader({
  account,
  writeRepoDid,
  groupRole,
  settingsHref,
  viewPublicHref,
  showAbout = true,
  memberships = [],
}: {
  account: AccountRouteData;
  /** When editing an org repo, the group DID writes are routed to. */
  writeRepoDid?: string;
  /** The current user's role in the org — gates whether profile edits are allowed. */
  groupRole?: CgsRole;
  settingsHref: string;
  /** Link to the public profile; pass null to hide (e.g. already on the profile). */
  viewPublicHref: string | null;
  /** Organizations this person belongs to, shown as a "Member of…" hero row. */
  memberships?: AccountOrganization[];
  /**
   * Whether to render the organization About section beneath the hero. The
   * dashboard shows it inline; the profile renders About in its Overview tab
   * instead, so it passes false to avoid a duplicate.
   */
  showAbout?: boolean;
}) {
  const router = useRouter();
  const modal = useModal();
  const t = useTranslations("upload.dashboardClient");

  const accountState = useMemo(() => heroStateFromAccount(account), [account]);
  const [editDisplayName, setEditDisplayName] = useState(accountState.displayName);
  const [editDescription, setEditDescription] = useState(accountState.description);
  const [editLongDescription, setEditLongDescription] = useState(accountState.longDescription);
  const [editWebsite, setEditWebsite] = useState(accountState.website);
  const [editLocation, setEditLocation] = useState<HeroLocationState>(accountState.location);
  const [editStartDate, setEditStartDate] = useState(accountState.startDate);
  const [editVisibility, setEditVisibility] = useState<"Public" | "Unlisted">(accountState.visibility);
  const [editOrgType, setEditOrgType] = useState(accountState.orgType);
  const [editSocials, setEditSocials] = useState<string[]>(accountState.socials);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [inlineField, setInlineField] = useState<InlineField>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingOptimisticSave, setPendingOptimisticSave] = useState<PendingOptimisticSave | null>(null);

  const profileEditPermission = writeRepoDid
    ? canEditGroupProfile({ kind: "group", role: groupRole })
    : { allowed: true, reason: null };

  const editState: HeroEditState = {
    displayName: editDisplayName,
    description: editDescription,
    longDescription: editLongDescription,
    website: editWebsite,
    location: editLocation,
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
    setEditLocation(next.location);
    setEditStartDate(next.startDate);
    setEditVisibility(next.visibility);
    setEditOrgType(next.orgType);
    setEditSocials(next.socials);
    setLogoFile(next.logoFile);
    setCoverFile(next.coverFile);
  };

  useEffect(() => {
    if (inlineField !== null || isSaving) return;
    if (pendingOptimisticSave) {
      if (!accountCaughtUpWithOptimisticSave(account, pendingOptimisticSave)) return;
      setPendingOptimisticSave(null);
    }
    applyState(accountState);
  }, [
    account,
    accountState,
    inlineField,
    isSaving,
    pendingOptimisticSave,
  ]);

  const resetState = () => {
    applyState(pendingOptimisticSave?.state ?? accountState);
    setInlineField(null);
    setSaveError(null);
  };

  const handleChange = (field: keyof Omit<HeroEditState, "logoFile" | "coverFile" | "socials">, value: string) => {
    switch (field) {
      case "displayName": setEditDisplayName(value); break;
      case "description": setEditDescription(value); break;
      case "longDescription": setEditLongDescription(value); break;
      case "website": setEditWebsite(value); break;
      case "startDate": setEditStartDate(value); break;
      case "visibility": setEditVisibility(value as "Public" | "Unlisted"); break;
      case "orgType": setEditOrgType(value); break;
    }
  };

  /** Returns the failure message, or null on success, so callers that own a
   *  richer surface (the location editor's progress view) can show it there.
   *  The hero's own saveError state is set either way. */
  const saveChanges = async (
    overrides: Partial<HeroEditState> = {},
  ): Promise<string | null> => {
    if (isSaving) return t("errors.saveFailed");
    if (!profileEditPermission.allowed) {
      setSaveError(profileEditPermission.reason);
      return profileEditPermission.reason ?? t("errors.saveFailed");
    }
    const next: HeroEditState = { ...editState, ...overrides };
    if (!next.displayName.trim()) {
      setSaveError(t("errors.nameRequired"));
      return t("errors.nameRequired");
    }
    if (!isValidWebsite(next.website)) {
      setSaveError(t("errors.invalidWebsite"));
      return t("errors.invalidWebsite");
    }

    setIsSaving(true);
    setSaveError(null);
    applyState(next);

    try {
      let avatarBlob: { ref: unknown; mimeType: string; size: number } | null = null;
      const writeOptions = writeRepoDid ? { repo: writeRepoDid } : undefined;
      if (next.logoFile) avatarBlob = await uploadBlob(next.logoFile, writeOptions);

      const shouldWriteProfile = Object.keys(overrides).length === 0 || (
        "displayName" in overrides ||
        "description" in overrides ||
        "website" in overrides ||
        "logoFile" in overrides
      );
      if (shouldWriteProfile) {
        const repo = writeRepoDid ?? account.did;
        const existingCertifiedProfile = await fetchExistingSelfRecord(repo, "app.certified.actor.profile");
        const certifiedProfileRecord: Record<string, unknown> = {
          ...existingCertifiedProfile,
          $type: "app.certified.actor.profile",
          createdAt: typeof existingCertifiedProfile.createdAt === "string" ? existingCertifiedProfile.createdAt : account.createdAt ?? new Date().toISOString(),
        };
        if (next.displayName.trim()) {
          certifiedProfileRecord.displayName = next.displayName.trim();
        } else {
          delete certifiedProfileRecord.displayName;
        }
        if (next.description.trim()) {
          certifiedProfileRecord.description = next.description.trim();
        } else {
          delete certifiedProfileRecord.description;
        }
        if (next.website.trim()) {
          const url = next.website.startsWith("http") ? next.website : `https://${next.website}`;
          certifiedProfileRecord.website = url.trim();
        } else {
          delete certifiedProfileRecord.website;
        }
        if (avatarBlob) {
          certifiedProfileRecord.avatar = { $type: "org.hypercerts.defs#smallImage", image: avatarBlob };
        }

        await putRecord("app.certified.actor.profile", "self", certifiedProfileRecord, writeOptions);
      }

      // A location save is a server-side composite: the proxy mints the
      // location record and repoints the org record in ONE request, so a
      // closed tab can't strand it halfway (ECO-882 has the history).
      if (account.kind === "organization" && "location" in overrides) {
        if (next.location.pendingChoice) {
          await saveOrganizationLocation(next.location.pendingChoice, writeOptions);
        } else if (!next.location.name && !next.location.country) {
          await saveOrganizationLocation(null, writeOptions);
        }
      }

      const shouldWriteOrg = account.kind === "organization" && (
        "startDate" in overrides || "visibility" in overrides ||
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

      setPendingOptimisticSave({
        // The pending pick has been published; only its display state remains.
        state: { ...next, location: { ...next.location, pendingChoice: undefined } },
        fields: optimisticFieldsForSave(overrides),
        previousAvatarUrl: account.avatarUrl,
        previousCoverUrl: account.coverUrl,
      });
      setInlineField(null);
      router.refresh();
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.saveFailed");
      setSaveError(message);
      return message;
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

  const openLocationModal = () => openDashboardModal(
    LocationEditorModalId,
    <LocationEditorModal
      current={
        editLocation.name || editLocation.country
          ? {
              name: editLocation.country ? countryName(editLocation.country) : editLocation.name,
              countryCode: editLocation.country || null,
              latitude: editLocation.latitude ?? null,
              longitude: editLocation.longitude ?? null,
              approximate: editLocation.approximate ?? false,
            }
          : null
      }
      onConfirm={async (choice) => {
        // Await the save so the editor stays open, locked, and surfaces the
        // failure — a fire-and-forget here is how a half-saved location
        // (record written, org never repointed) used to happen.
        const message = choice
          ? await saveChanges({
              location: {
                ...displayLocationFromChoice(choice),
                latitude: choice.place.latitude,
                longitude: choice.place.longitude,
                approximate: choice.approximate,
                pendingChoice: choice,
              },
            })
          : await saveChanges({ location: { name: null, country: "" } });
        if (message) throw new Error(message);
      }}
    />,
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

  return (
    <div className="space-y-6">
      <EditableHero
        account={account}
        settingsHref={settingsHref}
        viewPublicHref={viewPublicHref}
        memberships={memberships}
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
        onEditLocation={openLocationModal}
        onEditWebsite={openWebsiteModal}
        onEditStartDate={openStartDateModal}
        onEditVisibility={openVisibilityModal}
        onEditOrgType={openOrgTypeModal}
        onEditSocials={openSocialsModal}
        editDisabledReason={profileEditPermission.reason}
      />
      {showAbout && account.kind === "organization" ? (
        <AboutSection
          value={editLongDescription}
          draft={editLongDescription}
          isEditing={inlineField === "about"}
          isSaving={isSaving}
          saveError={inlineField === "about" ? saveError : null}
          onEdit={() => { setSaveError(null); setInlineField("about"); }}
          onChange={setEditLongDescription}
          onSave={() => void saveChanges({ longDescription: editLongDescription })}
          onCancel={() => { setEditLongDescription((pendingOptimisticSave?.state ?? accountState).longDescription); setSaveError(null); setInlineField(null); }}
          editDisabledReason={profileEditPermission.reason}
        />
      ) : null}
    </div>
  );
}
