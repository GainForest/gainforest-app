"use client";

/**
 * OrgWalletModal — the organization's donation wallet.
 *
 * The wallet is a Splits smart account whose address is derived
 * deterministically from the organization and its founding passkeys
 * (see lib/splits-vault/shared.ts). Available actions are gated by the
 * viewer's role in the organization:
 *
 *   • owner            → create the wallet with their passkey, remove signers,
 *                        remove an unused wallet
 *   • admin            → remove signers
 *   • any member       → add their own passkey as a signer, remove their own
 *   • everyone         → see the address and signer list
 *
 * While the wallet has not been activated on-chain the signer set can change
 * freely (the address is re-derived). Once active, changes happen on-chain
 * and this modal becomes read-only.
 */

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { blo } from "blo";
import { useTranslations } from "next-intl";
import { useModal } from "@/components/ui/modal/context";
import { Button } from "@/components/ui/button";
import {
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { createVaultPasskey, isPasskeySupported } from "@/lib/splits-vault/passkey";
import type { SplitsVaultRecord, VaultPasskeySigner } from "@/lib/splits-vault/shared";
import type { AuthSession } from "@/app/_lib/auth";
import {
  CheckIcon,
  CopyIcon,
  FingerprintIcon,
  Loader2Icon,
  LockIcon,
  ShieldCheckIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react";

type VaultState = {
  exists: boolean;
  viewerRole: "owner" | "admin" | "member";
  record?: SplitsVaultRecord;
  uri?: string;
  deployed?: boolean;
};

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function useViewerSession(): { did: string | null; handle: string | null } {
  const [viewer, setViewer] = useState<{ did: string | null; handle: string | null }>({ did: null, handle: null });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { session?: AuthSession } | null) => {
        const session = json?.session;
        if (!cancelled && session?.isLoggedIn) {
          setViewer({ did: session.did ?? null, handle: session.handle ?? null });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return viewer;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const json = (await response.json().catch(() => null)) as { error?: string } | null;
  return json?.error || fallback;
}

export interface OrgWalletModalProps {
  /** The organization DID (the repo the vault record lives in). */
  orgDid: string;
  /** Plain-language organization name for the passkey label. */
  orgName?: string;
  onBack: () => void | Promise<void>;
  /** Called whenever the vault record changed (created / signers / removed). */
  onChanged?: (uri: string | null) => void;
}

export function OrgWalletModal({ orgDid, orgName, onBack, onChanged }: OrgWalletModalProps) {
  const t = useTranslations("modals.orgWallet");
  const { stack, hide, popModal } = useModal();
  const viewer = useViewerSession();

  const [state, setState] = useState<VaultState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch(`/api/org-wallet?repo=${encodeURIComponent(orgDid)}`);
      if (!response.ok) throw new Error(await readError(response, t("loadError")));
      setState((await response.json()) as VaultState);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("loadError"));
    }
  }, [orgDid, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBack = () => {
    if (stack.length === 1) {
      hide().then(() => popModal());
    } else {
      onBack();
    }
  };

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
      const json = (await response.json().catch(() => null)) as { uri?: string; deleted?: boolean } | null;
      await load();
      onChanged?.(json?.deleted ? null : (json?.uri ?? null));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : fallbackError);
    } finally {
      setIsBusy(false);
    }
  };

  const withPasskey = async (send: (passkey: { credentialId: string; publicKeyX: string; publicKeyY: string; label?: string }) => Promise<Response>, fallbackError: string) => {
    if (!isPasskeySupported()) {
      setActionError(t("passkeyUnsupported"));
      return;
    }
    await runAction(async () => {
      const passkey = await createVaultPasskey(orgName ? t("passkeyLabel", { org: orgName }) : t("passkeyLabelFallback"));
      return send({ ...passkey, ...(viewer.handle ? { label: viewer.handle } : {}) });
    }, fallbackError);
  };

  const handleCreate = () =>
    withPasskey(
      (passkey) =>
        fetch("/api/org-wallet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo: orgDid, ...(orgName ? { name: orgName } : {}), passkey }),
        }),
      t("createError"),
    );

  const handleAddMyPasskey = () =>
    withPasskey(
      (passkey) =>
        fetch("/api/org-wallet", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo: orgDid, passkey }),
        }),
      t("addSignerError"),
    );

  const handleRemoveSigner = (signer: VaultPasskeySigner) =>
    runAction(
      () =>
        fetch("/api/org-wallet", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo: orgDid, remove: { credentialId: signer.credentialId } }),
        }),
      t("removeSignerError"),
    );

  const handleDelete = () =>
    runAction(
      () =>
        fetch("/api/org-wallet", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo: orgDid }),
        }),
      t("deleteError"),
    );

  // ── Derived ────────────────────────────────────────────────────────────────

  const record = state?.record;
  const role = state?.viewerRole;
  const deployed = state?.deployed === true;
  const viewerIsSigner = !!record && !!viewer.did && record.signers.some((signer) => signer.memberDid === viewer.did);
  const canManageVault = role === "owner" || role === "admin";
  const canRemove = (signer: VaultPasskeySigner) =>
    !deployed && (role === "owner" || role === "admin" || signer.memberDid === viewer.did) && record!.signers.length > 1;

  return (
    <ModalContent dismissible={!isBusy}>
      <ModalHeader backAction={isBusy ? undefined : handleBack}>
        <ModalTitle>{t("title")}</ModalTitle>
        <ModalDescription>{t("description")}</ModalDescription>
      </ModalHeader>

      <div className="flex flex-col gap-4 pt-1">
        {!state && !loadError ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive text-center py-6">{loadError}</p>
        ) : !record ? (
          /* ── No wallet yet ─────────────────────────────────────────────── */
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <WalletIcon className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
              <p className="text-xs text-muted-foreground max-w-sm">{t("emptyHint")}</p>
            </div>
            {actionError ? <p className="text-sm text-destructive text-center">{actionError}</p> : null}
            {canManageVault ? (
              <Button className="w-full" onClick={() => void handleCreate()} disabled={isBusy}>
                {isBusy ? <Loader2Icon className="size-3.5 animate-spin" /> : <FingerprintIcon className="size-3.5" />}
                {isBusy ? t("creating") : t("createButton")}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground text-center">{t("onlyOwnerCanCreate")}</p>
            )}
          </div>
        ) : (
          /* ── Wallet exists ─────────────────────────────────────────────── */
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-3">
              <Image src={blo(record.address)} alt="" width={40} height={40} className="rounded-full shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium leading-snug truncate">{record.name || t("defaultName")}</span>
                <span className="text-xs text-muted-foreground font-mono leading-snug">{shortAddress(record.address)}</span>
              </div>
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="flex shrink-0 items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("copyAddress")}
              >
                {copied ? <CheckIcon className="size-3 text-primary" aria-hidden /> : <CopyIcon className="size-3" aria-hidden />}
                {copied ? t("copied") : t("copy")}
              </button>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
              <ShieldCheckIcon className="size-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{deployed ? t("activeHint") : t("readyHint")}</p>
            </div>

            {/* Signers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("signersHeading")}</h3>
                {deployed ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <LockIcon className="size-3" aria-hidden />
                    {t("signersLocked")}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-0.5 rounded-xl bg-muted p-1">
                {record.signers.map((signer) => (
                  <div key={signer.credentialId} className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2">
                    <FingerprintIcon className="size-4 text-muted-foreground shrink-0" aria-hidden />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm leading-snug truncate">
                        {signer.label || `${signer.memberDid.slice(0, 14)}…`}
                        {signer.memberDid === viewer.did ? <span className="text-xs text-muted-foreground"> · {t("you")}</span> : null}
                      </span>
                    </div>
                    {canRemove(signer) ? (
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
              {!deployed && !viewerIsSigner ? (
                <Button variant="outline" className="w-full" onClick={() => void handleAddMyPasskey()} disabled={isBusy}>
                  {isBusy ? <Loader2Icon className="size-3.5 animate-spin" /> : <FingerprintIcon className="size-3.5" />}
                  {t("addMyPasskey")}
                </Button>
              ) : null}
              {!deployed ? <p className="text-xs text-muted-foreground">{t("signersHint")}</p> : null}
            </div>

            {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

            {canManageVault && !deployed ? (
              <Button variant="ghost" className="w-full text-muted-foreground hover:text-destructive" onClick={() => void handleDelete()} disabled={isBusy}>
                <Trash2Icon className="size-3.5" />
                {t("deleteButton")}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </ModalContent>
  );
}
