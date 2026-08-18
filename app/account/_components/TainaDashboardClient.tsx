"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  BotIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  UnplugIcon,
  UserRoundIcon,
  WalletIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TAINA_PROFILE_MAX_CHARS } from "@/app/_lib/taina-shared";
import { cn } from "@/lib/utils";

type ChatMsg = { role: "user" | "assistant"; text: string; ts: string };

type DashData = {
  provisioned: boolean;
  bot: string | null;
  botUrl: string | null;
  focus: string | null;
  apiKey: string | null;
  provisionedAt: string | null;
  activated?: boolean;
  activationCode?: string | null;
  activateUrl?: string | null;
  hasChat: boolean;
  messages: ChatMsg[];
  userProfile?: string | null;
  credits?: { usedUsd: number; allowanceUsd: number } | null;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function DashCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-border bg-card/90 p-5 shadow-sm backdrop-blur-sm sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

function CardTitle({ Icon, children }: { Icon: React.ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
        <Icon className="size-4" />
      </span>
      <h2 className="text-base font-semibold text-foreground">{children}</h2>
    </div>
  );
}

/**
 * Live Tainá dashboard shown on the owner's profile: bot status, the API key
 * minted from their sign-in, and the observation chat streaming in from
 * Telegram. Polls the session-gated /api/taina/dashboard endpoint.
 */
export function TainaDashboardClient() {
  const t = useTranslations("common.taina.dashboard");
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);
  const [restartFailed, setRestartFailed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetFailed, setResetFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/taina/dashboard", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setData((await response.json()) as DashData);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [data?.messages.length]);

  // Fully disconnect Tainá ("Reset my agent"): revoke the agent key and have
  // the runtime stop the bot and forget it. Observations are never touched;
  // the user can set Tainá up again from scratch afterwards.
  async function resetAgent() {
    if (!window.confirm(t("resetConfirm"))) return;
    setResetting(true);
    setResetFailed(false);
    try {
      const response = await fetch("/api/taina/provision", { method: "DELETE" });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setResetFailed(true);
    } finally {
      setResetting(false);
    }
  }

  // Start a brand-new conversation with Tainá: the runtime forgets the shared
  // history, clears the transcript here, and greets the observer afresh in
  // Telegram.
  async function restartSession() {
    if (!window.confirm(t("restartConfirm"))) return;
    setRestarting(true);
    setRestartFailed(false);
    try {
      const response = await fetch("/api/taina/session", { method: "POST" });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setRestartFailed(true);
    } finally {
      setRestarting(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="max-w-3xl space-y-4 py-6">
        <DashCard>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </DashCard>
        <DashCard>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-4 h-9 w-full rounded-xl" />
        </DashCard>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-3xl py-6">
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t("loadError")}
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (!data.provisioned) {
    return (
      <div className="max-w-3xl py-6">
        <DashCard>
          <CardTitle Icon={BotIcon}>{t("notLinkedTitle")}</CardTitle>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("notLinkedDescription")}</p>
          <Link href="/taina" className={cn(buttonVariants({ size: "lg" }), "mt-5")}>
            {t("setUp")}
          </Link>
        </DashCard>
      </div>
    );
  }

  const needsActivation = data.activated === false;

  return (
    <div className="max-w-3xl space-y-4 py-6">
      {needsActivation && data.activationCode ? (
        <DashCard className="border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2">
            <span className="pulse-dot size-1.5 rounded-full bg-primary" />
            <h2 className="text-base font-semibold text-foreground">{t("activationTitle")}</h2>
          </div>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {t.rich("activationDescription", {
              bot: () => (
                <span className="font-medium text-foreground">{data.bot ?? "Tainá"}</span>
              ),
            })}
          </p>
          <div className="my-4 flex items-center justify-center rounded-2xl border border-dashed border-primary/40 bg-background py-4">
            <span className="select-all font-mono text-2xl font-semibold tracking-[0.3em] text-primary">
              {data.activationCode}
            </span>
          </div>
          {data.activateUrl ? (
            <a className={cn(buttonVariants(), "w-full sm:w-auto")} href={data.activateUrl} target="_blank" rel="noreferrer">
              {t("activationOpen")}
              <ExternalLinkIcon />
            </a>
          ) : null}
        </DashCard>
      ) : null}

      <DashCard className="animate-in">
        <div className="flex items-center justify-between gap-3">
          <CardTitle Icon={BotIcon}>{t("botCardTitle")}</CardTitle>
          {data.bot ? (
            <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
              {data.bot}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {data.focus ? (
            <>
              {t("focus")}: <span className="text-foreground">{data.focus}</span>
              {" · "}
            </>
          ) : null}
          {data.provisionedAt
            ? t("connectedOn", { date: new Date(data.provisionedAt).toLocaleDateString() })
            : null}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {data.botUrl ? (
            <a className={cn(buttonVariants())} href={data.botUrl} target="_blank" rel="noreferrer">
              {t("openInTelegram")}
              <ExternalLinkIcon />
            </a>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={restarting}
            onClick={() => void restartSession()}
          >
            <RotateCcwIcon className={cn(restarting && "animate-spin")} />
            {restarting ? t("restarting") : t("restart")}
          </Button>
        </div>
        {restartFailed ? (
          <p className="mt-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
            {t("restartFailed")}
          </p>
        ) : null}

        {data.credits ? (
          <div className="mt-4 rounded-2xl border border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <WalletIcon className="size-3.5" />
              {t("creditsTitle")}
            </div>
            <p className="mt-1 text-sm text-foreground">
              {t("creditsSummary", {
                used: usd.format(data.credits.usedUsd),
                left: usd.format(Math.max(0, data.credits.allowanceUsd - data.credits.usedUsd)),
              })}
            </p>
          </div>
        ) : null}

        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            disabled={resetting}
            onClick={() => void resetAgent()}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-destructive disabled:opacity-50"
          >
            <UnplugIcon className="size-3.5" />
            {resetting ? t("resetting") : t("resetAgent")}
          </button>
          {resetFailed ? (
            <p className="mt-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
              {t("resetFailed")}
            </p>
          ) : null}
        </div>
      </DashCard>

      <ProfileCard savedProfile={data.userProfile ?? ""} onSaved={load} />

      <ApiKeyCard apiKey={data.apiKey} onChanged={load} />

      <DashCard>
        <div className="flex items-center justify-between gap-3">
          <CardTitle Icon={MessageCircleIcon}>{t("chatTitle")}</CardTitle>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide",
              data.hasChat ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                data.hasChat ? "pulse-dot bg-primary" : "bg-muted-foreground/50",
              )}
            />
            {data.hasChat ? t("chatActive") : t("chatWaiting")}
          </span>
        </div>
        {data.messages.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("chatEmpty")}</p>
        ) : (
          <div ref={scrollRef} className="mt-4 flex max-h-[380px] flex-col gap-2 overflow-y-auto">
            {data.messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  message.role === "user"
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start border border-border bg-secondary text-secondary-foreground",
                )}
              >
                <div className="whitespace-pre-wrap break-words">{message.text}</div>
                <time
                  className={cn(
                    "mt-1 block text-[10px]",
                    message.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground",
                  )}
                >
                  {new Date(message.ts).toLocaleTimeString()}
                </time>
              </div>
            ))}
          </div>
        )}
      </DashCard>
    </div>
  );
}

/**
 * "Your profile" — the USER.md stored with the user's Tainá agent so it knows
 * who they are. Ships a copyable prompt to draft the profile with ChatGPT or
 * Claude, and a Markdown textarea that saves to the agent runtime.
 */
function ProfileCard({ savedProfile, onSaved }: { savedProfile: string; onSaved: () => void }) {
  const t = useTranslations("common.taina.dashboard");
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<null | "saved" | "failed">(null);
  const [promptCopied, setPromptCopied] = useState(false);

  // Seed the editor from the stored profile exactly once — the dashboard
  // polls every few seconds and must never clobber what the user is typing.
  useEffect(() => {
    if (draft === null) setDraft(savedProfile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedProfile]);

  const value = draft ?? savedProfile;
  const dirty = value.trim() !== savedProfile.trim();

  async function save() {
    setSaving(true);
    setSaveState(null);
    try {
      const response = await fetch("/api/taina/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: value.trim() }),
      });
      if (!response.ok) throw new Error();
      setSaveState("saved");
      onSaved();
    } catch {
      setSaveState("failed");
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(t("profilePromptBody"));
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; nothing to recover.
    }
  }

  return (
    <DashCard>
      <CardTitle Icon={UserRoundIcon}>{t("profileTitle")}</CardTitle>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("profileDescription")}</p>

      <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("profilePromptTitle")}
          </h3>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyPrompt()}>
            {promptCopied ? <CheckIcon /> : <CopyIcon />}
            {promptCopied ? t("copied") : t("copy")}
          </Button>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("profilePromptIntro")}</p>
        <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-border bg-background px-3.5 py-3">
          <p className="whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
            {t("profilePromptBody")}
          </p>
        </div>
      </div>

      <label
        htmlFor="taina-user-profile"
        className="mt-5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {t("profileLabel")}
      </label>
      <Textarea
        id="taina-user-profile"
        className="mt-2 min-h-40 rounded-2xl"
        value={value}
        maxLength={TAINA_PROFILE_MAX_CHARS}
        placeholder={t("profilePlaceholder")}
        onChange={(event) => {
          setDraft(event.target.value);
          setSaveState(null);
        }}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {t("profileCounter", {
          count: value.length.toLocaleString(),
          max: TAINA_PROFILE_MAX_CHARS.toLocaleString(),
        })}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={saving || !dirty} onClick={() => void save()}>
          {saving ? t("profileSaving") : t("profileSave")}
        </Button>
        {saveState === "saved" ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-primary">
            <CheckIcon className="size-4" />
            {t("profileSaved")}
          </span>
        ) : null}
      </div>
      {saveState === "failed" ? (
        <p className="mt-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
          {t("profileSaveFailed")}
        </p>
      ) : null}
    </DashCard>
  );
}

function ApiKeyCard({ apiKey, onChanged }: { apiKey: string | null; onChanged: () => void }) {
  const t = useTranslations("common.taina.dashboard");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<null | "regen" | "revoke">(null);
  const [actionFailed, setActionFailed] = useState(false);

  async function act(method: "POST" | "DELETE", kind: "regen" | "revoke") {
    if (kind === "revoke" && !window.confirm(t("revokeConfirm"))) return;
    setBusy(kind);
    setActionFailed(false);
    try {
      const response = await fetch("/api/taina/key", { method });
      if (!response.ok) throw new Error();
      await onChanged();
      setReveal(kind === "regen");
    } catch {
      setActionFailed(true);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; nothing to recover.
    }
  }

  const masked = apiKey ? `${apiKey.slice(0, 12)}${"•".repeat(18)}` : "";

  return (
    <DashCard>
      <div className="flex items-center justify-between gap-3">
        <CardTitle Icon={KeyRoundIcon}>{t("apiKeyTitle")}</CardTitle>
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {apiKey ? t("active") : t("revoked")}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("apiKeyDescription")}</p>

      {apiKey ? (
        <>
          <div className="mt-4 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-muted/60 px-3 py-2 font-mono text-xs text-foreground">
              {reveal ? apiKey : masked}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? t("hide") : t("reveal")}
            >
              {reveal ? <EyeOffIcon /> : <EyeIcon />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={copy}
              aria-label={copied ? t("copied") : t("copy")}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => act("POST", "regen")}
            >
              <RefreshCwIcon />
              {busy === "regen" ? t("regenerating") : t("regenerate")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy !== null}
              onClick={() => act("DELETE", "revoke")}
            >
              <Trash2Icon />
              {busy === "revoke" ? t("revoking") : t("revoke")}
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" className="mt-4" disabled={busy !== null} onClick={() => act("POST", "regen")}>
          {busy === "regen" ? t("generating") : t("generate")}
        </Button>
      )}
      {actionFailed ? (
        <p className="mt-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
          {t("keyActionFailed")}
        </p>
      ) : null}
    </DashCard>
  );
}
