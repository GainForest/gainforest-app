"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  GlobeIcon,
  ImageIcon,
  Loader2Icon,
  MapPinHouseIcon,
  SparklesIcon,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useModal } from "@/components/ui/modal/context";
import { countryFlag } from "@/app/_lib/format";
import { cn } from "@/lib/utils";
import { putRecord, uploadBlob } from "../_lib/mutations";
import { registerCgsGroup } from "../_lib/cgs";
import { createCountryLocationStrongRef } from "../_lib/country-location";
import { ImageEditorModal } from "@/components/modals/image-editor";
import CountrySelectorModal from "@/components/modals/country-selector";
import type { ManageMode } from "./manageDashboardMode";
import { HeaderContent } from "@/app/_components/HeaderSlots";

type OnboardingKind = "user" | "organization";

const CODE_OF_CONDUCT_URL =
  "https://gainforest.notion.site/GainForest-Community-Code-of-Conduct-23094a2f76b380118bc0dfe560df4a2e";

const APP_ICON_SRC = "/assets/media/images/app-icon.png";

type BrandInfo = {
  found: boolean;
  name?: string;
  description?: string;
  logoUrl?: string;
  domain?: string;
  countryCode?: string;
  foundedYear?: number;
};

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function extractDomain(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function validateUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

function normalizeWebsite(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

// ── GainForest mark ──────────────────────────────────────────────────────────

function GainForestMark({ className, alt = "" }: { className?: string; alt?: string }) {
  return (
    <motion.div
      className={cn("relative h-20 w-20", className)}
      transition={{ duration: 0.75, type: "spring" }}
      layoutId="gainforest-icon"
    >
      <Image className="drop-shadow-2xl" src={APP_ICON_SRC} fill alt={alt} />
    </motion.div>
  );
}

// ── Media field (banner + avatar + name) ────────────────────────────────────

function OnboardingMediaField({
  kind,
  primaryImage,
  bannerImage,
  displayName,
  displayNamePlaceholder,
  displayNameError,
  onPrimaryImageChange,
  onBannerImageChange,
  onDisplayNameChange,
}: {
  kind: OnboardingKind;
  primaryImage: File | undefined;
  bannerImage: File | undefined;
  displayName: string;
  displayNamePlaceholder: string;
  displayNameError?: string;
  onPrimaryImageChange: (image: File | undefined) => void;
  onBannerImageChange: (image: File | undefined) => void;
  onDisplayNameChange: (value: string) => void;
}) {
  const modal = useModal();
  const primaryImageUrl = useMemo(
    () => (primaryImage ? URL.createObjectURL(primaryImage) : null),
    [primaryImage],
  );
  const bannerImageUrl = useMemo(
    () => (bannerImage ? URL.createObjectURL(bannerImage) : null),
    [bannerImage],
  );
  const primaryLabel = kind === "organization" ? "Logo" : "Avatar";

  const openImageEditor = (target: "primary" | "banner") => {
    const isPrimary = target === "primary";
    modal.pushModal(
      {
        id: "onboarding-image-editor",
        content: (
          <ImageEditorModal
            title={`Upload ${isPrimary ? primaryLabel.toLowerCase() : "banner"}`}
            description={
              isPrimary
                ? `Choose a clear ${primaryLabel.toLowerCase()} for your profile.`
                : "Choose a banner that sets the tone for your profile."
            }
            initialImage={isPrimary ? primaryImage : bannerImage}
            onImageChange={(image) => (isPrimary ? onPrimaryImageChange(image) : onBannerImageChange(image))}
          />
        ),
      },
      true,
    );
    void modal.show();
  };

  return (
    <div className="space-y-0 pt-2">
      <button
        type="button"
        onClick={() => openImageEditor("banner")}
        className="relative block w-full overflow-hidden rounded-t-[24px] mask-b-from-0 bg-muted/80 border-t text-left"
      >
        <div className="aspect-[16/6] w-full">
          {bannerImageUrl ? (
            <div className="relative h-full w-full">
              <Image src={bannerImageUrl} alt="Banner preview" fill unoptimized className="object-cover" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <div className="flex flex-col items-center gap-2 text-center">
                <ImageIcon className="size-8 opacity-60" />
                <p className="text-sm text-foreground">Banner</p>
              </div>
            </div>
          )}
        </div>

        <span className="absolute top-3 right-3 rounded-full bg-background/75 px-2.5 py-1 text-xs text-foreground backdrop-blur-sm">
          {bannerImageUrl ? "Change banner" : "Add banner"}
        </span>
      </button>

      <div className="flex items-start gap-4 pl-4">
        <button
          type="button"
          onClick={() => openImageEditor("primary")}
          className="relative -mt-14 flex h-28 aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-background"
          aria-label={`Upload ${primaryLabel.toLowerCase()}`}
        >
          {primaryImageUrl ? (
            <Image src={primaryImageUrl} alt={`${primaryLabel} preview`} fill unoptimized className="object-cover" />
          ) : (
            <ImageIcon className="size-8 text-muted-foreground/60" />
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-2 pt-3">
          <InputGroup className="rounded-full">
            <InputGroupInput
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              placeholder={displayNamePlaceholder}
              aria-invalid={displayNameError ? true : undefined}
            />
          </InputGroup>
          {displayNameError ? <p className="text-xs text-destructive">{displayNameError}</p> : null}
        </div>
      </div>
    </div>
  );
}

// ── Organization details step ───────────────────────────────────────────────

function OrganizationSetupDetailsPanel({
  country,
  startDate,
  longDescription,
  canSubmit,
  showAiGeneratedReviewNotice,
  isSubmitting,
  submitLabel,
  submitError,
  onBack,
  onCountryChange,
  onStartDateChange,
  onLongDescriptionChange,
}: {
  country: string;
  startDate: string;
  longDescription: string;
  canSubmit: boolean;
  showAiGeneratedReviewNotice: boolean;
  isSubmitting: boolean;
  submitLabel: string;
  submitError: string | null;
  onBack: () => void;
  onCountryChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onLongDescriptionChange: (value: string) => void;
}) {
  const modal = useModal();
  const selectedDate = useMemo(
    () => (startDate ? parseISO(startDate) : undefined),
    [startDate],
  );
  const selectedCountryName = country ? countryName(country) : null;

  const handleOpenCountrySelector = () => {
    modal.pushModal(
      {
        id: "onboarding-country-selector",
        content: <CountrySelectorModal initialCountryCode={country ?? ""} onCountryChange={onCountryChange} />,
      },
      true,
    );
    void modal.show();
  };

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-foreground">Country</label>

          <button
            type="button"
            className="relative min-h-[72px] rounded-2xl border-2 border-dashed bg-background px-2 py-1 text-left hover:bg-muted"
            onClick={handleOpenCountrySelector}
          >
            {selectedCountryName ? (
              <div className="flex h-full flex-col justify-between items-start">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPinHouseIcon className="size-3" />
                  <span>Based in</span>
                </span>
                <span className="absolute top-0 right-2 text-2xl">{countryFlag(country)}</span>
                <span className="text-sm font-medium">
                  {selectedCountryName.length > 22
                    ? `${selectedCountryName.slice(0, 20)}...`
                    : selectedCountryName}
                </span>
              </div>
            ) : (
              <span className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                Select a Country
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-foreground">Founding Date</label>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative min-h-[72px] rounded-2xl border-2 border-dashed bg-background px-2 py-1 text-left hover:bg-muted"
              >
                {selectedDate ? (
                  <div className="flex h-full flex-col justify-between items-start">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <CalendarIcon className="size-3" />
                      <span>Founded</span>
                    </span>
                    <span className="self-end text-sm font-medium">
                      {format(selectedDate, "d MMMM,")}
                      <span className="ml-1 text-lg font-bold opacity-40 md:text-2xl">
                        {format(selectedDate, "yyyy")}
                      </span>
                    </span>
                  </div>
                ) : (
                  <span className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                    Select a Date
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                captionLayout="dropdown"
                mode="single"
                selected={selectedDate}
                onSelect={(date) => onStartDateChange(date ? format(date, "yyyy-MM-dd") : "")}
                disabled={(date) => date > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Long description</label>
        <Textarea
          value={longDescription}
          onChange={(event) => onLongDescriptionChange(event.target.value)}
          placeholder="Tell the story behind your organization, the work you do, and why it matters."
          className="min-h-[200px] resize-none"
        />
      </div>

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      {showAiGeneratedReviewNotice ? (
        <p className="text-center text-muted-foreground">
          Please review and edit the generated content to accurately represent your organization
          before saving.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" size="lg" variant="outline" onClick={onBack}>
          <ArrowLeftIcon />
          Back
        </Button>
        <Button type="submit" size="lg" className="flex-1" disabled={!canSubmit}>
          {submitLabel}
          {isSubmitting ? <Loader2Icon className="animate-spin" /> : <ArrowRightIcon />}
        </Button>
      </div>
    </section>
  );
}

// ── Form ────────────────────────────────────────────────────────────────────

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-destructive">{error}</p>;
}

const organizationStepVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 24 : -24 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -24 : 24 }),
} satisfies Variants;

function AccountSetupForm({
  kind,
  ownerDid,
  onBack,
}: {
  kind: OnboardingKind;
  ownerDid: string;
  onBack: () => void;
}) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [startDate, setStartDate] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [primaryImage, setPrimaryImage] = useState<File | undefined>();
  const [bannerImage, setBannerImage] = useState<File | undefined>();

  const [touchedFields, setTouchedFields] = useState<{
    displayName?: boolean;
    shortDescription?: boolean;
    website?: boolean;
  }>({});
  const [brandfetchFeedback, setBrandfetchFeedback] = useState<{
    tone: "neutral" | "success" | "destructive";
    message: string;
  } | null>(null);
  const [hasAcceptedCodeOfConduct, setHasAcceptedCodeOfConduct] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isFetchingBrandInfo, setIsFetchingBrandInfo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);

  const isOrganizationFlow = kind === "organization";
  const isOrganizationDetailsStep = isOrganizationFlow && onboardingStep === 1;

  const domain = useMemo(() => extractDomain(website), [website]);

  const fieldErrors = useMemo(() => {
    const errors: { displayName?: string; shortDescription?: string; website?: string } = {};
    const trimmedName = displayName.trim();
    if (trimmedName.length === 0) errors.displayName = "Name is required.";
    else if (trimmedName.length > 64) errors.displayName = "Name must be 64 characters or fewer.";

    const trimmedBio = shortDescription.trim();
    if (trimmedBio.length === 0) errors.shortDescription = "Bio is required.";
    else if (trimmedBio.length > 256) errors.shortDescription = "Bio must be 256 characters or fewer.";

    if (kind === "organization" && website.trim().length > 0 && !validateUrl(website)) {
      errors.website = "Enter a valid website URL.";
    }
    return errors;
  }, [displayName, shortDescription, website, kind]);

  const canSubmit = Object.keys(fieldErrors).length === 0 && !isSubmitting;
  const canFetchBrandInfo =
    kind === "organization" &&
    website.trim().length > 0 &&
    fieldErrors.website === undefined &&
    domain !== null &&
    !isFetchingBrandInfo;
  const hasSuccessfulPrefill = brandfetchFeedback?.tone === "success";
  const isOrganizationOptionalStepEmpty =
    country.trim().length === 0 && startDate.length === 0 && longDescription.trim().length === 0;

  const visibleDisplayNameError = touchedFields.displayName ? fieldErrors.displayName : undefined;
  const visibleShortDescriptionError = touchedFields.shortDescription ? fieldErrors.shortDescription : undefined;
  const visibleWebsiteError =
    kind === "organization" && touchedFields.website ? fieldErrors.website : undefined;

  const fetchLogoAsFile = useCallback(async (logoUrl: string): Promise<File | null> => {
    try {
      const response = await fetch(logoUrl);
      if (!response.ok) return null;
      const blob = await response.blob();
      const extension = logoUrl.split(".").pop()?.split("?")[0] ?? "png";
      return new File([blob], `logo.${extension}`, { type: blob.type || `image/${extension}` });
    } catch {
      return null;
    }
  }, []);

  const handleFetchBrandInfo = useCallback(async () => {
    setTouchedFields((current) => ({ ...current, website: true }));
    setBrandfetchFeedback(null);
    setSubmitError(null);

    if (!canFetchBrandInfo || !domain) return;

    setIsFetchingBrandInfo(true);
    try {
      const response = await fetch("/api/brand/fetch-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      if (!response.ok) throw new Error("Unable to fetch website information right now.");

      const brandInfo = (await response.json()) as BrandInfo;
      if (!brandInfo.found) {
        setBrandfetchFeedback({ tone: "destructive", message: "No brand data found." });
        return;
      }

      if (brandInfo.name) setDisplayName(brandInfo.name);
      if (brandInfo.description) {
        setShortDescription(brandInfo.description.slice(0, 160));
        setLongDescription(brandInfo.description);
      }
      if (brandInfo.countryCode && /^[A-Za-z]{2}$/.test(brandInfo.countryCode)) {
        setCountry(brandInfo.countryCode.toUpperCase());
      }
      if (brandInfo.foundedYear) setStartDate(`${brandInfo.foundedYear}-01-01`);
      if (brandInfo.logoUrl) {
        const logoFile = await fetchLogoAsFile(brandInfo.logoUrl);
        if (logoFile) setPrimaryImage(logoFile);
      }

      setTouchedFields((current) => ({
        ...current,
        displayName: true,
        shortDescription: true,
        website: true,
      }));
      setBrandfetchFeedback({ tone: "success", message: "Prefilled what we found." });
    } catch {
      setBrandfetchFeedback({ tone: "destructive", message: "Couldn’t prefill right now." });
    } finally {
      setIsFetchingBrandInfo(false);
    }
  }, [canFetchBrandInfo, domain, fetchLogoAsFile]);

  const handleSubmit = useCallback(async () => {
    setTouchedFields({
      displayName: true,
      shortDescription: true,
      ...(kind === "organization" ? { website: true } : {}),
    });

    if (Object.keys(fieldErrors).length > 0) {
      if (isOrganizationDetailsStep) {
        setStepDirection(-1);
        setOnboardingStep(0);
      }
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const trimmedName = displayName.trim();
      const trimmedBio = shortDescription.trim();
      const normalizedWebsite = kind === "organization" ? normalizeWebsite(website) : undefined;
      const registeredOrganization = kind === "organization"
        ? await registerCgsGroup({
            ownerDid,
            displayName: trimmedName,
            description: trimmedBio,
            ...(normalizedWebsite ? { website: normalizedWebsite } : {}),
          })
        : null;
      const writeOptions = registeredOrganization ? { repo: registeredOrganization.groupDid } : undefined;

      const [avatarBlob, bannerBlob] = await Promise.all([
        primaryImage ? uploadBlob(primaryImage, writeOptions) : Promise.resolve(null),
        bannerImage ? uploadBlob(bannerImage, writeOptions) : Promise.resolve(null),
      ]);

      const profileRecord: Record<string, unknown> = {
        $type: "app.bsky.actor.profile",
        displayName: trimmedName,
        description: trimmedBio,
      };
      const certifiedProfileRecord: Record<string, unknown> = {
        $type: "app.certified.actor.profile",
        displayName: trimmedName,
        description: trimmedBio,
        createdAt: new Date().toISOString(),
      };
      if (normalizedWebsite) {
        profileRecord.website = normalizedWebsite;
        certifiedProfileRecord.website = normalizedWebsite;
      }
      if (avatarBlob) {
        profileRecord.avatar = avatarBlob;
        certifiedProfileRecord.avatar = {
          $type: "org.hypercerts.defs#smallImage",
          image: avatarBlob.ref,
        };
      }
      if (bannerBlob) profileRecord.banner = bannerBlob;

      await Promise.all([
        putRecord("app.bsky.actor.profile", "self", profileRecord, writeOptions),
        putRecord("app.certified.actor.profile", "self", certifiedProfileRecord, writeOptions),
      ]);

      if (registeredOrganization) {
        const orgRecord: Record<string, unknown> = {
          $type: "app.certified.actor.organization",
          visibility: "public",
          createdAt: new Date().toISOString(),
        };
        if (country.trim()) orgRecord.location = await createCountryLocationStrongRef(country, writeOptions);
        if (startDate) orgRecord.foundedDate = `${startDate}T00:00:00.000Z`;
        if (longDescription.trim()) {
          orgRecord.longDescription = {
            $type: "org.hypercerts.defs#descriptionString",
            value: longDescription.trim(),
          };
        }
        await putRecord("app.certified.actor.organization", "self", orgRecord, writeOptions);
      }

      router.push(registeredOrganization
        ? `/manage/groups/${encodeURIComponent(registeredOrganization.handle?.trim() || registeredOrganization.groupDid)}`
        : "/manage");
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to complete setup.");
      setIsSubmitting(false);
    }
  }, [
    bannerImage,
    country,
    displayName,
    fieldErrors,
    isOrganizationDetailsStep,
    kind,
    longDescription,
    ownerDid,
    primaryImage,
    router,
    shortDescription,
    startDate,
    website,
  ]);

  const handleOrganizationStepAdvance = useCallback(() => {
    setTouchedFields({ displayName: true, shortDescription: true, website: true });
    if (Object.keys(fieldErrors).length > 0) return;
    if (!hasAcceptedCodeOfConduct) return;
    setSubmitError(null);
    setStepDirection(1);
    setOnboardingStep(1);
  }, [fieldErrors, hasAcceptedCodeOfConduct]);

  const handleBackClick = useCallback(() => {
    if (isOrganizationDetailsStep) {
      setStepDirection(-1);
      setOnboardingStep(0);
      return;
    }
    setOnboardingStep(0);
    onBack();
  }, [isOrganizationDetailsStep, onBack]);

  const mainFormFields = (
    <>
      {kind === "organization" && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Website</label>

          <InputGroup className="rounded-full">
            <InputGroupAddon>
              <GlobeIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="url"
              value={website}
              onChange={(event) => {
                setWebsite(event.target.value);
                setTouchedFields((current) => ({ ...current, website: true }));
                setBrandfetchFeedback(null);
                setSubmitError(null);
              }}
              placeholder="https://your-organization.org"
              aria-invalid={visibleWebsiteError ? true : undefined}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                variant="secondary"
                size="xs"
                className="rounded-full"
                onClick={() => void handleFetchBrandInfo()}
                disabled={!canFetchBrandInfo}
              >
                {isFetchingBrandInfo ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                Prefill
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>

          <div className="mt-3 space-y-2">
            <FieldError error={visibleWebsiteError} />
            {brandfetchFeedback && (
              <p
                className={cn("text-xs", {
                  "text-primary": brandfetchFeedback.tone === "success",
                  "text-muted-foreground": brandfetchFeedback.tone === "neutral",
                  "text-destructive": brandfetchFeedback.tone === "destructive",
                })}
              >
                {brandfetchFeedback.message}
              </p>
            )}
          </div>
        </div>
      )}

      <OnboardingMediaField
        kind={kind}
        primaryImage={primaryImage}
        bannerImage={bannerImage}
        displayName={displayName}
        displayNamePlaceholder={kind === "organization" ? "Organization name" : "Your name"}
        displayNameError={visibleDisplayNameError}
        onPrimaryImageChange={setPrimaryImage}
        onBannerImageChange={setBannerImage}
        onDisplayNameChange={(value) => {
          setDisplayName(value);
          setTouchedFields((current) => ({ ...current, displayName: true }));
          setSubmitError(null);
        }}
      />

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Bio</label>
        <Textarea
          value={shortDescription}
          onChange={(event) => {
            setShortDescription(event.target.value);
            setTouchedFields((current) => ({ ...current, shortDescription: true }));
            setSubmitError(null);
          }}
          placeholder={
            kind === "organization"
              ? "A short introduction to your organization and the work you do."
              : "A short introduction to who you are."
          }
          rows={4}
          aria-invalid={visibleShortDescriptionError ? true : undefined}
        />
        <div>
          <FieldError error={visibleShortDescriptionError} />
        </div>
      </div>
    </>
  );

  return (
    <>
      <HeaderContent
        left={
          <Button type="button" variant="ghost" size="sm" onClick={handleBackClick}>
            <ArrowLeftIcon />
            Back
          </Button>
        }
      />

      <motion.form
        className="mx-auto flex min-h-[calc(100vh-10rem)] w-full flex-col justify-center gap-5 py-8"
        initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        onSubmit={(event) => {
          event.preventDefault();
          if (kind === "organization" && onboardingStep === 0) {
            handleOrganizationStepAdvance();
            return;
          }
          void handleSubmit();
        }}
      >
        <div className="space-y-1 text-center">
          <h1 className="text-4xl italic font-instrument text-foreground">
            {kind === "organization" ? "Organization" : "User"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {kind === "organization"
              ? "Add the basics and we’ll prefill what we can."
              : "A few basics and you’re in."}
          </p>
        </div>

        {kind === "organization" ? (
          <AnimatePresence custom={stepDirection} mode="wait" initial={false}>
            <motion.div
              key={isOrganizationDetailsStep ? "organization-step-1" : "organization-step-0"}
              custom={stepDirection}
              variants={organizationStepVariants}
              className="mx-auto w-full max-w-xl space-y-5"
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {isOrganizationDetailsStep ? (
                <OrganizationSetupDetailsPanel
                  country={country}
                  startDate={startDate}
                  longDescription={longDescription}
                  canSubmit={canSubmit}
                  showAiGeneratedReviewNotice={hasSuccessfulPrefill}
                  isSubmitting={isSubmitting}
                  submitLabel={isOrganizationOptionalStepEmpty ? "Skip and Continue" : "Continue"}
                  submitError={submitError}
                  onBack={() => {
                    setStepDirection(-1);
                    setOnboardingStep(0);
                  }}
                  onCountryChange={setCountry}
                  onStartDateChange={setStartDate}
                  onLongDescriptionChange={setLongDescription}
                />
              ) : (
                <>
                  {mainFormFields}

                  {submitError && <p className="text-sm text-destructive">{submitError}</p>}

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="organization-code-of-conduct"
                      checked={hasAcceptedCodeOfConduct}
                      onCheckedChange={(checked) => setHasAcceptedCodeOfConduct(checked === true)}
                      className="mt-0.5 bg-background"
                    />
                    <label htmlFor="organization-code-of-conduct" className="text-sm text-muted-foreground">
                      I have reviewed and agree to the{" "}
                      <a
                        href={CODE_OF_CONDUCT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        Code of Conduct
                      </a>
                      .
                    </label>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={!canSubmit || !hasAcceptedCodeOfConduct}
                  >
                    Continue
                    <ArrowRightIcon />
                  </Button>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <>
            {mainFormFields}

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
              Continue
              {isSubmitting ? <Loader2Icon className="animate-spin" /> : <ArrowRightIcon />}
            </Button>
          </>
        )}
      </motion.form>
    </>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

export function ManageAccountSetup({ did, mode }: { did: string; mode: ManageMode | null }) {
  const router = useRouter();
  const onboardingKind: OnboardingKind = mode === "onboard-org" ? "organization" : "user";

  return (
    <motion.div
      className="mx-auto w-full max-w-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={onboardingKind}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <AccountSetupForm kind={onboardingKind} ownerDid={did} onBack={() => router.push("/manage")} />
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
