"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, BadgeCheckIcon, CheckIcon, CopyIcon, HeartIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import type { AuthSession } from "@/app/_lib/auth";
import { blockExplorerUrl, localBumicertHref } from "@/app/_lib/urls";
import {
  BASE_CHAIN_NAME,
  BASE_RPC_URL,
  CHAIN_ID,
  DECIMALS,
  EIP3009_DOMAIN_NAME,
  EIP3009_DOMAIN_VERSION,
  EIP3009_TYPES_FOR_WALLET,
  toUsdcUnits,
  USDC_CONTRACT,
} from "@/lib/facilitator/usdc";

type EthereumProvider = {
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export type DonationBumicert = {
  organizationDid: string;
  rkey: string;
  title: string;
  organizationName: string;
};

export type DonationFundingConfig = {
  minDonationInUSD?: string | null;
  maxDonationInUSD?: string | null;
} | null;

export type RecipientStatus =
  | { hasAttestation: true; address: string; chainId: number }
  | { hasAttestation: false };

const MODAL_IDS = {
  amount: "bumicert-donate-amount",
  wallet: "bumicert-donate-wallet",
  confirm: "bumicert-donate-confirm",
  success: "bumicert-donate-success",
};

const DEFAULT_PRESETS = [5, 10, 25, 50, 100];
const DEFAULT_AMOUNT = 25;

function buildPresets(min: number | null, max: number | null): number[] {
  const lo = min ?? DEFAULT_PRESETS[0]!;
  const hi = max ?? DEFAULT_PRESETS[DEFAULT_PRESETS.length - 1]!;
  if (min === null && max === null) return DEFAULT_PRESETS;

  const filtered = DEFAULT_PRESETS.filter((preset) => preset >= lo && preset <= hi);
  if (min !== null && !filtered.includes(min)) filtered.unshift(min);
  if (max !== null && !filtered.includes(max)) filtered.push(max);
  if (filtered.length >= 3) return [...new Set(filtered)];

  const count = 5;
  const step = Math.max(1, (hi - lo) / (count - 1));
  return [...new Set(Array.from({ length: count }, (_, index) => Math.round(lo + step * index)))];
}

function parseBound(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function shortWallet(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

async function ensureBaseNetwork(ethereum: EthereumProvider) {
  const hexChainId = `0x${CHAIN_ID.toString(16)}`;
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? Number(error.code) : null;
    if (code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexChainId,
          chainName: BASE_CHAIN_NAME,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [BASE_RPC_URL],
          blockExplorerUrls: ["https://basescan.org"],
        },
      ],
    });
  }
}

async function fetchRecipient(orgDid: string): Promise<RecipientStatus> {
  const response = await fetch(`/api/verify-recipient?did=${encodeURIComponent(orgDid)}`);
  const json = (await response.json().catch(() => null)) as RecipientStatus | null;
  if (!response.ok || !json) return { hasAttestation: false };
  return json;
}

function encodeBalanceOf(address: string): `0x${string}` {
  return `0x70a08231${address.replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
}

async function readUsdcBalance(ethereum: EthereumProvider, address: string): Promise<bigint | null> {
  const result = await ethereum.request<string>({
    method: "eth_call",
    params: [{ to: USDC_CONTRACT, data: encodeBalanceOf(address) }, "latest"],
  });
  if (typeof result !== "string" || !result.startsWith("0x")) return null;
  return BigInt(result);
}

function formatUsdc(units: bigint): string {
  const whole = units / BigInt(10 ** DECIMALS);
  const frac = units % BigInt(10 ** DECIMALS);
  return `${whole}.${frac.toString().padStart(DECIMALS, "0").slice(0, 2)}`;
}

function createNonce(): `0x${string}` {
  const nonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
  return nonce as `0x${string}`;
}

function createPaymentSignatureHeader(params: {
  signature: `0x${string}`;
  senderWallet: string;
  recipientWallet: string;
  usdcAmount: bigint;
  nonce: `0x${string}`;
  validBefore: string;
}): string {
  const payload = {
    x402Version: 2,
    scheme: "exact",
    networkId: "eip155:8453",
    payload: {
      signature: params.signature,
      authorization: {
        from: params.senderWallet,
        to: params.recipientWallet,
        value: params.usdcAmount.toString(),
        validAfter: "0",
        validBefore: params.validBefore,
        nonce: params.nonce,
      },
    },
  };
  return btoa(JSON.stringify(payload));
}

function parseFundError(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const code = Reflect.get(raw, "code");
    if (code === "NON_ANONYMOUS_DONATION_REQUIRES_DONOR_DID") {
      return "We couldn’t link this donation to your profile. Sign in again or donate anonymously.";
    }
    const error = Reflect.get(raw, "error");
    if (typeof error === "string") return error;
  }
  return "Payment failed. Please try again.";
}

export function AmountModal({
  bumicert,
  fundingConfig,
  authSession,
}: {
  bumicert: DonationBumicert;
  fundingConfig: DonationFundingConfig;
  authSession: AuthSession;
}) {
  const { pushModal, hide, clear } = useModal();
  const minDonation = parseBound(fundingConfig?.minDonationInUSD);
  const maxDonation = parseBound(fundingConfig?.maxDonationInUSD);
  const presets = useMemo(() => buildPresets(minDonation, maxDonation), [minDonation, maxDonation]);
  const initialAmount = presets.includes(DEFAULT_AMOUNT) ? DEFAULT_AMOUNT : presets[Math.floor(presets.length / 2)] ?? DEFAULT_AMOUNT;
  const [amount, setAmount] = useState(initialAmount);
  const [customInput, setCustomInput] = useState(String(initialAmount));
  const [donorChoseAnonymous, setDonorChoseAnonymous] = useState(false);

  const isValid =
    Number.isFinite(amount) &&
    amount > 0 &&
    (minDonation === null || amount >= minDonation) &&
    (maxDonation === null || amount <= maxDonation);

  const handleCustomChange = (value: string) => {
    const clean = value.replace(/[^0-9.]/g, "");
    setCustomInput(clean);
    const parsed = Number.parseFloat(clean);
    if (Number.isFinite(parsed)) setAmount(parsed);
  };

  const handleCancel = async () => {
    await hide();
    clear();
  };

  return (
    <ModalContent dismissible={false}>
      <ModalHeader>
        <ModalTitle>Support this Bumicert</ModalTitle>
        <ModalDescription>
          {bumicert.title} · {bumicert.organizationName}
        </ModalDescription>
      </ModalHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Donation amount</label>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3">
            <span className="text-lg font-medium text-muted-foreground">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={customInput}
              onChange={(event) => handleCustomChange(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xl font-semibold text-foreground outline-none"
              placeholder="25"
            />
            <span className="text-xs font-medium text-muted-foreground">digital dollars</span>
          </div>
          {(minDonation !== null || maxDonation !== null) && (
            <p className="text-xs text-muted-foreground">
              {minDonation !== null ? `Minimum $${minDonation}` : ""}{minDonation !== null && maxDonation !== null ? " · " : ""}{maxDonation !== null ? `Maximum $${maxDonation}` : ""}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setAmount(preset);
                setCustomInput(String(preset));
              }}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${amount === preset ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted"}`}
            >
              ${preset}
            </button>
          ))}
        </div>

        {authSession.isLoggedIn ? (
          <label className="flex cursor-pointer gap-3 rounded-2xl border border-border-soft bg-surface p-3">
            <input
              type="checkbox"
              checked={donorChoseAnonymous}
              onChange={(event) => setDonorChoseAnonymous(event.target.checked)}
              className="mt-1 size-4 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Donate anonymously</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Leave this off to show this donation on your Bumicerts profile.
              </span>
            </span>
          </label>
        ) : (
          <p className="rounded-2xl border border-border-soft bg-surface p-3 text-xs leading-5 text-muted-foreground">
            You are not signed in, so this donation will appear as anonymous.
          </p>
        )}
      </div>

      <ModalFooter className="mt-5 flex flex-col gap-2">
        <Button
          disabled={!isValid}
          className="w-full"
          onClick={() => pushModal({
            id: MODAL_IDS.wallet,
            content: <WalletModal bumicert={bumicert} amount={amount} donorChoseAnonymous={donorChoseAnonymous} authSession={authSession} />,
          })}
        >
          <WalletIcon className="size-4" /> Continue to payment app
        </Button>
        <Button variant="outline" onClick={handleCancel} className="w-full">Cancel</Button>
      </ModalFooter>
    </ModalContent>
  );
}

function WalletModal({
  bumicert,
  amount,
  donorChoseAnonymous,
  authSession,
}: {
  bumicert: DonationBumicert;
  amount: number;
  donorChoseAnonymous: boolean;
  authSession: AuthSession;
}) {
  const { pushModal, popModal, hide, clear } = useModal();
  const [state, setState] = useState<"idle" | "connecting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    await hide();
    clear();
  };

  const handleConnect = async () => {
    const ethereum = getEthereum();
    if (!ethereum) {
      setState("error");
      setError("No supported payment app was found. Install MetaMask or another compatible app to continue.");
      return;
    }

    setState("connecting");
    setError(null);
    try {
      const accounts = await ethereum.request<string[]>({ method: "eth_requestAccounts" });
      const senderWallet = accounts[0];
      if (!senderWallet) throw new Error("Payment app connection failed.");
      await ensureBaseNetwork(ethereum);
      const recipient = await fetchRecipient(bumicert.organizationDid);
      if (!recipient.hasAttestation) {
        throw new Error(`${bumicert.organizationName} cannot receive donations yet.`);
      }
      pushModal({
        id: MODAL_IDS.confirm,
        content: (
          <ConfirmModal
            bumicert={bumicert}
            amount={amount}
            senderWallet={senderWallet}
            recipientWallet={recipient.address}
            donorChoseAnonymous={donorChoseAnonymous}
            authSession={authSession}
          />
        ),
      });
    } catch (connectError) {
      setState("error");
      setError(connectError instanceof Error ? connectError.message : "Payment app connection failed.");
    }
  };

  return (
    <ModalContent dismissible={false}>
      <ModalHeader backAction={state === "connecting" ? undefined : popModal}>
        <ModalTitle>Connect your payment app</ModalTitle>
        <ModalDescription>Donations use digital dollars behind the scenes.</ModalDescription>
      </ModalHeader>

      <div className="space-y-4 py-2 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
          <WalletIcon className="size-6" />
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Your payment app will ask you to approve the donation. Any network fee is covered for you, and the completed gift will be shown publicly.
        </p>
        {error ? <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      </div>

      <ModalFooter className="flex flex-col gap-2">
        <Button onClick={handleConnect} disabled={state === "connecting"} className="w-full">
          {state === "connecting" ? "Preparing payment app…" : "Connect payment app"}
        </Button>
        <Button variant="outline" onClick={handleCancel} disabled={state === "connecting"} className="w-full">Cancel</Button>
      </ModalFooter>
    </ModalContent>
  );
}

function ConfirmModal({
  bumicert,
  amount,
  senderWallet,
  recipientWallet,
  donorChoseAnonymous,
  authSession,
}: {
  bumicert: DonationBumicert;
  amount: number;
  senderWallet: string;
  recipientWallet: string;
  donorChoseAnonymous: boolean;
  authSession: AuthSession;
}) {
  const { pushModal, popModal, hide, clear } = useModal();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [txState, setTxState] = useState<"idle" | "signing" | "processing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const usdcAmount = toUsdcUnits(amount);
  const hasEnoughBalance = balance !== null && balance >= usdcAmount;

  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum) {
      setBalanceLoading(false);
      return;
    }
    let cancelled = false;
    readUsdcBalance(ethereum, senderWallet)
      .then((nextBalance) => {
        if (!cancelled) setBalance(nextBalance);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [senderWallet]);

  const handleCancel = async () => {
    await hide();
    clear();
  };

  const handlePay = async () => {
    const ethereum = getEthereum();
    if (!ethereum) {
      setTxState("error");
      setError("No supported payment app was found.");
      return;
    }

    const nonce = createNonce();
    const validBefore = String(Math.floor(Date.now() / 1000) + 300);
    const typedData = {
      domain: {
        name: EIP3009_DOMAIN_NAME,
        version: EIP3009_DOMAIN_VERSION,
        chainId: CHAIN_ID,
        verifyingContract: USDC_CONTRACT,
      },
      types: EIP3009_TYPES_FOR_WALLET,
      primaryType: "TransferWithAuthorization",
      message: {
        from: senderWallet,
        to: recipientWallet,
        value: usdcAmount.toString(),
        validAfter: "0",
        validBefore,
        nonce,
      },
    };

    setTxState("signing");
    setError(null);

    try {
      const signature = await ethereum.request<`0x${string}`>({
        method: "eth_signTypedData_v4",
        params: [senderWallet, JSON.stringify(typedData)],
      });

      setTxState("processing");
      const sigHeader = createPaymentSignatureHeader({
        signature,
        senderWallet,
        recipientWallet,
        usdcAmount,
        nonce,
        validBefore,
      });
      const anonymous = authSession.isLoggedIn ? donorChoseAnonymous : true;
      const response = await fetch("/api/fund", {
        method: "POST",
        headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": sigHeader },
        body: JSON.stringify({
          activityUri: `at://${bumicert.organizationDid}/org.hypercerts.claim.activity/${bumicert.rkey}`,
          orgDid: bumicert.organizationDid,
          amount: String(amount),
          currency: "USDC",
          anonymous,
          donorDid: authSession.isLoggedIn && !anonymous ? authSession.did : undefined,
        }),
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) throw new Error(parseFundError(raw));
      const transactionHash = typeof raw?.transactionHash === "string" ? raw.transactionHash : null;
      const donorRecordedAs = raw?.donorRecordedAs === "did" ? "did" : "wallet";
      if (!transactionHash) throw new Error("Payment succeeded, but we could not prepare the public donation note.");

      pushModal({
        id: MODAL_IDS.success,
        content: <SuccessModal bumicert={bumicert} amount={amount} transactionHash={transactionHash} donorRecordedAs={donorRecordedAs} />,
      }, true);
    } catch (paymentError) {
      setTxState("error");
      setError(paymentError instanceof Error ? paymentError.message : "Payment failed. Please try again.");
    }
  };

  if (txState === "signing" || txState === "processing") {
    return (
      <ModalContent dismissible={false}>
        <ModalHeader>
          <ModalTitle>{txState === "signing" ? "Waiting for approval" : "Confirming donation"}</ModalTitle>
          <ModalDescription className="sr-only">Donation payment is in progress.</ModalDescription>
        </ModalHeader>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="font-medium text-foreground">
            {txState === "signing" ? "Approve the donation in your payment app." : "Finishing your donation and preparing the public note…"}
          </p>
          <p className="text-sm text-muted-foreground">Do not close this window.</p>
        </div>
      </ModalContent>
    );
  }

  return (
    <ModalContent dismissible={false}>
      <ModalHeader backAction={popModal}>
        <ModalTitle>Confirm donation</ModalTitle>
        <ModalDescription>Review your donation before approving it.</ModalDescription>
      </ModalHeader>

      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">Your payment app</p>
          <p className="mt-1 font-mono text-sm font-medium text-foreground">{shortWallet(senderWallet)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Available: {balanceLoading ? "loading…" : balance !== null ? `$${formatUsdc(balance)}` : "unavailable"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">Donation</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">${amount.toFixed(2)}</p>
          <p className="mt-1 text-sm text-muted-foreground">→ {bumicert.organizationName}</p>
          <p className="mt-1 text-xs text-muted-foreground">For {bumicert.title}</p>
        </div>
        {!balanceLoading && balance !== null && !hasEnoughBalance ? (
          <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            Your payment app does not have enough available funds for this donation.
          </p>
        ) : null}
        {error ? <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      </div>

      <ModalFooter className="mt-5 flex flex-col gap-2">
        <Button onClick={handlePay} disabled={balanceLoading || !hasEnoughBalance} className="w-full">
          Donate ${amount.toFixed(2)}
        </Button>
        <Button variant="outline" onClick={handleCancel} className="w-full">Cancel</Button>
      </ModalFooter>
    </ModalContent>
  );
}

function SuccessModal({
  bumicert,
  amount,
  transactionHash,
  donorRecordedAs,
}: {
  bumicert: DonationBumicert;
  amount: number;
  transactionHash: string;
  donorRecordedAs: "did" | "wallet";
}) {
  const { hide, clear } = useModal();
  const [copied, setCopied] = useState(false);
  const txHref = blockExplorerUrl(transactionHash, "base");
  const sharePath = localBumicertHref(bumicert.organizationDid, bumicert.rkey);
  const shareText = `I donated $${amount.toFixed(2)} to support a Bumicert: ${typeof window !== "undefined" ? `${window.location.origin}${sharePath}` : sharePath}`;

  const handleDone = async () => {
    await hide();
    clear();
  };

  return (
    <ModalContent dismissible={false}>
      <ModalHeader>
        <ModalTitle className="sr-only">Donation successful</ModalTitle>
        <ModalDescription className="sr-only">Your donation has been completed.</ModalDescription>
      </ModalHeader>

      <div className="space-y-5 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
          <BadgeCheckIcon className="size-8" />
        </div>
        <div>
          <p className="font-instrument text-4xl italic text-primary">Thank you</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Your <span className="font-medium text-foreground">${amount.toFixed(2)}</span> donation to <span className="font-medium text-foreground">{bumicert.organizationName}</span> was successful.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {donorRecordedAs === "did" ? "This gift is linked to your Bumicerts profile." : "This gift appears as anonymous."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {txHref ? (
            <Button variant="secondary" asChild>
              <Link href={txHref} target="_blank" rel="noreferrer">
                Payment details <ArrowUpRightIcon className="size-4" />
              </Link>
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(shareText);
              setCopied(true);
            }}
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />} Share
          </Button>
        </div>
      </div>

      <ModalFooter className="mt-5">
        <Button className="w-full" onClick={handleDone}>
          <HeartIcon className="size-4" /> Done
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
