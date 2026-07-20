"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
  Trash2Icon,
  UserIcon,
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
import {
  deleteAccountDataChunk,
  deleteRecord,
  fetchAccountDataSummary,
  type AccountDataSummary,
} from "@/app/(manage)/manage/_lib/mutations";
import { redirectToLogout } from "@/app/_lib/auth-client";
import {
  blueskyProfileUrl,
  ensureBlueskyProfile,
  hasBlueskyProfile,
  readBlueskyCrosspostPref,
  saveBlueskyCrosspostPref,
  type BlueskyCrosspostPref,
} from "@/app/_lib/bluesky-crosspost";
import { BlueskyConsentModal } from "@/app/_components/BlueskyConsentModal";
import { BlueskyIcon } from "@/app/_components/BlueskyIcon";
import { INDEXER_URL } from "@/app/_lib/urls";
import { isTainaAgentKeyName } from "@/app/_lib/taina-shared";
import { cn } from "@/lib/utils";

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

// ── Bluesky cross-posting ────────────────────────────────────────────────────

/**
 * Opt-in toggle for mirroring feed posts to Bluesky (app.bsky.feed.post twins
 * in the user's own repo — see app/_lib/bluesky-crosspost.ts). The first
 * activation goes through the consent modal, which also creates the user's
 * Bluesky profile from their GainForest profile when they don't have one.
 * Personal accounts only; organizations never see this section.
 */
function BlueskySection({ did }: { did: string }) {
  const t = useTranslations("common.bluesky.settings");
  const [pref, setPref] = useState<BlueskyCrosspostPref | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readBlueskyCrosspostPref(did).then((value) => {
      if (!cancelled) setPref(value);
    });
    void hasBlueskyProfile(did).then((value) => {
      if (!cancelled) setHasProfile(value);
    });
    return () => {
      cancelled = true;
    };
  }, [did]);

  async function toggle() {
    if (!pref || busy) return;
    setError(null);
    if (!pref.enabled && !pref.consented) {
      // First activation ever: nothing is written to Bluesky before the user
      // has confirmed the consent modal once.
      setConsentOpen(true);
      return;
    }
    const previous = pref;
    const next = { enabled: !pref.enabled, consented: true };
    setPref(next);
    setBusy(true);
    try {
      await saveBlueskyCrosspostPref(did, next.enabled);
    } catch {
      setPref(previous);
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmConsent() {
    await ensureBlueskyProfile(did);
    await saveBlueskyCrosspostPref(did, true);
    setPref({ enabled: true, consented: true });
    setHasProfile(true);
  }

  const enabled = pref?.enabled === true;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BlueskyIcon className="h-4 w-4 text-[#1185fe]" />
        <h2 className="text-sm font-medium">{t("title")}</h2>
      </div>

      <div className="bg-muted rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("toggleLabel")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("toggleDescription")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={t("toggleLabel")}
            disabled={!pref || busy}
            onClick={() => void toggle()}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
              enabled ? "bg-[#1185fe]" : "bg-border",
            )}
          >
            <span
              className={cn(
                "absolute left-0.5 top-0.5 size-5 rounded-full bg-background shadow transition-transform",
                enabled && "translate-x-5",
              )}
            />
          </button>
        </div>
        {enabled ? (
          <a
            href={blueskyProfileUrl(did)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#1185fe] hover:underline"
          >
            {t("viewProfile")}
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <BlueskyConsentModal
        open={consentOpen}
        needsProfile={hasProfile === null ? null : !hasProfile}
        onOpenChange={setConsentOpen}
        onConfirm={confirmConsent}
      />
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

// ── Danger zone (Advanced) ────────────────────────────────────────────
//
// "Delete account" here means deleting every record the GainForest stack
// has written into the user's repo (projects, certs, observations, sites,
// profile, wallet links … — all app.gainforest.* / app.certified.* /
// org.hypercerts.* collections). Their ATProto identity (DID, handle,
// PDS login) survives, as do records from unrelated apps. Deliberately
// buried inside the collapsed "Advanced" accordion and gated behind a
// typed confirmation — this is a destructive, irreversible bulk delete.

const DELETE_CONFIRM_PHRASE = "delete my account";

function lexiconGroupLabel(collection: string): string {
  if (collection.startsWith("app.gainforest.dwc.")) return "Biodiversity observations";
  if (collection.startsWith("app.gainforest.ac.")) return "Audio & multimedia";
  if (collection.startsWith("app.gainforest.organization.")) return "Organization data";
  if (collection.startsWith("app.gainforest.feed")) return "Feed posts & likes";
  if (collection.startsWith("org.hypercerts.")) return "Certs & collections";
  if (collection.startsWith("app.certified.")) return "Profile, badges & signatures";
  return "Other GainForest records";
}

function summarizeByGroup(summary: AccountDataSummary): Array<{ label: string; count: number }> {
  const groups = new Map<string, number>();
  for (const { collection, count } of summary.collections) {
    const label = lexiconGroupLabel(collection);
    groups.set(label, (groups.get(label) ?? 0) + count);
  }
  return [...groups.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

type DeleteAccountPhase = "loading" | "confirm" | "deleting" | "done" | "error";

type OwnedGroup = {
  did: string;
  displayName: string | null;
  handle: string | null;
};

// Organizations where the signed-in user holds the `owner` role. Deleting
// the account leaves those orgs without an owner, so the modal makes the
// visitor acknowledge that explicitly before the confirm button unlocks.
async function fetchOwnedGroups(): Promise<OwnedGroup[]> {
  try {
    const res = await fetch("/api/cgs/groups", { cache: "no-store" });
    if (!res.ok) return [];
    const payload = (await res.json().catch(() => null)) as {
      groups?: Array<{ groupDid?: unknown; role?: unknown; displayName?: unknown; handle?: unknown }>;
    } | null;
    if (!Array.isArray(payload?.groups)) return [];
    return payload.groups
      .filter((group) => typeof group?.role === "string" && group.role.toLowerCase() === "owner")
      .map((group) => ({
        did: typeof group.groupDid === "string" ? group.groupDid : "",
        displayName: typeof group.displayName === "string" && group.displayName.trim() ? group.displayName.trim() : null,
        handle: typeof group.handle === "string" && group.handle.trim() ? group.handle.trim() : null,
      }))
      .filter((group) => group.did.startsWith("did:"));
  } catch {
    // If the membership lookup fails we still warn generically below rather
    // than blocking deletion on an unrelated outage.
    return [];
  }
}

function DeleteAccountModal({ handle, onBack }: { handle: string | null; onBack: () => void }) {
  const [phase, setPhase] = useState<DeleteAccountPhase>("loading");
  const [summary, setSummary] = useState<AccountDataSummary | null>(null);
  const [ownedGroups, setOwnedGroups] = useState<OwnedGroup[]>([]);
  const [orphanAcknowledged, setOrphanAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletedCount, setDeletedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAccountDataSummary(), fetchOwnedGroups()])
      .then(([result, owned]) => {
        if (cancelled) return;
        setSummary(result);
        setOwnedGroups(owned);
        setPhase("confirm");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not read your account data.");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const confirmMatches = confirmText.trim().toLowerCase() === DELETE_CONFIRM_PHRASE;
  const orphanGateOpen = ownedGroups.length === 0 || orphanAcknowledged;
  const busy = phase === "deleting";
  const groups = summary ? summarizeByGroup(summary) : [];

  async function runDeletion() {
    setPhase("deleting");
    setError(null);
    let deleted = 0;
    let failed = 0;
    try {
      // Chunked loop — each call deletes a bounded batch server-side, so a
      // repo with thousands of records never hits one request timeout.
      for (;;) {
        const chunk = await deleteAccountDataChunk();
        deleted += chunk.deleted;
        failed += chunk.failed;
        setDeletedCount(deleted);
        setFailedCount(failed);
        if (chunk.done) break;
      }
      setPhase("done");
      // The account's GainForest data is gone — end the session too so the
      // app doesn't keep rendering a ghost profile from stale caches.
      window.setTimeout(() => redirectToLogout(), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed. Please try again.");
      setPhase("error");
    }
  }

  return (
    <ModalContent dismissible={!busy}>
      <ModalHeader backAction={busy ? undefined : onBack}>
        <ModalTitle>Delete account</ModalTitle>
        <ModalDescription>This cannot be undone</ModalDescription>
      </ModalHeader>

      {phase === "loading" ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Checking what would be deleted…
        </div>
      ) : null}

      {phase === "confirm" && summary ? (
        <>
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-destructive">
                  This permanently deletes {summary.approximate ? "about " : ""}
                  {summary.total} record{summary.total === 1 ? "" : "s"} from your account.
                </p>
                <p className="text-muted-foreground">
                  Everything you published on GainForest is removed from your personal data
                  server. Your ATProto identity (DID and handle) and data from other apps are
                  not touched.
                </p>
              </div>
            </div>
          </div>

          {groups.length > 0 ? (
            <ul className="mt-4 space-y-1.5 rounded-2xl bg-muted/50 p-4 text-sm">
              {groups.map(({ label, count }) => (
                <li key={label} className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              No GainForest records found — there is nothing to delete.
            </p>
          )}

          {ownedGroups.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="min-w-0 space-y-2 text-sm">
                  <p className="font-medium text-destructive">
                    You are the owner of {ownedGroups.length} organization{ownedGroups.length === 1 ? "" : "s"}.
                    Deleting your account leaves {ownedGroups.length === 1 ? "it" : "them"} without an owner:
                  </p>
                  <ul className="space-y-1">
                    {ownedGroups.map((group) => (
                      <li key={group.did} className="truncate text-muted-foreground">
                        • {group.displayName ?? group.handle ?? group.did}
                        {group.displayName && group.handle ? (
                          <span className="text-muted-foreground/70"> (@{group.handle})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground">
                    Consider transferring ownership from each organization&apos;s Members page first.
                  </p>
                  <label className="flex cursor-pointer items-start gap-2 pt-1 text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[var(--destructive,#dc2626)]"
                      checked={orphanAcknowledged}
                      onChange={(event) => setOrphanAcknowledged(event.target.checked)}
                    />
                    <span>I understand these organizations will be left ownerless.</span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {summary.total > 0 ? (
            <div className="mt-4 space-y-2">
              <Label htmlFor="delete-account-confirm" className="text-sm text-muted-foreground">
                Type <span className="font-mono font-medium text-foreground">{DELETE_CONFIRM_PHRASE}</span> to confirm
                {handle ? (
                  <>
                    {" "}for <span className="font-medium text-foreground">@{handle}</span>
                  </>
                ) : null}
                :
              </Label>
              <Input
                id="delete-account-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={DELETE_CONFIRM_PHRASE}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {phase === "deleting" ? (
        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          <Loader2Icon className="size-6 animate-spin text-destructive" />
          <p className="text-muted-foreground" aria-live="polite">
            Deleting your records… {deletedCount}
            {summary && summary.total > 0 ? ` of ${summary.approximate ? "~" : ""}${summary.total}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">Keep this window open until it finishes.</p>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          <CheckCircle2Icon className="size-6 text-primary" />
          <p className="text-center text-muted-foreground">
            Deleted {deletedCount} record{deletedCount === 1 ? "" : "s"}
            {failedCount > 0 ? ` (${failedCount} could not be removed)` : ""}. Signing you out…
          </p>
        </div>
      ) : null}

      {phase === "error" && error ? (
        <p className="mt-6 text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <ModalFooter>
        {phase === "confirm" && summary && summary.total > 0 ? (
          <Button
            variant="destructive"
            className="w-full"
            disabled={!confirmMatches || !orphanGateOpen}
            onClick={() => void runDeletion()}
          >
            <Trash2Icon className="size-3.5" />
            Permanently delete everything
          </Button>
        ) : null}
        {phase === "error" ? (
          <Button variant="destructive" className="w-full" onClick={() => void runDeletion()}>
            Try again
          </Button>
        ) : null}
        {!busy && phase !== "done" ? (
          <Button variant="outline" className="w-full" onClick={onBack}>
            Cancel
          </Button>
        ) : null}
      </ModalFooter>
    </ModalContent>
  );
}

function DangerZoneSection({ handle }: { handle: string | null }) {
  const modal = useModal();

  function closeModal() {
    void modal.hide().then(() => modal.popModal());
  }

  function openDeleteAccount() {
    modal.pushModal({
      id: "settings-delete-account",
      content: <DeleteAccountModal handle={handle} onBack={closeModal} />,
    });
    void modal.show();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangleIcon className="h-4 w-4 text-destructive/80" />
        <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">Delete account</p>
            <p className="text-xs text-muted-foreground">
              Permanently removes every record you published on GainForest (projects, certs,
              observations, profile, …) from your personal data server. Your ATProto identity
              and other apps&apos; data stay intact. This cannot be undone.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={openDeleteAccount}
          >
            <Trash2Icon className="size-3.5" />
            Delete account…
          </Button>
        </div>
      </div>
    </div>
  );
}

function SettingsGroup({
  value,
  title,
  description,
  children,
}: {
  value: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="overflow-hidden rounded-xl border border-border bg-background px-4">
      <AccordionTrigger className="py-4 text-left hover:no-underline">
        <span className="flex min-w-0 flex-col pr-3">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className="mt-0.5 text-xs font-normal leading-5 text-muted-foreground">{description}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-8 border-t border-border/60 pb-4 pt-4">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

export function AccountSettingsSections({
  did,
  handle,
  integrations,
}: {
  did: string;
  handle?: string | null;
  /** Extra integration sections (e.g. iNaturalist), grouped with Bluesky. */
  integrations?: React.ReactNode;
}) {
  const t = useTranslations("common.settings.groups");
  return (
    <Accordion type="multiple" defaultValue={["account"]} className="space-y-3">
      <SettingsGroup value="account" title={t("account.title")} description={t("account.description")}>
        {handle ? <HandleSection did={did} handle={handle} /> : null}
        <PasswordSection did={did} />
      </SettingsGroup>
      <SettingsGroup value="connections" title={t("connections.title")} description={t("connections.description")}>
        <BlueskySection did={did} />
        {integrations}
      </SettingsGroup>
      <SettingsGroup value="agents" title={t("agents.title")} description={t("agents.description")}>
        <AgentKeysSection />
      </SettingsGroup>
      <SettingsGroup value="advanced" title={t("advanced.title")} description={t("advanced.description")}>
        <AccountSection did={did} />
        {/* Destructive account deletion stays behind Advanced disclosure. */}
        <DangerZoneSection handle={handle ?? null} />
      </SettingsGroup>
    </Accordion>
  );
}

/** Compact organization settings: infrequent tools stay discoverable without
 * rendering their full forms into the page on first load. */
export function OrganizationSettingsSections({
  integrations,
  agentKeysHint,
}: {
  integrations: React.ReactNode;
  agentKeysHint: string;
}) {
  const t = useTranslations("common.settings.groups");
  return (
    <Accordion type="multiple" className="space-y-3">
      <SettingsGroup value="agents" title={t("agents.title")} description={t("agents.description")}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{agentKeysHint}</p>
          <AgentKeysSection />
        </div>
      </SettingsGroup>
      <SettingsGroup value="connections" title={t("connections.title")} description={t("connections.description")}>
        {integrations}
      </SettingsGroup>
    </Accordion>
  );
}
