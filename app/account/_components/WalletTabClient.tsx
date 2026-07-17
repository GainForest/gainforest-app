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
import { useFormatter, useTranslations } from "next-intl";
import {
  CheckCircle2Icon,
  CheckIcon,
  CoinsIcon,
  CopyIcon,
  ExternalLinkIcon,
  FingerprintIcon,
  Loader2Icon,
  SendIcon,
  ShieldCheckIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createVaultPasskey, isPasskeySupported, signVaultUserOp } from "@/lib/splits-vault/passkey";
import type {
  PendingSendRecord,
  SplitsVaultRecord,
  VaultLiveSigner,
  VaultSignerSet,
} from "@/lib/splits-vault/shared";
import {
  WALLET_TOKENS,
  formatTokenUnits,
  getWalletToken,
  parseTokenUnits,
  type WalletBalances,
  type WalletTokenSymbol,
} from "@/lib/splits-vault/tokens";
import type { AuthSession } from "@/app/_lib/auth";
import { cn } from "@/lib/utils";

type WalletState = {
  exists: boolean;
  viewerRole?: "owner" | "admin" | "member";
  record?: SplitsVaultRecord;
  uri?: string;
  deployed?: boolean;
  holdsFunds?: boolean;
  balances?: WalletBalances | null;
  pendingSend?: PendingSendRecord | null;
  /** The CURRENT signer set (on-chain when deployed). */
  signerSet?: VaultSignerSet | null;
};

type ManageActionPayload =
  | {
      type: "addSigner";
      passkey: { credentialId: string; publicKeyX: string; publicKeyY: string; label?: string };
    }
  | { type: "removeSigner"; signerIndex: number }
  | { type: "setThreshold"; threshold: number };

const TOKEN_COLORS: Record<WalletTokenSymbol, string> = {
  USDC: "#2775CA",
  USDT: "#26A17B",
  ETH: "#627EEA",
};

const TOKEN_DISPLAY_DECIMALS: Record<WalletTokenSymbol, number> = {
  USDC: 2,
  USDT: 2,
  ETH: 5,
};

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

type SendPhase = "idle" | "preparing" | "signing" | "submitting";

function TokenBadge({ symbol }: { symbol: WalletTokenSymbol }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: TOKEN_COLORS[symbol] }}
    >
      {symbol === "ETH" ? "\u039E" : "$"}
    </span>
  );
}

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

class SendRequestError extends Error {
  constructor(public readonly code?: string) {
    super(code || "send_failed");
    this.name = "SendRequestError";
  }
}

export function WalletTabClient({ organization }: { organization?: OrganizationWalletContext } = {}) {
  const personalT = useTranslations("common.accountWallet");
  const organizationT = useTranslations("modals.orgWallet");
  const t = organization ? organizationT : personalT;
  const format = useFormatter();

  const [viewer, setViewer] = useState<{ did: string | null; handle: string | null }>({ did: null, handle: null });
  const [state, setState] = useState<WalletState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newSignerLabel, setNewSignerLabel] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [sendToken, setSendToken] = useState<WalletTokenSymbol>("USDC");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  const [pendingBusy, setPendingBusy] = useState<"approve" | "finalize" | "cancel" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentTxHash, setSentTxHash] = useState<string | null>(null);
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageApproval, setManageApproval] = useState<{ current: number; total: number } | null>(null);

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

  const handleRemoveSigner = (credentialId: string) =>
    runAction(
      () =>
        fetch(organization ? "/api/org-wallet" : "/api/wallet", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            organization ? { repo: organization.did, remove: { credentialId } } : { remove: { credentialId } },
          ),
        }),
      t("removeSignerError"),
    );

  // ── Sending funds ─────────────────────────────────────────────────────────

  const sendErrorForCode = (code?: string): string => {
    switch (code) {
      case "not_configured":
        return t("sendErrorNotConfigured");
      case "insufficient_balance":
        return t("sendErrorInsufficient");
      case "network_busy":
        return t("sendErrorBusy");
      case "signature_rejected":
        return t("sendErrorSignature");
      case "no_signer":
        return t("sendNoSigner");
      case "expired":
        return t("sendErrorExpired");
      case "pending_exists":
        return t("sendErrorPendingExists");
      case "approval_invalid":
        return t("sendErrorApprovalInvalid");
      case "cancel_forbidden":
        return t("pendingCancelForbidden");
      case "manage_forbidden":
        return t("manageForbidden");
      default:
        return t("sendErrorGeneric");
    }
  };

  const sendRequest = async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch(organization ? "/api/org-wallet/send" : "/api/wallet/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(organization ? { repo: organization.did, ...payload } : payload),
    });
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) throw new SendRequestError(typeof json?.code === "string" ? json.code : undefined);
    if (!json) throw new SendRequestError();
    return json;
  };

  const handleSend = async () => {
    if (sendPhase !== "idle" || isBusy || !state?.record) return;
    setSendError(null);
    setSentTxHash(null);

    const token = getWalletToken(sendToken);
    if (!token) return;
    const to = sendTo.trim();
    if (!ADDRESS_PATTERN.test(to)) {
      setSendError(t("sendRecipientInvalid"));
      return;
    }
    const amountUnits = parseTokenUnits(sendAmount, token.decimals);
    if (amountUnits === null || amountUnits <= 0n) {
      setSendError(t("sendAmountInvalid"));
      return;
    }
    const balance = state.balances?.tokens.find((entry) => entry.symbol === sendToken);
    if (balance && amountUnits > BigInt(balance.units)) {
      setSendError(t("sendAmountTooHigh"));
      return;
    }
    if (!isPasskeySupported()) {
      setSendError(t("passkeyUnsupported"));
      return;
    }

    try {
      setSendPhase("preparing");
      const prepared = await sendRequest({ step: "prepare", token: sendToken, to, amountUnits: amountUnits.toString() });
      const hash = prepared.hash as `0x${string}` | undefined;
      const lightHash = prepared.lightHash as `0x${string}` | undefined;
      const threshold = typeof prepared.threshold === "number" && prepared.threshold >= 1 ? prepared.threshold : 1;
      const myCredentialIds = (prepared.credentialIds as string[] | undefined) ?? [];
      if (!hash || myCredentialIds.length === 0) throw new SendRequestError();
      if (threshold > 1 && !lightHash) throw new SendRequestError();

      // One approval is signed here. With a single-passkey wallet the full
      // hash is signed and the transfer settles immediately; with a
      // multi-approval wallet the LIGHT hash is signed and the transfer is
      // stored so the remaining passkey holders can approve — on this device
      // or remotely from their own.
      setSendPhase("signing");
      let signature: Awaited<ReturnType<typeof signVaultUserOp>>;
      try {
        signature = await signVaultUserOp(threshold > 1 ? (lightHash as `0x${string}`) : hash, myCredentialIds);
      } catch {
        // The user closed or cancelled the passkey prompt — not an error.
        return;
      }

      setSendPhase("submitting");
      if (threshold > 1) {
        await sendRequest({ step: "start", userOp: prepared.userOp, signature });
        setSendAmount("");
        setSendTo("");
        await load();
        return;
      }

      const submitted = await sendRequest({ step: "submit", userOp: prepared.userOp, signatures: [signature] });
      const transactionHash = submitted.transactionHash as string | undefined;
      if (!transactionHash) throw new SendRequestError();

      setSentTxHash(transactionHash);
      setSendAmount("");
      await load();
      window.dispatchEvent(new Event("gainforest:wallet-changed"));
    } catch (err) {
      setSendError(sendErrorForCode(err instanceof SendRequestError ? err.code : undefined));
    } finally {
      setSendPhase("idle");
    }
  };

  // ── Pending transfer (remote approvals) ───────────────────────────────

  const handlePendingApproval = async (final: boolean) => {
    const record = state?.record;
    const pending = state?.pendingSend;
    if (pendingBusy || sendPhase !== "idle" || !record || !pending) return;
    setSendError(null);
    setSentTxHash(null);
    if (!isPasskeySupported()) {
      setSendError(t("passkeyUnsupported"));
      return;
    }
    // Any enrolled passkey that has not approved yet may sign.
    const used = new Set(pending.approvals.map((approval) => approval.credentialId));
    const pool = liveSigners
      .filter((signer) => signer.credentialId && !used.has(signer.credentialId))
      .map((signer) => signer.credentialId as string);
    if (pool.length === 0) return;

    setPendingBusy(final ? "finalize" : "approve");
    try {
      let signature: Awaited<ReturnType<typeof signVaultUserOp>>;
      try {
        signature = await signVaultUserOp(final ? pending.hash : pending.lightHash, pool);
      } catch {
        return; // cancelled passkey prompt
      }
      const result = await sendRequest({ step: final ? "finalize" : "approve", signature });
      if (final) {
        const transactionHash = result.transactionHash as string | undefined;
        if (!transactionHash) throw new SendRequestError();
        setSentTxHash(transactionHash);
        window.dispatchEvent(new Event("gainforest:wallet-changed"));
      }
      await load();
    } catch (err) {
      setSendError(sendErrorForCode(err instanceof SendRequestError ? err.code : undefined));
      await load();
    } finally {
      setPendingBusy(null);
    }
  };

  const handlePendingCancel = async () => {
    if (pendingBusy || sendPhase !== "idle" || !state?.pendingSend) return;
    setSendError(null);
    setPendingBusy("cancel");
    try {
      await sendRequest({ step: "cancel" });
      await load();
    } catch (err) {
      setSendError(sendErrorForCode(err instanceof SendRequestError ? err.code : undefined));
    } finally {
      setPendingBusy(null);
    }
  };

  const handleSetThreshold = (value: string) => {
    const threshold = Number(value);
    if (!state?.record || !Number.isInteger(threshold) || threshold === state.record.threshold) return;
    void runAction(
      () =>
        fetch(organization ? "/api/org-wallet" : "/api/wallet", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(organization ? { repo: organization.did, threshold } : { threshold }),
        }),
      t("thresholdUpdateError"),
    );
  };

  // ── On-chain signer management (deployed or funded wallets) ───────────────

  /**
   * Run one signer-set change on-chain: prepare the self-call operation,
   * collect the required passkey approvals one after another (light hash for
   * all but the last, full hash last), then submit. Gas is sponsored.
   */
  const runManageAction = async (action: ManageActionPayload) => {
    if (manageBusy || isBusy || sendBusy || pendingBusy) return;
    setManageError(null);
    if (!isPasskeySupported()) {
      setManageError(t("passkeyUnsupported"));
      return;
    }
    setManageBusy(true);
    try {
      const prepared = await sendRequest({ step: "prepareManage", action });
      const hash = prepared.hash as `0x${string}` | undefined;
      const lightHash = prepared.lightHash as `0x${string}` | undefined;
      const threshold = typeof prepared.threshold === "number" && prepared.threshold >= 1 ? prepared.threshold : 1;
      const allCredentialIds = (prepared.allCredentialIds as string[] | undefined) ?? [];
      if (!hash || allCredentialIds.length === 0) throw new SendRequestError();
      if (threshold > 1 && !lightHash) throw new SendRequestError();

      const collected: Awaited<ReturnType<typeof signVaultUserOp>>[] = [];
      const used = new Set<string>();
      for (let i = 0; i < threshold; i += 1) {
        setManageApproval(threshold > 1 ? { current: i + 1, total: threshold } : null);
        const pool = allCredentialIds.filter((id) => !used.has(id));
        if (pool.length === 0) throw new SendRequestError();
        const challenge = i === threshold - 1 ? hash : (lightHash as `0x${string}`);
        let signature: Awaited<ReturnType<typeof signVaultUserOp>>;
        try {
          signature = await signVaultUserOp(challenge, pool);
        } catch {
          return; // cancelled passkey prompt
        }
        if (used.has(signature.credentialId)) {
          setManageError(t("sendDuplicatePasskey"));
          return;
        }
        used.add(signature.credentialId);
        collected.push(signature);
      }

      const submitted = await sendRequest({ step: "submitManage", userOp: prepared.userOp, signatures: collected, action });
      if (!(submitted.transactionHash as string | undefined)) throw new SendRequestError();
      await load();
      window.dispatchEvent(new Event("gainforest:wallet-changed"));
    } catch (err) {
      setManageError(sendErrorForCode(err instanceof SendRequestError ? err.code : undefined));
    } finally {
      setManageBusy(false);
      setManageApproval(null);
    }
  };

  /** Create a new passkey and enroll it on-chain. */
  const handleAddPasskeyOnchain = async () => {
    if (manageBusy || isBusy) return;
    setManageError(null);
    if (!isPasskeySupported()) {
      setManageError(t("passkeyUnsupported"));
      return;
    }
    let passkey: Awaited<ReturnType<typeof createVaultPasskey>>;
    try {
      const passkeyName = organization
        ? t("passkeyLabel", { org: organization.name })
        : viewer.handle
          ? t("passkeyLabel", { name: viewer.handle })
          : t("passkeyLabelFallback");
      passkey = await createVaultPasskey(passkeyName);
    } catch {
      return; // cancelled
    }
    const label = newSignerLabel.trim() || viewer.handle || undefined;
    await runManageAction({ type: "addSigner", passkey: { ...passkey, ...(label ? { label } : {}) } });
    setNewSignerLabel("");
  };

  const applySendMax = () => {
    const token = getWalletToken(sendToken);
    const balance = state?.balances?.tokens.find((entry) => entry.symbol === sendToken);
    if (!token || !balance) return;
    setSendAmount(formatTokenUnits(balance.units, token.decimals));
  };

  const handleDelete = async () => {
    await runAction(
      () => fetch(organization ? "/api/org-wallet" : "/api/wallet", {
        method: "DELETE",
        headers: organization ? { "content-type": "application/json" } : undefined,
        body: organization ? JSON.stringify({ repo: organization.did }) : undefined,
      }),
      t("deleteError"),
    );
    setConfirmingDelete(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const record = state?.record;
  const deployed = state?.deployed === true;
  const canManageWallet = !organization || state?.viewerRole === "owner" || state?.viewerRole === "admin";
  // The wallet's CURRENT signers + threshold. On-chain state is the
  // authority once deployed; before that the founding record is.
  const liveSigners: VaultLiveSigner[] =
    state?.signerSet?.signers ??
    (record
      ? record.signers.map((signer, index) => ({
          index,
          publicKeyX: signer.publicKeyX,
          publicKeyY: signer.publicKeyY,
          credentialId: signer.credentialId,
          label: signer.label,
          memberDid: signer.memberDid,
        }))
      : []);
  const liveThreshold = state?.signerSet?.threshold ?? record?.threshold ?? 1;
  // Pristine wallets (no code, no funds) edit the record for free; deployed
  // or funded wallets change signers on-chain with sponsored gas.
  const onchainManaged = !!record && (deployed || state?.holdsFunds === true);
  const canEditSigners = !!record && !onchainManaged;
  const canRemoveSigner = (signer: VaultLiveSigner) => {
    const mine = !organization || canManageWallet || signer.memberDid === viewer.did;
    if (!mine || liveSigners.length <= 1) return false;
    if (canEditSigners) return true;
    // On-chain removal must not drop the signer count below the threshold.
    return onchainManaged && liveSigners.length - 1 >= liveThreshold;
  };
  const balances = state?.balances ?? null;
  const totalUsd = balances && balances.tokens.every((entry) => entry.usd !== null)
    ? balances.tokens.reduce((sum, entry) => sum + (entry.usd ?? 0), 0)
    : null;
  const hasFunds = !!balances && balances.tokens.some((entry) => BigInt(entry.units) > 0n);
  // Only someone whose own passkey is enrolled can approve a send.
  const canSend = !!record && liveSigners.some((signer) => signer.memberDid === viewer.did && signer.credentialId);
  const sendBusy = sendPhase !== "idle";
  const pendingSend = state?.pendingSend ?? null;
  const pendingToken = pendingSend ? getWalletToken(pendingSend.token) : null;
  // A pending transfer that no longer matches the wallet (threshold or
  // address changed) can never settle — it can only be cancelled.
  const pendingValid =
    !!pendingSend &&
    !!record &&
    !!pendingToken &&
    pendingSend.userOp.sender.toLowerCase() === record.address.toLowerCase() &&
    pendingSend.threshold === liveThreshold;
  const pendingReadyToSend = !!pendingSend && pendingSend.approvals.length >= pendingSend.threshold - 1;
  const canCancelPending = !!pendingSend && (!organization || canManageWallet || pendingSend.createdBy === viewer.did);

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

          {/* ── Balances ──────────────────────────────────────────────── */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <CardTitle Icon={CoinsIcon}>{t("balancesHeading")}</CardTitle>
              {totalUsd !== null ? (
                <span className="text-base font-semibold text-foreground">
                  {format.number(totalUsd, { style: "currency", currency: "USD" })}
                </span>
              ) : null}
            </div>
            {balances ? (
              <>
                <div className="mt-4 flex flex-col gap-0.5 rounded-xl bg-muted p-1">
                  {balances.tokens.map((entry) => {
                    const token = getWalletToken(entry.symbol);
                    if (!token) return null;
                    return (
                      <div key={entry.symbol} className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2.5">
                        <TokenBadge symbol={entry.symbol} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{entry.symbol}</p>
                          <p className="text-xs text-muted-foreground">{token.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm text-foreground">
                            {formatTokenUnits(entry.units, token.decimals, TOKEN_DISPLAY_DECIMALS[entry.symbol]) || "0"}
                          </p>
                          {entry.usd !== null ? (
                            <p className="text-xs text-muted-foreground">
                              ≈ {format.number(entry.usd, { style: "currency", currency: "USD" })}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!hasFunds ? <p className="mt-3 text-xs text-muted-foreground">{t("balancesEmpty")}</p> : null}
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{t("balancesError")}</p>
            )}
          </Card>

          {/* ── Pending transfer awaiting approvals ──────────────────────── */}
          {pendingSend ? (
            <Card>
              <CardTitle Icon={SendIcon}>{t("pendingHeading")}</CardTitle>
              {pendingValid && pendingToken ? (
                <>
                  <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted px-3 py-3">
                    <TokenBadge symbol={pendingToken.symbol} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {formatTokenUnits(pendingSend.amountUnits, pendingToken.decimals)} {pendingToken.symbol}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{pendingSend.to}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {t("pendingProgress", { current: pendingSend.approvals.length, total: pendingSend.threshold })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("pendingRemoteHint")}</p>
                  {sendError ? <p className="mt-3 text-sm text-destructive">{sendError}</p> : null}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={() => void handlePendingApproval(pendingReadyToSend)}
                      disabled={pendingBusy !== null || isBusy || sendBusy}
                    >
                      {pendingBusy === "approve" || pendingBusy === "finalize" ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <FingerprintIcon className="size-3.5" />
                      )}
                      {pendingBusy === "approve"
                        ? t("sendAwaitingPasskey")
                        : pendingBusy === "finalize"
                          ? t("sendSubmitting")
                          : pendingReadyToSend
                            ? t("pendingApproveAndSend")
                            : t("pendingApprove")}
                    </Button>
                    {canCancelPending ? (
                      <Button
                        variant="outline"
                        onClick={() => void handlePendingCancel()}
                        disabled={pendingBusy !== null || isBusy || sendBusy}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {pendingBusy === "cancel" ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2Icon className="size-3.5" />
                        )}
                        {t("pendingCancel")}
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-3 text-sm text-muted-foreground">{t("pendingInvalid")}</p>
                  {sendError ? <p className="mt-3 text-sm text-destructive">{sendError}</p> : null}
                  {canCancelPending ? (
                    <Button
                      variant="outline"
                      className="mt-4 text-muted-foreground hover:text-destructive"
                      onClick={() => void handlePendingCancel()}
                      disabled={pendingBusy !== null || isBusy || sendBusy}
                    >
                      {pendingBusy === "cancel" ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2Icon className="size-3.5" />
                      )}
                      {t("pendingCancel")}
                    </Button>
                  ) : null}
                </>
              )}
            </Card>
          ) : canSend ? (
            <Card>
              <CardTitle Icon={SendIcon}>{t("sendHeading")}</CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">{t("sendIntro")}</p>
              {liveThreshold > 1 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("sendApprovalsNeeded", { count: liveThreshold })}
                </p>
              ) : null}
              <div className="mt-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={sendToken}
                    onValueChange={(value) => setSendToken(value as WalletTokenSymbol)}
                    disabled={sendBusy}
                  >
                    <SelectTrigger className="sm:w-36" aria-label={t("sendToken")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WALLET_TOKENS.map((token) => (
                        <SelectItem key={token.symbol} value={token.symbol}>
                          {token.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative sm:flex-1">
                    <Input
                      value={sendAmount}
                      onChange={(event) => setSendAmount(event.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                      aria-label={t("sendAmount")}
                      disabled={sendBusy}
                      className="pr-14"
                    />
                    <button
                      type="button"
                      onClick={applySendMax}
                      disabled={sendBusy || !balances}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-input px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      {t("sendMax")}
                    </button>
                  </div>
                </div>
                <Input
                  value={sendTo}
                  onChange={(event) => setSendTo(event.target.value)}
                  placeholder={t("sendRecipientPlaceholder")}
                  aria-label={t("sendRecipient")}
                  disabled={sendBusy}
                  className="font-mono"
                />
                {sendError ? <p className="text-sm text-destructive">{sendError}</p> : null}
                {sentTxHash ? (
                  <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                    <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <p className="text-xs text-muted-foreground">
                      {t("sendSuccess")}{" "}
                      <a
                        href={`https://etherscan.io/tx/${sentTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary underline underline-offset-2"
                      >
                        {t("sendViewTx")}
                      </a>
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">{t("sendGasNote")}</p>
                  <Button
                    onClick={() => void handleSend()}
                    disabled={sendBusy || isBusy || !sendTo.trim() || !sendAmount.trim()}
                  >
                    {sendBusy ? <Loader2Icon className="size-3.5 animate-spin" /> : <FingerprintIcon className="size-3.5" />}
                    {sendPhase === "preparing"
                      ? t("sendPreparing")
                      : sendPhase === "signing"
                        ? t("sendAwaitingPasskey")
                        : sendPhase === "submitting"
                          ? t("sendSubmitting")
                          : liveThreshold > 1
                            ? t("sendStartButton")
                            : t("sendButton")}
                  </Button>
                </div>
              </div>
            </Card>
          ) : hasFunds ? (
            <p className="px-1 text-xs text-muted-foreground">{t("sendNoSigner")}</p>
          ) : null}

          <Card>
            <CardTitle Icon={FingerprintIcon}>{t("signersHeading")}</CardTitle>
            <div className="mt-4 flex flex-col gap-0.5 rounded-xl bg-muted p-1">
              {liveSigners.map((signer) => (
                <div
                  key={signer.credentialId ?? `signer-${signer.index}`}
                  className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2"
                >
                  <FingerprintIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm leading-snug">
                    {signer.label || t("unnamedPasskey")}
                  </span>
                  {canRemoveSigner(signer) ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        void (onchainManaged
                          ? runManageAction({ type: "removeSigner", signerIndex: signer.index })
                          : signer.credentialId
                            ? handleRemoveSigner(signer.credentialId)
                            : undefined)
                      }
                      disabled={isBusy || manageBusy}
                      aria-label={t("removeSigner")}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            {onchainManaged ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("onchainManageHint")}</p>
            ) : null}

            {/* ── How many passkeys must approve each transfer ────────────── */}
            <div className="mt-4 space-y-1.5">
              <p className="text-sm font-medium text-foreground">{t("thresholdHeading")}</p>
              {canManageWallet && liveSigners.length > 0 ? (
                <Select
                  value={String(liveThreshold)}
                  onValueChange={(value) => {
                    const next = Number(value);
                    if (!Number.isInteger(next) || next === liveThreshold) return;
                    if (onchainManaged) void runManageAction({ type: "setThreshold", threshold: next });
                    else handleSetThreshold(value);
                  }}
                  disabled={isBusy || sendBusy || manageBusy}
                >
                  <SelectTrigger aria-label={t("thresholdHeading")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: liveSigners.length }, (_, index) => index + 1).map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {t("thresholdOption", { count, total: liveSigners.length })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-foreground">
                  {t("thresholdOption", { count: liveThreshold, total: liveSigners.length })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {onchainManaged ? t("thresholdOnchainHint") : t("thresholdHint")}
              </p>
              {liveThreshold === 1 && liveSigners.length > 1 ? (
                <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  {t("thresholdSingleWarning")}
                </p>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newSignerLabel}
                  onChange={(event) => setNewSignerLabel(event.target.value)}
                  placeholder={t("signerLabelPlaceholder")}
                  maxLength={80}
                  disabled={isBusy || manageBusy}
                  className="sm:flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => void (onchainManaged ? handleAddPasskeyOnchain() : handleAddPasskey())}
                  disabled={isBusy || manageBusy}
                >
                  {isBusy || manageBusy ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <FingerprintIcon className="size-3.5" />
                  )}
                  {manageBusy && manageApproval
                    ? t("sendApprovalOf", { current: manageApproval.current, total: manageApproval.total })
                    : t("addPasskey")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("signersHint")}</p>
              {manageError ? <p className="text-sm text-destructive">{manageError}</p> : null}
            </div>
          </Card>

          {actionError ? <p className="px-1 text-sm text-destructive">{actionError}</p> : null}

          {!deployed && canManageWallet ? (
            confirmingDelete ? (
              <Card className="border-destructive/40">
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">{t("deleteConfirmTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{t("deleteConfirmBody")}</p>
                  {state?.holdsFunds ? (
                    <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {t("deleteConfirmFunds")}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={isBusy}>
                      {t("deleteConfirmCancel")}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void handleDelete()}
                      disabled={isBusy || state?.holdsFunds === true}
                    >
                      {isBusy ? <Loader2Icon className="size-3.5 animate-spin" /> : <Trash2Icon className="size-3.5" />}
                      {t("deleteConfirmButton")}
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Button
                variant="ghost"
                className="w-full text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmingDelete(true)}
                disabled={isBusy}
              >
                <Trash2Icon className="size-3.5" />
                {t("deleteButton")}
              </Button>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
