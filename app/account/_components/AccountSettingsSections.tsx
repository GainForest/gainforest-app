"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { blo } from "blo";
import {
  AlertTriangleIcon,
  AtSignIcon,
  BotIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronRight,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyRoundIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  UserIcon,
  WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { AddWalletModal } from "@/components/global/modals/wallet/add";
import { deleteRecord } from "@/app/(manage)/manage/_lib/mutations";
import { INDEXER_URL } from "@/app/_lib/urls";
import { isTainaAgentKeyName } from "@/app/_lib/taina-shared";
import { cn } from "@/lib/utils";

type WalletLink = {
  uri: string | null;
  rkey: string | null;
  name: string | null;
  address: string | null;
  valid: boolean;
};

function shortAddress(address: string | null | undefined): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function resolvePdsUrl(did: string): Promise<string> {
  const response = await fetch(`/api/atproto/resolve-pds?did=${encodeURIComponent(did)}`);
  const data = (await response.json().catch(() => null)) as { pdsUrl?: string; error?: string } | null;
  if (!response.ok || !data?.pdsUrl) throw new Error(data?.error ?? "Failed to resolve account server");
  return data.pdsUrl;
}

// ── Username (handle) ────────────────────────────────────────────────────────

// Subdomain prefix (the "alice" in alice.gainforest.app). Full handle = a
// hostname; used when the account is on its own domain.
const PREFIX_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const FULL_HANDLE_REGEX =
  /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

type HandleMode = "display" | "prefix" | "custom";

function HandleSection({ did, handle: initialHandle }: { did: string; handle: string }) {
  const t = useTranslations("common.settings.handle");
  const [handle, setHandle] = useState(initialHandle);
  const [mode, setMode] = useState<HandleMode>("display");
  const [prefix, setPrefix] = useState("");
  const [customHandle, setCustomHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // "alice.gainforest.app" -> prefix "alice", suffix "gainforest.app".
  // Two-segment handles (alice.com) are custom domains -> no prefix mode.
  const suffix = useMemo(() => {
    const parts = handle.split(".");
    return parts.length >= 3 ? parts.slice(1).join(".") : null;
  }, [handle]);

  function startEdit() {
    setError(null);
    setJustSaved(false);
    if (suffix) {
      setPrefix(handle.split(".")[0]);
      setMode("prefix");
    } else {
      setCustomHandle(handle);
      setMode("custom");
    }
  }

  function cancel() {
    setMode("display");
    setError(null);
  }

  async function submit(newHandle: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/account/handle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: newHandle }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (data?.code === "handle_unavailable") throw new Error(t("errors.unavailable"));
      if (!response.ok || data?.error) throw new Error(data?.error ?? t("errors.generic"));
      setHandle(newHandle);
      setMode("display");
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  function savePrefix() {
    if (!suffix) return;
    const trimmed = prefix.trim().toLowerCase();
    if (trimmed.length < 3 || trimmed.length > 18) {
      setError(t("errors.length"));
      return;
    }
    if (!PREFIX_REGEX.test(trimmed)) {
      setError(t("errors.prefixChars"));
      return;
    }
    void submit(`${trimmed}.${suffix}`);
  }

  function saveCustom() {
    const trimmed = customHandle.trim().toLowerCase().replace(/^@/, "");
    if (!FULL_HANDLE_REGEX.test(trimmed)) {
      setError(t("errors.full"));
      return;
    }
    void submit(trimmed);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AtSignIcon className="h-4 w-4 text-foreground/70" />
        <h2 className="text-sm font-medium">{t("title")}</h2>
      </div>

      <div className="bg-muted rounded-xl p-1 w-full">
        <div className="flex flex-col gap-3 px-3 py-3">
          {mode === "display" ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground break-all">@{handle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
                {justSaved ? (
                  <p className="mt-2 flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                    <CheckIcon className="h-3.5 w-3.5 shrink-0" /> {t("success", { handle: `@${handle}` })}
                  </p>
                ) : null}
              </div>
              <Button size="sm" variant="ghost" onClick={startEdit} className="shrink-0">
                <PencilIcon className="h-3.5 w-3.5" /> {t("edit")}
              </Button>
            </div>
          ) : null}

          {mode === "prefix" && suffix ? (
            <div className="space-y-2">
              <Label htmlFor="handle-prefix">{t("newLabel")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="handle-prefix"
                  value={prefix}
                  autoFocus
                  disabled={saving}
                  onChange={(e) => setPrefix(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                  placeholder={t("placeholder")}
                  className="bg-background max-w-[16rem]"
                />
                <span className="whitespace-nowrap text-sm text-muted-foreground">.{suffix}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("prefixHint")}</p>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={savePrefix} disabled={saving}>
                  {saving ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
                  {saving ? t("saving") : t("save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
                  {t("cancel")}
                </Button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setCustomHandle("");
                    setError(null);
                    setMode("custom");
                  }}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                >
                  <GlobeIcon className="h-3 w-3" /> {t("useOwnDomain")}
                </button>
              </div>
            </div>
          ) : null}

          {mode === "custom" ? (
            <div className="space-y-2">
              <Label htmlFor="handle-custom">{t("customLabel")}</Label>
              <Input
                id="handle-custom"
                value={customHandle}
                autoFocus
                disabled={saving}
                onChange={(e) => setCustomHandle(e.target.value.replace(/[^a-zA-Z0-9.-]/g, ""))}
                placeholder="alice.example.com"
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">{t("customHint")}</p>
              <p className="text-[11px] font-mono break-all text-muted-foreground/80">
                {t("customRecord")}: {did}
              </p>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={saveCustom} disabled={saving}>
                  {saving ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
                  {saving ? t("saving") : t("save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
                  {t("cancel")}
                </Button>
                {suffix ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={startEdit}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    <AtSignIcon className="h-3 w-3" /> {t("useSubdomain", { suffix })}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Password ────────────────────────────────────────────────────────────────

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup className="bg-background">
      <InputGroupInput
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-sm"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

function PasswordSection({ did }: { did: string }) {
  const [step, setStep] = useState<"idle" | "form" | "success">("idle");
  const [sentToEmail, setSentToEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (step !== "success") return;
    const timer = setTimeout(() => setStep("idle"), 4000);
    return () => clearTimeout(timer);
  }, [step]);

  async function handleRequestReset() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/atproto/request-password-reset", { method: "POST" });
      const data = (await response.json().catch(() => null)) as { email?: string; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Failed to send reset email. Please try again.");
      setSentToEmail(data?.email ?? "");
      setStep("form");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!token.trim() || !newPassword.trim()) return;
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 256) {
      setError("Password must be between 8 and 256 characters.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const pdsUrl = await resolvePdsUrl(did);
      const response = await fetch(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.server.resetPassword`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), password: newPassword }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
        throw new Error(data?.message ?? data?.error ?? "Failed to reset password. Check the code and try again.");
      }
      setStep("success");
      setSentToEmail("");
      setToken("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password. Check the code and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <KeyRoundIcon className="h-4 w-4 text-foreground/70" />
        <h2 className="text-sm font-medium">Password</h2>
      </div>

      <div className="bg-muted rounded-xl p-1 flex flex-col items-center w-full">
        {step === "idle" && (
          <div className="flex flex-col items-center gap-4 px-4 py-4 w-full">
            <p className="text-sm text-muted-foreground text-center">
              We&apos;ll send a reset code to the email address on your account.
            </p>
            {error ? <p className="text-sm text-destructive text-center">{error}</p> : null}
            <Button onClick={() => void handleRequestReset()} disabled={isLoading} size="sm">
              {isLoading ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
              {isLoading ? "Sending..." : "Send Reset Code"}
            </Button>
          </div>
        )}

        {step === "form" && (
          <div className="flex flex-col items-center gap-4 px-4 py-4 w-full">
            {sentToEmail ? (
              <p className="text-sm text-muted-foreground text-center">
                A reset code was sent to {sentToEmail}. Check your inbox.
              </p>
            ) : null}
            <div className="space-y-2 w-full">
              <Label htmlFor="reset-token">Reset Code</Label>
              <Input
                id="reset-token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter the code from your email"
                autoComplete="one-time-code"
                className="bg-background"
              />
            </div>
            <div className="space-y-2 w-full">
              <Label htmlFor="new-password">New Password</Label>
              <PasswordInput id="new-password" value={newPassword} onChange={setNewPassword} placeholder="Min. 8 characters" autoComplete="new-password" />
            </div>
            <div className="space-y-2 w-full">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <PasswordInput id="confirm-password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Repeat new password" autoComplete="new-password" />
            </div>
            {error ? <p className="text-sm text-destructive text-center w-full">{error}</p> : null}
            <div className="flex items-center gap-2">
              <Button onClick={() => void handleResetPassword()} disabled={isLoading || !token.trim() || !newPassword.trim() || !confirmPassword.trim()} size="sm">
                {isLoading ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
                {isLoading ? "Saving..." : "Change Password"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setStep("idle"); setError(null); }}>Cancel</Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-green-700 dark:text-green-400">
            <CheckIcon className="h-4 w-4 shrink-0" />
            Password changed successfully.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Wallets ─────────────────────────────────────────────────────────────────

async function fetchWalletLinks(did: string): Promise<WalletLink[]> {
  const query = `
    query LinkEvmByDid($did: String!, $first: Int) {
      appGainforestLinkEvm(where: { did: { eq: $did } }, first: $first, sortDirection: DESC, sortBy: createdAt) {
        edges {
          node {
            uri
            rkey
            name
            address
            certifiedProfileData { displayName }
            platformAttestation { __typename }
            userProof { __typename }
          }
        }
      }
    }
  `;
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { did, first: 20 } }),
  });
  const json = (await response.json().catch(() => null)) as {
    data?: { appGainforestLinkEvm?: { edges?: Array<{ node?: { uri?: string; rkey?: string; name?: string | null; address?: string | null; certifiedProfileData?: { displayName?: string | null } | null; platformAttestation?: { __typename?: string } | null; userProof?: { __typename?: string } | null } }> } };
  } | null;
  return json?.data?.appGainforestLinkEvm?.edges?.map(({ node }) => ({
    uri: node?.uri ?? null,
    rkey: node?.rkey ?? null,
    name: node?.name ?? null,
    address: node?.address ?? null,
    valid: node?.platformAttestation?.__typename === "AppGainforestLinkEvmEip712PlatformAttestation" && node?.userProof?.__typename === "AppGainforestLinkEvmEip712Proof",
  })) ?? [];
}

function DeleteWalletModal({ link, onDeleted, onBack }: { link: WalletLink; onDeleted: () => void; onBack: () => void }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!link.rkey) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteRecord("app.gainforest.link.evm", link.rkey);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this wallet. Please try again.");
      setIsDeleting(false);
    }
  }

  const label = link.name ?? "Untitled";
  const address = link.address ?? "";

  return (
    <ModalContent dismissible={!isDeleting}>
      <ModalHeader backAction={isDeleting ? undefined : onBack}>
        <ModalTitle>Remove Wallet</ModalTitle>
        <ModalDescription>Confirm your choice</ModalDescription>
      </ModalHeader>

      <p className="mt-6 text-center text-pretty">
        You are about to remove <span className="font-medium text-foreground">&quot;{label}&quot;</span> from your linked wallets.
      </p>
      <div className="bg-muted/50 rounded-2xl p-4 mt-4 grid grid-cols-[1fr_2rem_1fr] overflow-hidden">
        <div className="flex flex-col items-center justify-center">
          {address ? (
            <Image height={32} width={32} alt={label} src={blo(address as `0x${string}`)} className="rounded-full border-2 drop-shadow-sm" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-muted" />
          )}
          <span className="font-medium text-sm mt-2 bg-muted px-1 py-0.5 rounded-md">{shortAddress(address)}</span>
        </div>
        <div className="flex items-center justify-center">
          <ChevronRight className="size-6 text-destructive opacity-50" />
        </div>
        <div className="flex items-center justify-center relative">
          <div className="absolute h-10 w-10 rounded-full blur-xl bg-destructive/70" />
          <Trash2Icon className="text-destructive size-8" />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <ModalFooter>
        <Button variant="destructive" className="w-full" onClick={() => void handleDelete()} disabled={isDeleting || !link.rkey}>
          {isDeleting ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
          {isDeleting ? "Removing…" : "Remove Wallet"}
        </Button>
        <Button variant="outline" className="w-full" onClick={onBack} disabled={isDeleting}>Cancel</Button>
      </ModalFooter>
    </ModalContent>
  );
}

function WalletsSection({ did }: { did: string }) {
  const modal = useModal();
  const createT = useTranslations("modals.walletCreate");
  const [links, setLinks] = useState<WalletLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadLinks() {
    setIsLoading(true);
    setError(null);
    try {
      setLinks(await fetchWalletLinks(did));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallets");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadLinks(); }, [did]);

  function closeModal() {
    void modal.hide().then(() => modal.popModal());
  }

  function openAdd(existing?: WalletLink) {
    modal.pushModal({
      id: "settings-wallet-add",
      content: (
        <AddWalletModal
          did={did}
          existingName={existing?.name ?? undefined}
          onBack={closeModal}
          onSuccess={() => { closeModal(); void loadLinks(); }}
        />
      ),
    });
    void modal.show();
  }

  function openDelete(link: WalletLink) {
    modal.pushModal({
      id: "settings-wallet-delete",
      content: <DeleteWalletModal link={link} onBack={closeModal} onDeleted={() => { closeModal(); void loadLinks(); }} />,
    });
    void modal.show();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-4 w-4 text-foreground/70" />
          <h2 className="text-sm font-medium">Linked Wallets</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => openAdd()} className="gap-1.5">
          <PlusIcon className="h-3.5 w-3.5" />
          Add Wallet
        </Button>
      </div>

      <div className="bg-muted rounded-xl p-1 flex flex-col items-center w-full">
        {isLoading ? (
          <div className="w-full flex flex-col gap-0.5">
            {[1, 2].map((i) => <Skeleton key={i} className="h-[62px] rounded-lg" />)}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4 text-center">{error}</p>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4 px-3 w-full">
            <p className="text-sm text-muted-foreground text-center">No wallets linked yet.</p>
            <Button size="sm" onClick={() => openAdd()} className="gap-1.5">
              <SparklesIcon className="h-3.5 w-3.5" />
              {createT("addWallet")}
            </Button>
            <p className="text-xs text-muted-foreground text-center max-w-xs">{createT("createHint")}</p>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-0.5">
            {links.map((link) => (
              <div key={link.uri ?? link.rkey ?? link.address} className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2.5">
                <div className="relative shrink-0">
                  {link.address ? (
                    <Image src={blo(link.address as `0x${string}`)} alt={link.address} width={36} height={36} className="rounded-full" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-muted" />
                  )}
                  <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-muted", link.valid ? "bg-primary" : "bg-amber-500")} />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  {link.name ? <span className="text-sm font-medium leading-snug truncate">{link.name}</span> : null}
                  <span className="text-xs text-muted-foreground font-mono leading-snug">{shortAddress(link.address)}</span>
                </div>
                {link.valid ? (
                  <span className="hidden sm:inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full"><CheckCircle2Icon className="h-3 w-3" />Verified</span>
                ) : (
                  <span className="hidden sm:inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full"><AlertTriangleIcon className="h-3 w-3" />Unverified</span>
                )}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openAdd(link)} aria-label="Edit wallet"><PencilIcon className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => openDelete(link)} aria-label="Delete wallet"><Trash2Icon className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── AI agent keys ────────────────────────────────────────────────────────────

type AgentKey = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
};

// Placeholder swapped for the real key once one is minted, so the preview shown
// before generating reads naturally.
const FIRST_PROMPT_PLACEHOLDER = "gf_pat_PASTE_YOUR_KEY_HERE";

/**
 * The ready-to-paste “first prompt” a user drops into their AI agent: it points
 * the agent at the skill file, hands it the key, asks it to remember both, and
 * suggests a first GainForest task — without acting until the user approves.
 * `token` is a freshly minted key, or FIRST_PROMPT_PLACEHOLDER for the preview.
 */
function buildAgentFirstPrompt(origin: string, token: string): string {
  const site = origin || "https://www.gainforest.app";
  return `Read ${site}/skill.md and follow its setup. My GainForest API key: ${token} — store it as GAINFOREST_API_KEY and run the skill's whoami check to verify it. Remember where the key and the skill file live so you can help me whenever a GainForest task comes up. Then help me log a field observation (a species sighting, ideally with a photo), or start a project with its certificate and an evidence timeline — but don't create anything on GainForest until I approve it.`;
}

function formatKeyDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function AgentKeysSection() {
  const t = useTranslations("common.settings.agentKeys");
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState<"key" | "prompt" | null>(null);
  const [origin, setOrigin] = useState("");

  const promptText = buildAgentFirstPrompt(origin, freshToken?.token ?? FIRST_PROMPT_PLACEHOLDER);

  function flashCopied(kind: "key" | "prompt") {
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  async function loadKeys() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/account/tokens", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { tokens?: AgentKey[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? t("errors.load"));
      setKeys(data.tokens ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("errors.load"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    void loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mint a key, then copy the first prompt with the key swapped in — one click
  // gives the user a ready-to-paste message for their agent.
  async function handleGenerate() {
    const name = draftName.trim() || t("defaultKeyName");
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/account/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error ?? t("errors.create"));
      setFreshToken({ name, token: data.token });
      setDraftName("");
      await loadKeys();
      try {
        await navigator.clipboard.writeText(buildAgentFirstPrompt(window.location.origin, data.token));
        flashCopied("prompt");
      } catch {
        // Clipboard may be unavailable; the copy buttons below still work.
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("errors.create"));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(entry: AgentKey) {
    if (!window.confirm(t("revokeConfirm", { name: entry.name }))) return;
    setRevokingId(entry.id);
    try {
      const res = await fetch("/api/account/tokens", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t("errors.revoke"));
      }
      if (freshToken && entry.name === freshToken.name) setFreshToken(null);
      await loadKeys();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("errors.revoke"));
    } finally {
      setRevokingId(null);
    }
  }

  async function copy(kind: "key" | "prompt") {
    if (!freshToken) return;
    const text =
      kind === "key"
        ? freshToken.token
        : buildAgentFirstPrompt(window.location.origin, freshToken.token);
    try {
      await navigator.clipboard.writeText(text);
      flashCopied(kind);
    } catch {
      setCreateError(t("errors.copy"));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BotIcon className="h-4 w-4 text-foreground/70" />
        <h2 className="text-sm font-medium">{t("title")}</h2>
      </div>

      <div className="bg-muted rounded-xl p-1 w-full">
        <div className="flex flex-col gap-3 px-3 py-3">
          <p className="text-xs text-muted-foreground">
            {t("description")}{" "}
            <a href="/skill.md" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {t("learnMore")}
            </a>
          </p>

          {/* Ready-to-paste connect prompt — the key is swapped in once generated. */}
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">{t("connectCaption")}</p>
            <p className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
              {promptText}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {freshToken ? (
                <>
                  <Button size="sm" onClick={() => void copy("prompt")}>
                    <CopyIcon className="h-3.5 w-3.5" />
                    {copied === "prompt" ? t("copied") : t("copyPrompt")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void copy("key")}>
                    <CopyIcon className="h-3.5 w-3.5" />
                    {copied === "key" ? t("copied") : t("copyKey")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setFreshToken(null)}>
                    {t("done")}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={() => void handleGenerate()} disabled={creating}>
                    {creating ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    {t("generateAndCopy")}
                  </Button>
                  <Input
                    value={draftName}
                    disabled={creating}
                    maxLength={60}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t("namePlaceholder")}
                    aria-label={t("newKeyLabel")}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleGenerate();
                    }}
                    className="bg-background h-8 max-w-[11rem] text-xs"
                  />
                </>
              )}
            </div>
            {freshToken ? <p className="mt-2 text-[11px] text-muted-foreground">{t("freshHint")}</p> : null}
            {createError ? <p className="mt-2 text-xs text-destructive">{createError}</p> : null}
          </div>

          <div className="flex flex-col gap-0.5">
            {isLoading ? (
              <>
                <Skeleton className="h-[52px] rounded-lg" />
                <Skeleton className="h-[52px] rounded-lg" />
              </>
            ) : loadError ? (
              <p className="py-3 text-center text-sm text-destructive">{loadError}</p>
            ) : keys.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              keys.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-snug">
                      <span className="truncate">{entry.name}</span>
                      {/* The Tainá Telegram bot's own key — minted from the Tainá
                          setup page, recognisable by its canonical name. */}
                      {isTainaAgentKeyName(entry.name) ? (
                        <a
                          href="/taina"
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                          title={t("tainaBadgeTitle")}
                        >
                          <BotIcon className="h-3 w-3" />
                          {t("tainaBadge")}
                        </a>
                      ) : null}
                    </span>
                    <span className="truncate font-mono text-[11px] leading-snug text-muted-foreground">
                      {entry.tokenPrefix}… · {t("createdLabel", { date: formatKeyDate(entry.createdAt) })}
                      {" · "}
                      {entry.lastUsedAt ? t("lastUsedLabel", { date: formatKeyDate(entry.lastUsedAt) }) : t("neverUsed")}
                    </span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void handleRevoke(entry)}
                    disabled={revokingId === entry.id}
                    aria-label={t("revokeAria", { name: entry.name })}
                  >
                    {revokingId === entry.id ? (
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2Icon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>

          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
      </div>
    </div>
  );
}

// ── Account (Advanced) ──────────────────────────────────────────────────────

const VIEWERS = [
  { key: "pdsls", label: "pdsls.dev", href: (did: string) => `https://pdsls.dev/at://${did}` },
  { key: "certified", label: "certified.app", href: (did: string) => `https://certified.app/profile/${did}` },
  { key: "atproto", label: "atproto.at", href: (did: string) => `https://atproto.at/uri/at://${did}` },
] as const;

function AccountSection({ did }: { did: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <UserIcon className="h-4 w-4 text-foreground/70" />
        <h2 className="text-sm font-medium">Account</h2>
      </div>

      <div className="bg-muted rounded-xl p-1 flex flex-col items-center w-full">
        <div className="flex flex-col items-center gap-3 px-3 py-3 w-full">
          <div className="flex flex-col items-center gap-1 w-full">
            <p className="text-xs text-muted-foreground">Decentralized Identifier (DID)</p>
            <p className="text-xs font-mono break-all text-foreground/70 text-center">{did ?? "—"}</p>
          </div>
          {did && (
            <div className="flex flex-wrap gap-2 justify-center">
              {VIEWERS.map(({ key, label, href }) => (
                <Button key={key} variant="outline" size="sm" asChild>
                  <a href={href(did)} target="_blank" rel="noopener noreferrer">
                    {label}
                    <ExternalLinkIcon className="h-3 w-3" />
                  </a>
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AccountSettingsSections({ did, handle }: { did: string; handle?: string | null }) {
  return (
    <div className="mx-auto mt-8 mb-20 space-y-8">
      {handle ? <HandleSection did={did} handle={handle} /> : null}
      <PasswordSection did={did} />
      <WalletsSection did={did} />
      <AgentKeysSection />
      <Accordion type="single" collapsible>
        <AccordionItem value="advanced" className="border-none">
          <AccordionTrigger className="text-sm font-medium text-muted-foreground hover:text-foreground hover:no-underline py-0 pb-3">
            Advanced
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <AccountSection did={did} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
