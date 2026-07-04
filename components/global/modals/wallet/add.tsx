"use client";

/**
 * AddWalletModal — connect and verify an EVM wallet to link it to the account.
 *
 * Props:
 *   did           — the account DID the wallet links to
 *   repo          — organization repo for group-owned wallet links
 *   existingName  — pre-fills the wallet label field (e.g. when editing an existing wallet)
 *   existingRkey  — informational only; re-link always creates a fresh record
 *   startWithCreate — immediately open the WaaP "create a wallet" flow on mount
 *   onBack / onSuccess — navigation callbacks (push/pop handled by the caller);
 *                        onSuccess receives the created link record URI when available
 *
 * States:
 *   • No wallet connected  → create a new wallet (WaaP: Bluesky/email, no
 *     extension needed) or connect an existing one (RainbowKit)
 *   • Wrong network        → connected address shown, Switch to Base CTA
 *   • Ready to sign        → label field + Sign & Link button; wallets created
 *     through WaaP sign & link automatically (auto-attestation)
 *   • Success              → confirmation message
 */

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useSwitchChain, useDisconnect } from "wagmi";
import { base } from "wagmi/chains";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useTranslations } from "next-intl";
import { getWaaPConnector } from "@/lib/waap/connector";
import { useModal } from "@/components/ui/modal/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from "@/components/ui/modal/modal";
import { useWalletAttestation } from "@/hooks/useWalletAttestation";
import {
  CheckCircle2Icon,
  WalletIcon,
  ArrowRightIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";

export interface AddWalletModalProps {
  /** The account DID the wallet links to. */
  did: string;
  /** Organization repo for group-owned wallet links. */
  repo?: string;
  /** Pre-fill the label field (e.g. when re-linking an existing wallet slot). */
  existingName?: string;
  /** Passed for context only — re-link still creates a fresh record. */
  existingRkey?: string;
  /** Open the WaaP "create a wallet" flow immediately on mount. */
  startWithCreate?: boolean;
  onBack: () => void | Promise<void>;
  /** Called after the wallet is linked; receives the link record URI when available. */
  onSuccess: (attestationUri?: string | null) => void | Promise<void>;
}

export function AddWalletModal({
  did,
  repo,
  existingName,
  startWithCreate,
  onBack,
  onSuccess,
}: AddWalletModalProps) {
  const t = useTranslations("modals.walletCreate");
  const { stack, hide, popModal } = useModal();
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const { status, error, attestationUri, linkWallet, reset } = useWalletAttestation(did, repo ? { repo } : undefined);

  const isCorrectNetwork = chainId === base.id;
  const isSuccess = status === "success";

  const [name, setName] = useState(existingName ?? "");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Wallets created through WaaP sign & link automatically — track that the
  // connection came from the create flow, and that we only auto-trigger once.
  const [viaWaaP, setViaWaaP] = useState(false);
  const autoLinkStartedRef = useRef(false);
  const createStartedRef = useRef(false);

  const handleCreateWallet = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await connectAsync({ connector: getWaaPConnector(), chainId: base.id });
      setViaWaaP(true);
    } catch {
      setCreateError(t("error"));
    } finally {
      setIsCreating(false);
    }
  };

  // "One-click" entry points (funding modal / settings) open straight into the
  // WaaP flow instead of showing the connect choice first.
  useEffect(() => {
    if (!startWithCreate || createStartedRef.current) return;
    createStartedRef.current = true;
    void handleCreateWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWithCreate]);

  // Auto-attestation: once a WaaP-created wallet is connected on Base, sign &
  // link it without another button press. Runs once; a rejected signature
  // falls back to the regular "Try Again" button.
  useEffect(() => {
    if (!viaWaaP || autoLinkStartedRef.current) return;
    if (!isConnected || !isCorrectNetwork || !address || status !== "idle") return;
    autoLinkStartedRef.current = true;
    const label = name.trim() || t("defaultLabel");
    setName(label);
    void linkWallet(label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viaWaaP, isConnected, isCorrectNetwork, address, status]);

  const handleDone = () => {
    reset();
    onSuccess(attestationUri);
  };

  const handleBack = () => {
    if (stack.length === 1) {
      hide().then(() => popModal());
    } else {
      onBack();
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const phase: "connect" | "wrong-network" | "ready" | "success" =
    isSuccess           ? "success"
    : !isConnected      ? "connect"
    : !isCorrectNetwork ? "wrong-network"
    : "ready";

  const title =
    phase === "success"         ? "Wallet Linked"
    : phase === "connect"       ? "Link Wallet"
    : phase === "wrong-network" ? "Switch Network"
    : "Link Wallet";

  return (
    <ModalContent dismissible={false}>
      <ModalHeader backAction={status === "signing" || status === "writing" ? undefined : handleBack}>
        <ModalTitle>{title}</ModalTitle>
        {phase === "ready" && (
          <ModalDescription>
            Sign with your wallet to prove ownership. A label helps you identify it later.
          </ModalDescription>
        )}
      </ModalHeader>

      <div className="flex flex-col gap-4 pt-1">

        {/* ── Not connected ────────────────────────────────────────────────── */}
        {phase === "connect" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <WalletIcon className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">{t("createTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("createHint")}</p>
            </div>
            {createError ? <p className="text-sm text-destructive text-center">{createError}</p> : null}
            <Button className="w-full" onClick={() => void handleCreateWallet()} disabled={isCreating}>
              {isCreating ? <Loader2Icon className="size-3.5 animate-spin" /> : <SparklesIcon className="size-3.5" />}
              {isCreating ? t("creating") : t("createButton")}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => openConnectModal?.()} disabled={isCreating}>
              {t("connectExisting")}
              <ArrowRightIcon className="size-3.5" />
            </Button>
          </div>
        )}

        {/* ── Wrong network ────────────────────────────────────────────────── */}
        {phase === "wrong-network" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-amber-500" />
                <span className="text-sm font-mono text-foreground">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => disconnect()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Disconnect
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              GainForest requires Base network. Switch to continue.
            </p>
            <Button
              onClick={() => switchChain({ chainId: base.id })}
              disabled={isSwitching}
              className="w-full"
            >
              {isSwitching ? "Switching…" : "Switch to Base"}
            </Button>
          </div>
        )}

        {/* ── Ready to sign ────────────────────────────────────────────────── */}
        {phase === "ready" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-primary" />
                <span className="text-sm font-mono text-foreground">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
                <span className="text-xs text-muted-foreground">Base</span>
              </div>
              <div className="flex items-center gap-2">
                {openConnectModal && (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Switch
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>
                Label{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                placeholder="e.g. Personal Wallet"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 100))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") linkWallet(name.trim() || undefined);
                }}
              />
            </div>

            {error && <p className="text-sm text-destructive">Could not link this wallet. Please try again.</p>}

            <Button
              onClick={() => linkWallet(name.trim() || undefined)}
              disabled={status === "signing" || status === "writing"}
              className="w-full"
            >
              {status === "signing"
                ? "Sign in wallet…"
                : status === "writing"
                ? "Saving…"
                : status === "error"
                ? "Try Again"
                : "Sign & Link Wallet"}
            </Button>
          </div>
        )}

        {/* ── Success ──────────────────────────────────────────────────────── */}
        {phase === "success" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-3 rounded-md bg-primary/5 border border-primary/20 px-4 py-3">
              <CheckCircle2Icon className="size-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Wallet linked successfully</p>
                {name.trim() && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Saved as “{name.trim()}”
                  </p>
                )}
              </div>
            </div>
            <Button onClick={handleDone} className="w-full">Done</Button>
          </div>
        )}

      </div>
    </ModalContent>
  );
}
