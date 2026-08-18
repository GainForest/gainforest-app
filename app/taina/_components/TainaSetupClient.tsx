"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  ExternalLinkIcon,
  LayoutDashboardIcon,
  LockIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";
import { AuthModal } from "@/app/_components/AuthFlow";
import { accountTainaPath } from "@/app/account/_lib/account-route";

type Provisioned = {
  agentId?: string;
  botUrl?: string;
  botUsername?: string;
  activationCode?: string;
  activateUrl?: string;
};

// Shape of the bits of /api/taina/dashboard we need to detect an existing bot
// and its activation state.
type DashStatus = {
  provisioned: boolean;
  bot: string | null;
  botUrl: string | null;
  activated?: boolean;
  activationCode?: string | null;
  activateUrl?: string | null;
};

const BOT_TOKEN_RE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;

// Error codes the /api/taina routes return; anything else is a message from
// the agent runtime and is shown as-is.
const ERROR_KEYS: Record<string, "invalidToken" | "genericError" | "runtimeUnreachable"> = {
  invalid_token: "invalidToken",
  invalid_body: "genericError",
  provision_failed: "genericError",
  not_signed_in: "genericError",
  runtime_unreachable: "runtimeUnreachable",
};

function SetupCard({ children, className }: { children: ReactNode; className?: string }) {
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

export function TainaSetupClient({
  signedIn,
  handle,
  did,
}: {
  signedIn: boolean;
  handle: string | null;
  did: string | null;
}) {
  if (!signedIn || !did) return <SignInCard />;
  return <ConnectFlow did={did} handle={handle} />;
}

/* ------------------------------- signed out ------------------------------ */

// The setup page rides on the normal bumicerts sign-in: no separate Tainá
// login, just the same auth modal used everywhere else in the app.
function SignInCard() {
  const t = useTranslations("common.taina.signIn");
  const { pushModal, show } = useModal();

  const handleSignIn = () => {
    pushModal({ id: "auth-modal", content: <AuthModal /> });
    show();
  };

  return (
    <SetupCard>
      <div className="flex size-10 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
        <LockIcon className="size-4.5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("description")}</p>
      <Button type="button" size="lg" className="mt-5 w-full" onClick={handleSignIn}>
        {t("button")}
        <ArrowRightIcon />
      </Button>
    </SetupCard>
  );
}

/* -------------------------------- signed in ------------------------------ */

function ConnectFlow({ did, handle }: { did: string; handle: string | null }) {
  const t = useTranslations("common.taina");
  const [botToken, setBotToken] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Provisioned | null>(null);
  const [status, setStatus] = useState<DashStatus | null>(null);
  const [checking, setChecking] = useState(true);

  // A user runs a single Tainá bot. Check on mount whether this account
  // already has one linked so we can show it instead of the connect form.
  useEffect(() => {
    let alive = true;
    fetch("/api/taina/dashboard", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: DashStatus | null) => {
        if (alive && data) setStatus(data);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const token = botToken.trim();
    if (!BOT_TOKEN_RE.test(token)) {
      setError(t("errors.invalidToken"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/taina/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token, focus: focus.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = typeof data.error === "string" ? data.error : "";
        const key = ERROR_KEYS[code];
        throw new Error(key ? t(`errors.${key}`) : code || t("errors.genericError"));
      }
      setResult(data as Provisioned);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.genericError"));
    } finally {
      setBusy(false);
    }
  }

  // A freshly connected bot (or an existing one that was never claimed) stays
  // private until the owner sends its one-time code — surface that step first.
  const activation = result?.activationCode
    ? { code: result.activationCode, activateUrl: result.activateUrl ?? null }
    : status?.provisioned && status.activated === false && status.activationCode
      ? { code: status.activationCode, activateUrl: status.activateUrl ?? null }
      : null;

  if (activation) {
    return <ActivationCard did={did} handle={handle} code={activation.code} activateUrl={activation.activateUrl} />;
  }

  const linked = result
    ? { bot: atHandle(result.botUsername), botUrl: result.botUrl ?? null }
    : status?.provisioned && status.activated
      ? { bot: atHandle(status.bot), botUrl: status.botUrl }
      : null;

  if (linked) {
    return <LinkedCard did={did} handle={handle} bot={linked.bot} botUrl={linked.botUrl} justLinked={Boolean(result)} />;
  }

  // Still checking for an existing bot — hold a skeleton so the connect form
  // never flashes for someone who's already set up.
  if (checking) {
    return (
      <SetupCard>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <Skeleton className="mt-6 h-11 w-full rounded-full" />
      </SetupCard>
    );
  }

  return (
    <SetupCard>
      <form onSubmit={onSubmit}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">{t("setup.title")}</h2>
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
            <BotIcon className="size-4" />
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("setup.description")}</p>

        <details className="mt-4 rounded-2xl border border-border/70 bg-muted/50 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">{t("setup.howTitle")}</summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li>
              {t.rich("setup.howStep1", {
                botfather: (chunks) => (
                  <a
                    className="text-primary underline-offset-2 hover:underline"
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </li>
            <li>
              {t.rich("setup.howStep2", {
                code: (chunks) => (
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{chunks}</code>
                ),
              })}
            </li>
            <li>{t("setup.howStep3")}</li>
            <li>{t("setup.howStep4")}</li>
          </ol>
        </details>

        <div className="mt-5 space-y-1.5">
          <Label htmlFor="taina-bot-token">{t("setup.tokenLabel")}</Label>
          <Input
            id="taina-bot-token"
            className="font-mono"
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="123456789:ABCdefGhIJKlmNoPQRstuVwxyz"
            value={botToken}
            onChange={(event) => setBotToken(event.target.value)}
            required
          />
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="taina-focus">
            {t("setup.focusLabel")}{" "}
            <span className="font-normal text-muted-foreground">({t("setup.focusOptional")})</span>
          </Label>
          <Input
            id="taina-focus"
            type="text"
            placeholder={t("setup.focusPlaceholder")}
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
          />
        </div>

        <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy || !botToken.trim()}>
          {busy ? t("setup.submitting") : t("setup.submit")}
        </Button>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </form>
    </SetupCard>
  );
}

/** Normalise a Telegram bot username to an @-prefixed handle for display. */
function atHandle(name: string | null | undefined): string {
  const value = (name ?? "").trim();
  if (!value) return "@taina";
  return value.startsWith("@") ? value : `@${value}`;
}

/** Activation step: show the one-time code + a deep link that sends it. */
function ActivationCard({
  did,
  handle,
  code,
  activateUrl,
}: {
  did: string;
  handle: string | null;
  code: string;
  activateUrl: string | null;
}) {
  const t = useTranslations("common.taina.activation");
  const dashboardT = useTranslations("common.taina.linked");
  return (
    <SetupCard className="animate-in">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("description")}</p>
      <div className="my-5 flex items-center justify-center rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-4">
        <span className="select-all font-mono text-2xl font-semibold tracking-[0.3em] text-primary">{code}</span>
      </div>
      {activateUrl ? (
        <a
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
          href={activateUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t("open")}
          <ExternalLinkIcon />
        </a>
      ) : null}
      <Link
        href={accountTainaPath(handle?.trim() || did)}
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-2.5 w-full")}
      >
        <LayoutDashboardIcon />
        {dashboardT("dashboard")}
      </Link>
      <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">{t("hint")}</p>
    </SetupCard>
  );
}

/** Compact "already linked" card: bot handle + open button + dashboard link. */
function LinkedCard({
  did,
  handle,
  bot,
  botUrl,
  justLinked,
}: {
  did: string;
  handle: string | null;
  bot: string;
  botUrl: string | null;
  justLinked?: boolean;
}) {
  const t = useTranslations("common.taina.linked");
  return (
    <SetupCard className="animate-in">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          {justLinked ? t("justLinkedTitle") : t("title")}
        </h2>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-primary">
          <span className="pulse-dot size-1.5 rounded-full bg-primary" />
          {t("badge")}
        </span>
      </div>
      {justLinked ? (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-primary/15 bg-primary/5 px-3.5 py-2.5 text-sm text-foreground">
          <CheckIcon className="size-4 shrink-0 text-primary" />
          {t("justLinkedNote")}
        </div>
      ) : null}
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {t.rich("description", {
          bot: () => <span className="font-medium text-foreground">{bot}</span>,
        })}
      </p>
      {botUrl ? (
        <a
          className={cn(buttonVariants({ size: "lg" }), "mt-5 w-full")}
          href={botUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t("openBot", { bot })}
          <ExternalLinkIcon />
        </a>
      ) : null}
      <Link
        href={accountTainaPath(handle?.trim() || did)}
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-2.5 w-full")}
      >
        <LayoutDashboardIcon />
        {t("dashboard")}
      </Link>
    </SetupCard>
  );
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
      {children}
    </div>
  );
}
