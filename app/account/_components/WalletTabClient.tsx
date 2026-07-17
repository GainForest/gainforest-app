"use client";

/**
 * WalletTabClient — the owner's personal donation wallet, shown on the
 * private Wallet tab of their own profile.
 *
 * The wallet is a Splits smart account whose address is derived
 * deterministically from the account and its founding passkeys (see
 * lib/splits-vault/shared.ts — the same derivation organizations use). The
 * owner creates it with one passkey and can enroll more passkeys (another
 * device, a trusted person's key) while the wallet has not been activated
 * on-chain; once active, signers are managed on-chain and this page becomes
 * read-only. All server actions run against /api/wallet, which always
 * operates on the signed-in user's own repo.
 */

import Image from "next/image";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { blo } from "blo";
import { useTranslations } from "next-intl";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FingerprintIcon,
  Loader2Icon,
  LockIcon,
  ShieldCheckIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createVaultPasskey, isPasskeySupported } from "@/lib/splits-vault/passkey";
import type { SplitsVaultRecord, VaultPasskeySigner } from "@/lib/splits-vault/shared";
import type { AuthSession } from "@/app/_lib/auth";
import { cn } from "@/lib/utils";

type WalletState = {
  exists: boolean;
  viewerRole?: "owner" | "admin" | "member";
  record?: SplitsVaultRecord;
  uri?: string;
  deployed?: boolean;
};

type OrganizationWalletContext = {
  did: string;
  name: string;
};

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const json = (await response.json().catch(() => null)) as { error?: string } | null;
  return json?.error || fallback;
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-border bg-card/90 p-5 shadow-sm backdrop-blur-sm sm:p-6", className)}>
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

export function WalletTabClient({ organization }: { organization?: OrganizationWalletContext } = {}) {
  const personalT = useTranslations("common.accountWallet");
  const organizationT = useTranslations("modals.orgWallet");
  const t = organization ? organizationT : personalT;

  const [viewer, setViewer] = useState<{ did: string | null; handle: string | null }>({ did: null, handle: null });
  const [state, setState] = useState<WalletState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newSignerLabel, setNewSignerLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { session?: AuthSession } | null) => {
        if (!cancelled && json?.session?.isLoggedIn) {
          setViewer({ did: json.session.did ?? null, handle: json.session.handle ?? null });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch(
        organization ? `/api/org-wallet?repo=${encodeURIComponent(organization.did)}` : "/api/wallet",
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response, t("loadError")));
      setState((await response.json()) as WalletState);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("loadError"));
    }
  }, [organization, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyAddress = async () => {
    const address = state?.record?.address;
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the address is still visible to copy manually.
    }
  };

  const runAction = async (action: () => Promise<Response>, fallbackError: string) => {
    if (isBusy) return;
    setIsBusy(true);
    setActionError(null);
    try {
      const response = await action();
      if (!response.ok) throw new Error(await readError(response, fallbackError));
      await load();
      window.dispatchEvent(new Event("gainforest:wallet-changed"));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : fallbackError);
    } finally {
      setIsBusy(false);
    }
  };

  const withPasskey = async (
    send: (passkey: { credentialId: string; publicKeyX: string; publicKeyY: string; label?: string }) => Promise<Response>,
    fallbackError: string,
    label?: string,
  ) => {
    if (!isPasskeySupported()) {
      setActionError(t("passkeyUnsupported"));
      return;
    }
    await runAction(async () => {
      const passkeyName = organization
        ? t("passkeyLabel", { org: organization.name })
        : viewer.handle
          ? t("passkeyLabel", { name: viewer.handle })
          : t("passkeyLabelFallback");
      const passkey = await createVaultPasskey(passkeyName);
      const signerLabel = label?.trim() || viewer.handle || undefined;
      return send({ ...passkey, ...(signerLabel ? { label: signerLabel } : {}) });
    }, fallbackError);
  };

  const handleCreate = () =>
    withPasskey(
      (passkey) =>
        fetch(organization ? "/api/org-wallet" : "/api/wallet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(organization ? { repo: organization.did, name: organization.name, passkey } : { passkey }),
        }),
      t("createError"),
    );

  const handleAddPasskey = () =>
    withPasskey(
      (passkey) =>
        fetch(organization ? "/api/org-wallet" : "/api/wallet", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(organization ? { repo: organization.did, passkey } : { passkey }),
        }).then((response) => {
          if (response.ok) setNewSignerLabel("");
          return response;
        }),
      t("addSignerError"),
      newSignerLabel,
    );

  const handleRemoveSigner = (signer: VaultPasskeySigner) =>
    runAction(
      () =>
        fetch(organization ? "/api/org-wallet" : "/api/wallet", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            organization
              ? { repo: organization.did, remove: { credentialId: signer.credentialId } }
              : { remove: { credentialId: signer.credentialId } },
          ),
        }),
      t("removeSignerError"),
    );

  const handleDelete = () =>
    runAction(
      () => fetch(organization ? "/api/org-wallet" : "/api/wallet", {
        method: "DELETE",
        headers: organization ? { "content-type": "application/json" } : undefined,
        body: organization ? JSON.stringify({ repo: organization.did }) : undefined,
      }),
      t("deleteError"),
    );

  // ── Derived ────────────────────────────────────────────────────────────────

  const record = state?.record;
  const deployed = state?.deployed === true;
  const canManageWallet = !organization || state?.viewerRole === "owner" || state?.viewerRole === "admin";
  const canEditSigners = !!record && !deployed;
  const canRemoveSigner = (signer: VaultPasskeySigner) =>
    canEditSigners && (!organization || canManageWallet || signer.memberDid === viewer.did);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-6">
      <header className="space-y-1 px-1">
        <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </header>

      {!state && !loadError ? (
        <Card>
          <div className="space-y-3">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-2/3 rounded-full" />
          </div>
        </Card>
      ) : loadError ? (
        <Card>
          <p className="py-4 text-center text-sm text-destructive">{loadError}</p>
        </Card>
      ) : !record ? (
        /* ── No wallet yet ───────────────────────────────────────────────── */
        <Card>
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <WalletIcon className="size-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
              <p className="mx-auto max-w-sm text-xs text-muted-foreground">{t("emptyHint")}</p>
            </div>
            {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
            {canManageWallet ? (
              <Button className="w-full sm:w-auto" onClick={() => void handleCreate()} disabled={isBusy}>
                {isBusy ? <Loader2Icon className="size-3.5 animate-spin" /> : <FingerprintIcon className="size-3.5" />}
                {isBusy ? t("creating") : t("createButton")}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{organizationT("onlyOwnerCanCreate")}</p>
            )}
          </div>
        </Card>
      ) : (
        /* ── Wallet exists ───────────────────────────────────────────────── */
        <>
          <Card>
            <CardTitle Icon={WalletIcon}>{record.name || t("defaultName")}</CardTitle>
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted px-3 py-3">
              <Image src={blo(record.address)} alt="" width={40} height={40} className="shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{shortAddress(record.address)}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void copyAddress()}
                  className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t("copyAddress")}
                >
                  {copied ? <CheckIcon className="size-3 text-primary" aria-hidden /> : <CopyIcon className="size-3" aria-hidden />}
                  {copied ? t("copied") : t("copy")}
                </button>
                <a
                  href={`https://etherscan.io/address/${record.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t("viewOnExplorer")}
                >
                  <ExternalLinkIcon className="size-3" aria-hidden />
                  {t("explorer")}
                </a>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
              <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground">{deployed ? t("activeHint") : t("readyHint")}</p>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <CardTitle Icon={FingerprintIcon}>{t("signersHeading")}</CardTitle>
              {deployed ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <LockIcon className="size-3" aria-hidden />
                  {t("signersLocked")}
                </span>
              ) : null}
            </div>
            <div className="mt-4 flex flex-col gap-0.5 rounded-xl bg-muted p-1">
              {record.signers.map((signer) => (
                <div key={signer.credentialId} className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2">
                  <FingerprintIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm leading-snug">
                    {signer.label || t("unnamedPasskey")}
                  </span>
                  {canRemoveSigner(signer) && record.signers.length > 1 ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleRemoveSigner(signer)}
                      disabled={isBusy}
                      aria-label={t("removeSigner")}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            {canEditSigners ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={newSignerLabel}
                    onChange={(event) => setNewSignerLabel(event.target.value)}
                    placeholder={t("signerLabelPlaceholder")}
                    maxLength={80}
                    disabled={isBusy}
                    className="sm:flex-1"
                  />
                  <Button variant="outline" onClick={() => void handleAddPasskey()} disabled={isBusy}>
                    {isBusy ? <Loader2Icon className="size-3.5 animate-spin" /> : <FingerprintIcon className="size-3.5" />}
                    {t("addPasskey")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("signersHint")}</p>
              </div>
            ) : null}
          </Card>

          {actionError ? <p className="px-1 text-sm text-destructive">{actionError}</p> : null}

          {!deployed && canManageWallet ? (
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-destructive"
              onClick={() => void handleDelete()}
              disabled={isBusy}
            >
              <Trash2Icon className="size-3.5" />
              {t("deleteButton")}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
