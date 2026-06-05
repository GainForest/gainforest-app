"use client";

import Image from "next/image";
import { useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  UserIcon,
  WalletIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { AccountRouteData } from "../_lib/account-route";

function ProfileSection({ account }: { account: AccountRouteData }) {
  const [displayName, setDisplayName] = useState(account.displayName);
  const [bio, setBio] = useState(account.description ?? "");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const displayedAvatarUrl = account.avatarUrl;
  const displayedBannerUrl = account.coverUrl;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Update your public profile details.</p>
      </div>
      <Separator />

      <div className="space-y-5">
        <div>
          <button
            type="button"
            className="group relative block w-full overflow-hidden rounded-t-2xl border border-border bg-muted/50 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Change banner"
          >
            <div className="aspect-[16/5] w-full">
              {displayedBannerUrl ? (
                <Image src={displayedBannerUrl} alt="Banner" fill unoptimized className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <span className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-xs text-foreground backdrop-blur-sm transition-opacity group-hover:opacity-100 opacity-80">
              {displayedBannerUrl ? "Change banner" : "Add banner"}
            </span>
          </button>

          <div className="flex items-end gap-4 pl-4">
            <button
              type="button"
              className="group relative -mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Change avatar"
            >
              {displayedAvatarUrl ? (
                <Image src={displayedAvatarUrl} alt="Avatar" fill unoptimized className="object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                <ImageIcon className="h-5 w-5 text-white" />
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="settings-display-name">Name</Label>
            <Input
              id="settings-display-name"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setSaveSuccess(false); }}
              placeholder="Your name"
              maxLength={64}
              className="max-w-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-bio">Bio</Label>
            <Textarea
              id="settings-bio"
              value={bio}
              onChange={(e) => { setBio(e.target.value); setSaveSuccess(false); }}
              placeholder="Describe your profile"
              rows={3}
              maxLength={256}
              className="max-w-sm resize-none"
            />
            <p className="max-w-sm text-right text-xs text-muted-foreground">{bio.length}/256</p>
          </div>
        </div>

        <Button
          onClick={() => {
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
          }}
          size="sm"
        >
          {saveSuccess ? (
            <>
              <CheckIcon className="h-3.5 w-3.5" />
              Saved
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </div>
  );
}

function PasswordInput({ id, placeholder }: { id: string; placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="border-input relative flex h-9 w-full min-w-0 items-center rounded-md border bg-background shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      <input
        id={id}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {visible ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
      </button>
    </div>
  );
}

function PasswordSection() {
  const [step, setStep] = useState<"idle" | "form" | "success">("idle");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <KeyRoundIcon className="h-4 w-4 text-foreground/70" />
        <h2 className="text-sm font-medium">Password</h2>
      </div>

      <div className="bg-muted rounded-xl p-1 flex flex-col items-center w-full">
        {step === "idle" && (
          <div className="flex flex-col items-center gap-4 px-4 py-4 w-full">
            <p className="text-sm text-muted-foreground text-center">Send a password reset code to your account email.</p>
            <Button onClick={() => setStep("form")} size="sm">
              Send code
            </Button>
          </div>
        )}

        {step === "form" && (
          <div className="flex flex-col items-center gap-4 px-4 py-4 w-full">
            <p className="text-sm text-muted-foreground text-center">Enter the reset code sent to your email.</p>
            <div className="space-y-2 w-full">
              <Label htmlFor="reset-token">Code</Label>
              <Input id="reset-token" type="text" placeholder="Reset code" autoComplete="one-time-code" className="bg-background" />
            </div>
            <div className="space-y-2 w-full">
              <Label htmlFor="new-password">New password</Label>
              <PasswordInput id="new-password" placeholder="New password" />
            </div>
            <div className="space-y-2 w-full">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <PasswordInput id="confirm-password" placeholder="Confirm password" />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setStep("success")} size="sm">
                Change password
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStep("idle")}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-green-700 dark:text-green-400">
            <CheckIcon className="h-4 w-4 shrink-0" />
            Password updated.
          </div>
        )}
      </div>
    </div>
  );
}

function WalletsSection() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-4 w-4 text-foreground/70" />
          <h2 className="text-sm font-medium">Wallets</h2>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5">
          <PlusIcon className="h-3.5 w-3.5" />
          Add wallet
        </Button>
      </div>

      <div className="bg-muted rounded-xl p-1 flex flex-col items-center w-full">
        <p className="text-sm text-muted-foreground py-4 text-center">No wallets connected.</p>
      </div>
    </div>
  );
}

function AccountSection({ did }: { did: string }) {
  const viewers = [
    { label: "pdsls.dev", href: `https://pdsls.dev/at://${did}` },
    { label: "certified.app", href: `https://certified.app/profile/${did}` },
    { label: "atproto.at", href: `https://atproto.at/uri/at://${did}` },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <UserIcon className="h-4 w-4 text-foreground/70" />
        <h2 className="text-sm font-medium">Account</h2>
      </div>

      <div className="bg-muted rounded-xl p-1 flex flex-col items-center w-full">
        <div className="flex flex-col items-center gap-3 px-3 py-3 w-full">
          <div className="flex flex-col items-center gap-1 w-full">
            <p className="text-xs text-muted-foreground">DID</p>
            <p className="text-xs font-mono break-all text-foreground/70 text-center">{did}</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {viewers.map(({ label, href }) => (
              <Button key={label} variant="outline" size="sm" asChild>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {label}
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AccountSettingsSections({ account }: { account: AccountRouteData }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <div className="mx-auto mt-8 mb-20 space-y-8">
      <ProfileSection account={account} />
      <PasswordSection />
      <WalletsSection />
      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="text-sm font-medium text-muted-foreground hover:text-foreground py-0 pb-3"
        >
          Advanced
        </button>
        {advancedOpen && <AccountSection did={account.did} />}
      </div>
    </div>
  );
}
