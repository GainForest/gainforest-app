"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  Building2Icon,
  CalendarIcon,
  ChevronRight,
  GlobeIcon,
  ImageIcon,
  Loader2Icon,
  LockIcon,
  SparklesIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { putRecord, uploadBlob } from "../_lib/mutations";
import type { ManageMode } from "./manageDashboardMode";
import { HeaderContent } from "@/app/_components/HeaderSlots";

type OnboardingKind = "user" | "organization";

type OnboardingRoleOption = {
  Icon: LucideIcon;
  optionName: string;
  optionDescription: string;
  href: string;
};

function validateUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function BumicertsMark({ className, alt = "" }: { className?: string; alt?: string }) {
  return (
    <motion.div
      className={cn("relative h-20 w-20", className)}
      transition={{ duration: 0.75, type: "spring" }}
      layoutId="bumicerts-icon"
    >
      <Image className="drop-shadow-2xl" src="/assets/media/images/app-icon.png" fill alt={alt} />
    </motion.div>
  );
}

function OnboardingRoleSelector({
  title,
  description,
  options,
  className,
}: {
  title: string;
  description: string;
  options: OnboardingRoleOption[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center pt-8", className)}>
      <BumicertsMark />
      <h1 className="mt-3 text-center text-xl font-medium">{title}</h1>
      <p className="text-center text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 grid w-full gap-2">
        {options.map((option) => (
          <OnboardingRoleOptionCard key={option.optionName} {...option} />
        ))}
      </div>
    </div>
  );
}

function OnboardingRoleOptionCard({ href, Icon, optionName, optionDescription }: OnboardingRoleOption) {
  return (
    <Button
      asChild
      variant="secondary"
      className="group relative h-auto w-full max-w-md flex-col items-start justify-between rounded-xl py-4 shadow-none hover:bg-primary/10"
    >
      <Link href={href}>
        <span className="flex items-center gap-1.5 text-2xl italic font-instrument">
          <Icon className="text-primary opacity-50" />
          {optionName}
        </span>
        <span className="text-left text-muted-foreground text-pretty">{optionDescription}</span>
        <span className="absolute right-3 top-3 -translate-x-2 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100">
          <ChevronRight />
        </span>
      </Link>
    </Button>
  );
}

function AccountSetupChoiceStep() {
  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
      <OnboardingRoleSelector
        className="w-full max-w-md"
        title="Choose your setup"
        description="Pick the kind of profile you want to create on Bumicerts."
        options={[
          {
            href: "/manage?mode=onboard-user",
            Icon: UserIcon,
            optionName: "User",
            optionDescription: "Create a personal profile with your avatar, banner, name and bio.",
          },
          {
            href: "/manage?mode=onboard-org",
            Icon: Building2Icon,
            optionName: "Organization",
            optionDescription: "Set up your organization profile, website, country and start date.",
          },
        ]}
      />
    </div>
  );
}

function MediaInput({
  label,
  file,
  onChange,
  kind,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  kind: "logo" | "cover";
}) {
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  return (
    <label
      className={cn(
        "group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/30 text-center transition-colors hover:border-primary/50 hover:bg-primary/5",
        kind === "cover" ? "h-32" : "h-28",
      )}
    >
      {previewUrl ? (
        <Image src={previewUrl} alt="Selected media preview" fill unoptimized className="object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
          {label}
        </span>
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function AccountSetupForm({ did, kind }: { did: string; kind: OnboardingKind }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [startDate, setStartDate] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [visibility, setVisibility] = useState<"Public" | "Unlisted">("Public");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const websiteValid = validateUrl(website);
  const baseComplete = displayName.trim().length > 0 && description.trim().length > 0 && websiteValid && accepted;
  const canContinue = baseComplete && !isSubmitting;
  const canSubmit = baseComplete && !isSubmitting;

  const handleBack = () => {
    if (kind === "organization" && onboardingStep > 0) {
      setOnboardingStep(0);
      return;
    }
    router.push("/manage");
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const [avatarBlob, bannerBlob] = await Promise.all([
        logoFile ? uploadBlob(logoFile) : Promise.resolve(null),
        coverFile ? uploadBlob(coverFile) : Promise.resolve(null),
      ]);

      const profileRecord: Record<string, unknown> = {
        $type: "app.bsky.actor.profile",
        displayName: displayName.trim(),
        description: description.trim(),
      };
      const normalizedWebsite = normalizeUrl(website);
      if (normalizedWebsite) profileRecord.website = normalizedWebsite;
      if (avatarBlob) profileRecord.avatar = avatarBlob;
      if (bannerBlob) profileRecord.banner = bannerBlob;
      await putRecord("app.bsky.actor.profile", "self", profileRecord);

      if (kind === "organization") {
        const orgRecord: Record<string, unknown> = {
          $type: "app.certified.actor.organization",
          visibility: visibility === "Unlisted" ? "unlisted" : "public",
          createdAt: new Date().toISOString(),
        };
        if (country.trim().length === 2) orgRecord.country = country.trim().toUpperCase();
        if (startDate) orgRecord.foundedDate = `${startDate}T00:00:00.000Z`;
        if (longDescription.trim()) {
          orgRecord.longDescription = {
            $type: "org.hypercerts.defs#descriptionString",
            value: longDescription.trim(),
          };
        }
        await putRecord("app.certified.actor.organization", "self", orgRecord);
      }

      router.push("/manage");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete setup.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <HeaderContent
        left={(
          <Button type="button" variant="ghost" onClick={handleBack} className="-ml-2">
            <ArrowLeftIcon />
            Back
          </Button>
        )}
      />
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <BumicertsMark className="h-14 w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <SparklesIcon className="h-3 w-3" />
            {kind === "organization" ? "Organization setup" : "User setup"}
          </p>
          <h1 className="mt-2 text-xl font-medium">Create your {kind === "organization" ? "organization" : "profile"}</h1>
          <p className="text-sm text-muted-foreground">Add the essentials now. You can refine everything from Manage later.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <MediaInput label="Add logo" file={logoFile} onChange={setLogoFile} kind="logo" />
        <MediaInput label="Add cover image" file={coverFile} onChange={setCoverFile} kind="cover" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="setup-name" className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
        <Input id="setup-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={kind === "organization" ? "Organization name" : "Display name"} maxLength={64} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="setup-bio" className="text-sm font-medium">Bio <span className="text-destructive">*</span></label>
        <Textarea id="setup-bio" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short public description…" rows={3} className="resize-none" maxLength={256} />
        <p className="text-xs text-muted-foreground">{description.length}/256</p>
      </div>

      {kind === "organization" && onboardingStep === 1 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="setup-website" className="flex items-center gap-1.5 text-sm font-medium"><GlobeIcon className="h-3.5 w-3.5" /> Website</label>
              <Input id="setup-website" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.org" aria-invalid={!websiteValid} />
              {!websiteValid && <p className="text-xs text-destructive">Enter a valid website URL.</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="setup-country" className="text-sm font-medium">Country code</label>
              <Input id="setup-country" value={country} onChange={(event) => setCountry(event.target.value.toUpperCase().slice(0, 2))} placeholder="BR" maxLength={2} className="uppercase" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="setup-start" className="flex items-center gap-1.5 text-sm font-medium"><CalendarIcon className="h-3.5 w-3.5" /> Start date</label>
              <Input id="setup-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="setup-visibility" className="flex items-center gap-1.5 text-sm font-medium"><LockIcon className="h-3.5 w-3.5" /> Visibility</label>
              <select
                id="setup-visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as "Public" | "Unlisted")}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option>Public</option>
                <option>Unlisted</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="setup-long" className="text-sm font-medium">About your organization</label>
            <Textarea id="setup-long" value={longDescription} onChange={(event) => setLongDescription(event.target.value)} placeholder="Mission, work, local partners, monitoring approach…" rows={5} className="resize-none" />
          </div>
        </motion.div>
      )}

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 accent-primary" />
        <span>I confirm this profile represents me or an organization I am authorized to manage.</span>
      </label>

      {error && <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={handleBack}>
          Back
        </Button>
        {kind === "organization" && onboardingStep === 0 ? (
          <Button type="button" disabled={!canContinue} onClick={() => setOnboardingStep(1)}>
            Continue
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button type="submit" disabled={!canSubmit}>
            {isSubmitting && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            Complete setup
          </Button>
        )}
      </div>
    </form>
    </>
  );
}

export function ManageAccountSetup({ did, mode }: { did: string; mode: ManageMode | null }) {
  const onboardingKind = mode === "onboard-user" ? "user" : mode === "onboard-org" ? "organization" : null;

  return (
    <motion.div className="mx-auto w-full max-w-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}>
      <AnimatePresence mode="wait">
        {onboardingKind ? (
          <motion.div key={onboardingKind} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}>
            <AccountSetupForm did={did} kind={onboardingKind} />
          </motion.div>
        ) : (
          <motion.div key="choice" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}>
            <AccountSetupChoiceStep />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
