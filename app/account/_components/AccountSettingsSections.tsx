"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { blo } from "blo";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronRight,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
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
import { deleteRecord } from "@/app/(manage)/manage/_lib/mutations";
import { INDEXER_URL } from "@/app/_lib/urls";
import { CHAIN_ID } from "@/lib/facilitator/usdc";
import { cn } from "@/lib/utils";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type WalletLink = {
  uri: string | null;
  rkey: string | null;
  name: string | null;
  address: string | null;
  valid: boolean;
};

const BASE_CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;
const EIP712_DOMAIN = { name: "ATProto EVM Attestation", version: "1" } as const;
const EIP712_TYPES = {
  AttestLink: [
    { name: "did", type: "string" },
    { name: "evmAddress", type: "string" },
    { name: "chainId", type: "string" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "string" },
  ],
} as const;

function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as typeof window & { ethereum?: EthereumProvider }).ethereum;
  return candidate ?? null;
}

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

async function ensureBaseNetwork(ethereum: EthereumProvider) {
  const chainId = await ethereum.request({ method: "eth_chainId" }).catch(() => null);
  if (chainId === BASE_CHAIN_HEX) return;
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_HEX }] });
  } catch {
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: BASE_CHAIN_HEX, chainName: "Base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"] }],
    });
  }
}

function AddWalletModal({ did, existingName, onSuccess, onBack }: { did: string; existingName?: string | null; onSuccess: () => void; onBack: () => void }) {
  const [address, setAddress] = useState<string | null>(null);
  const [name, setName] = useState(existingName ?? "");
  const [status, setStatus] = useState<"idle" | "connecting" | "signing" | "writing" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function connectWallet() {
    const ethereum = getEthereum();
    if (!ethereum) { setError("No wallet found. Install a supported wallet and try again."); setStatus("error"); return; }
    setStatus("connecting");
    setError(null);
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const nextAddress = accounts[0];
      if (!nextAddress) throw new Error("Wallet connection failed.");
      await ensureBaseNetwork(ethereum);
      setAddress(nextAddress);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet.");
      setStatus("error");
    }
  }

  async function linkWallet() {
    const ethereum = getEthereum();
    if (!ethereum) { setError("No wallet found."); setStatus("error"); return; }
    const nextAddress = address;
    if (!nextAddress) { await connectWallet(); return; }
    setStatus("signing");
    setError(null);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = String(Date.now());
    const message = { did, evmAddress: nextAddress, chainId: String(CHAIN_ID), timestamp, nonce };
    const typedData = {
      domain: EIP712_DOMAIN,
      types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }], ...EIP712_TYPES },
      primaryType: "AttestLink",
      message,
    };

    try {
      const signature = await ethereum.request({ method: "eth_signTypedData_v4", params: [nextAddress, JSON.stringify(typedData)] });
      setStatus("writing");
      const response = await fetch("/api/identity-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: nextAddress, chainId: CHAIN_ID, signature, message, ...(name.trim() ? { name: name.trim() } : {}) }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not link this wallet. Please try again.");
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link this wallet. Please try again.");
      setStatus("error");
    }
  }

  const busy = status === "connecting" || status === "signing" || status === "writing";

  return (
    <ModalContent dismissible={!busy}>
      <ModalHeader backAction={busy ? undefined : onBack}>
        <ModalTitle>{status === "success" ? "Wallet Linked" : "Link Wallet"}</ModalTitle>
        {address && status !== "success" ? <ModalDescription>Sign with your wallet to prove ownership. A label helps you identify it later.</ModalDescription> : null}
      </ModalHeader>
      <div className="flex flex-col gap-4 pt-1">
        {!address && status !== "success" ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted"><WalletIcon className="size-6 text-muted-foreground" /></div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">Connect a wallet</p>
              <p className="text-xs text-muted-foreground">We&apos;ll ask you to sign a message to prove ownership. No transaction will be sent.</p>
            </div>
            {error ? <p className="text-sm text-destructive text-center">{error}</p> : null}
            <Button className="w-full" onClick={() => void connectWallet()} disabled={busy}>
              {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              Connect Wallet
              <ArrowRightIcon className="size-3.5" />
            </Button>
          </div>
        ) : null}

        {address && status !== "success" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
              <div className="flex items-center gap-2"><div className="size-2 rounded-full bg-primary" /><span className="text-sm font-mono text-foreground">{shortAddress(address)}</span><span className="text-xs text-muted-foreground">Base</span></div>
              <button type="button" onClick={() => setAddress(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Disconnect</button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Label <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="e.g. Personal Wallet" value={name} onChange={(e) => setName(e.target.value.slice(0, 100))} onKeyDown={(e) => { if (e.key === "Enter") void linkWallet(); }} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button onClick={() => void linkWallet()} disabled={busy} className="w-full">
              {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              {status === "signing" ? "Sign in wallet…" : status === "writing" ? "Saving…" : status === "error" ? "Try Again" : "Sign & Link Wallet"}
            </Button>
          </div>
        ) : null}

        {status === "success" ? (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-3 rounded-md bg-primary/5 border border-primary/20 px-4 py-3">
              <CheckCircle2Icon className="size-5 text-primary shrink-0" />
              <div><p className="text-sm font-medium text-foreground">Wallet linked successfully</p>{name.trim() ? <p className="text-xs text-muted-foreground mt-0.5">Saved as “{name.trim()}”</p> : null}</div>
            </div>
            <Button onClick={onSuccess} className="w-full">Done</Button>
          </div>
        ) : null}
      </div>
    </ModalContent>
  );
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
      content: <AddWalletModal did={did} existingName={existing?.name} onBack={closeModal} onSuccess={() => { closeModal(); void loadLinks(); }} />,
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
            {[1, 2].map((i) => <div key={i} className="h-[62px] rounded-lg bg-muted-foreground/10 animate-pulse" />)}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4 text-center">{error}</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No wallets linked yet.</p>
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

export function AccountSettingsSections({ did }: { did: string }) {
  return (
    <div className="mx-auto mt-8 mb-20 space-y-8">
      <PasswordSection did={did} />
      <WalletsSection did={did} />
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
