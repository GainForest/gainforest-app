"use client";

/**
 * Checkout for project and direct account donations, plus an optional
 * GainForest tip that helps cover network fees.
 *
 * Payments run sequentially; each line shows its own progress. Successful
 * lines are removed from the cart immediately, so a partial failure leaves
 * only the unpaid projects behind for a retry.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  BadgeCheckIcon,
  CheckIcon,
  CircleAlertIcon,
  CompassIcon,
  CopyIcon,
  HeartHandshakeIcon,
  InfoIcon,
  Loader2Icon,
  Share2Icon,
  ShoppingCartIcon,
  WalletIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { clampDonationMessage, DONATION_MESSAGE_MAX_LENGTH, sanitizeDonationMessage } from "@/lib/donation/message";
import { bioblitzPrizeReceiptMessage, bioblitzRoundUsesPoints } from "@/lib/bioblitz-prizes";
import type { AuthSession } from "@/app/_lib/auth";
import { SocialGlyph } from "@/app/_components/SocialIcon";
import { blockExplorerUrl } from "@/app/_lib/urls";
import {
  cartItemKey,
  tipAmountUsd,
  useCart,
  type CartItem,
} from "@/app/_components/cart/CartProvider";
import { itemAmountValid } from "@/app/cart/_components/CartView";
import { RewardDeck } from "./RewardDeck";
import { buildRewardCards, tierForAmount } from "./reward-model";
import {
  createNonce,
  createPaymentSignatureHeader,
  ensureEthereumNetwork,
  fetchRecipient,
  formatUsdc,
  getEthereum,
  readUsdcBalance,
  shortWallet,
  type EthereumProvider,
} from "@/lib/donation/client";
import {
  CHAIN_ID,
  EIP3009_DOMAIN_NAME,
  EIP3009_DOMAIN_VERSION,
  EIP3009_TYPES_FOR_WALLET,
  PAYMENT_NETWORK,
  toUsdcUnits,
  USDC_CONTRACT,
} from "@/lib/facilitator/usdc";
import { FACILITATOR_WALLET_ADDRESS } from "@/app/_lib/urls";

type RecipientState = { status: "loading" } | { status: "ready"; address: string } | { status: "unavailable" };

type TipConfig = { status: "loading" } | { status: "ready"; enabled: boolean; address?: string };

type LinePhase = "pending" | "signing" | "processing" | "done" | "failed";

type LineState = { phase: LinePhase; txHash?: string; error?: string };

type CompletedLine = {
  kind: "donation" | "tip";
  title: string;
  orgName: string;
  amountUsd: number;
  txHash: string;
  /** Public receipt written for this settled donation. */
  receiptUri?: string | null;
  /** Receipt has the ownership and project link required for a card. */
  cardEligible?: boolean;
  /** Project cover art, surfaced on the reward card. */
  image?: string | null;
};

export type CheckoutSideEffects = "live" | "mock";

const TIP_LINE_KEY = "gainforest-tip";
/** Compact tip choices — replaces the old full-width slider. */
const TIP_PRESETS = [5, 10, 15, 20] as const;
const MOCK_RECIPIENT_ADDRESS = "0x1111111111111111111111111111111111111111";
const MOCK_WALLET_ADDRESS = "0x2222222222222222222222222222222222222222";
const MOCK_TIP_ADDRESS = "0x3333333333333333333333333333333333333333";

function mockTransactionHash(index: number): string {
  return `0x${(index + 1).toString(16).padStart(64, "0")}`;
}

function mockReceiptUri(index: number): string {
  return `at://did:plc:testregistryfacilitator/org.hypercerts.funding.receipt/${(index + 1).toString(16).padStart(64, "0")}`;
}

function waitForMock(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/**
 * Client-side guards so the checkout can never hang on "Processing…"
 * forever when the settlement request stalls (server killed, connection
 * dropped, stuck transaction). Slightly above the payment routes'
 * maxDuration (300s) so a slow-but-alive server still gets to answer.
 */
const SETTLE_TIMEOUT_MS = 180_000;
const BATCH_SETTLE_TIMEOUT_MS = 320_000;

/** Payment state unknown — it may still complete; never retry blindly. */
const SETTLEMENT_TIMEOUT_RAW = { code: "SETTLEMENT_TIMEOUT" } as const;

function socialShareUrl(platform: "x" | "bluesky" | "telegram", text: string): string {
  const encoded = encodeURIComponent(text);
  if (platform === "x") return `https://x.com/intent/tweet?text=${encoded}`;
  if (platform === "bluesky") return `https://bsky.app/intent/compose?text=${encoded}`;
  return `tg://msg?text=${encoded}`;
}

async function signAndSettle(params: {
  ethereum: EthereumProvider;
  senderWallet: string;
  recipientWallet: string;
  amountUsd: number;
  endpoint: string;
  body: Record<string, unknown>;
}): Promise<{ txHash: string; receiptUri: string | null; cardEligible: boolean } | { errorRaw: unknown }> {
  const usdcAmount = toUsdcUnits(params.amountUsd);
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
      from: params.senderWallet,
      to: params.recipientWallet,
      value: usdcAmount.toString(),
      validAfter: "0",
      validBefore,
      nonce,
    },
  };

  const signature = await params.ethereum.request<`0x${string}`>({
    method: "eth_signTypedData_v4",
    params: [params.senderWallet, JSON.stringify(typedData)],
  });

  const sigHeader = createPaymentSignatureHeader({
    signature,
    senderWallet: params.senderWallet,
    recipientWallet: params.recipientWallet,
    usdcAmount,
    nonce,
    validBefore,
  });

  let response: Response;
  try {
    response = await fetch(params.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": sigHeader },
      body: JSON.stringify(params.body),
      signal: AbortSignal.timeout(SETTLE_TIMEOUT_MS),
    });
  } catch {
    // Timed out or the connection dropped mid-settlement: the payment may
    // still have gone through, so surface the "check your wallet" message.
    return { errorRaw: SETTLEMENT_TIMEOUT_RAW };
  }
  const raw = (await response.json().catch(() => null)) as {
    transactionHash?: string;
    receiptUri?: string | null;
    cardEligible?: boolean;
  } | null;
  if (!response.ok || typeof raw?.transactionHash !== "string") return { errorRaw: raw };
  return {
    txHash: raw.transactionHash,
    receiptUri: typeof raw.receiptUri === "string" ? raw.receiptUri : null,
    cardEligible: raw.cardEligible === true,
  };
}

type BatchLineResult = {
  orgDid: string;
  rkey?: string;
  amount: string;
  transactionHash?: string;
  receiptUri?: string | null;
  cardEligible?: boolean;
  error?: string;
};

type BatchResponse = {
  success?: boolean;
  pullTransactionHash?: string;
  lines?: BatchLineResult[];
  tip?: { amount: string; transactionHash?: string; error?: string };
  error?: string;
  code?: string;
};

/**
 * ONE wallet approval for the whole cart: the donor authorizes the TOTAL to
 * the facilitator wallet, which fans it out to every organization plus the
 * tip server-side (see /api/checkout).
 */
async function signAndSettleBatch(params: {
  ethereum: EthereumProvider;
  senderWallet: string;
  facilitatorWallet: string;
  totalUnits: bigint;
  body: Record<string, unknown>;
  onSigned?: () => void;
}): Promise<{ ok: true; response: BatchResponse } | { ok: false; errorRaw: unknown }> {
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
      from: params.senderWallet,
      to: params.facilitatorWallet,
      value: params.totalUnits.toString(),
      validAfter: "0",
      validBefore,
      nonce,
    },
  };

  const signature = await params.ethereum.request<`0x${string}`>({
    method: "eth_signTypedData_v4",
    params: [params.senderWallet, JSON.stringify(typedData)],
  });
  params.onSigned?.();

  const sigHeader = createPaymentSignatureHeader({
    signature,
    senderWallet: params.senderWallet,
    recipientWallet: params.facilitatorWallet,
    usdcAmount: params.totalUnits,
    nonce,
    validBefore,
  });

  let response: Response;
  try {
    response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": sigHeader },
      body: JSON.stringify(params.body),
      signal: AbortSignal.timeout(BATCH_SETTLE_TIMEOUT_MS),
    });
  } catch {
    // Timed out or the connection dropped mid-settlement: the payment may
    // still have gone through, so surface the "check your wallet" message.
    return { ok: false, errorRaw: SETTLEMENT_TIMEOUT_RAW };
  }
  const raw = (await response.json().catch(() => null)) as BatchResponse | null;
  if (!response.ok || !raw?.success) return { ok: false, errorRaw: raw };
  return { ok: true, response: raw };
}

export function CheckoutView({
  authSession,
  sideEffects = "live",
  onBackToCart,
  onExploreMore,
}: {
  authSession: AuthSession;
  /** Mock mode preserves this component's UI/state machine but blocks every live payment side effect. */
  sideEffects?: CheckoutSideEffects;
  onBackToCart?: () => void;
  onExploreMore?: () => void;
}) {
  const t = useTranslations("cart.checkoutPage");
  const cart = useCart();
  const { hydrated, items, tipPercent, setTipPercent, removeItem } = cart;

  const [recipients, setRecipients] = useState<Record<string, RecipientState>>({});
  const [tipConfig, setTipConfig] = useState<TipConfig>({ status: "loading" });
  const [wallet, setWallet] = useState<{ address: string; balance: bigint | null } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState("");
  const messageCountId = `${useId()}-count`;

  // Bioblitz award: compute the deterministic message and track if we're in award mode
  const bioblitzAward = useMemo(() => {
    const awardItem = items.find((item) => item.awardMeta?.type === "bioblitz");
    if (!awardItem?.awardMeta || awardItem.awardMeta.type !== "bioblitz") return null;
    const { roundId, prize } = awardItem.awardMeta;
    return {
      roundId,
      prize,
      message: bioblitzPrizeReceiptMessage(roundId, prize, bioblitzRoundUsesPoints(roundId)),
    };
  }, [items]);

  // Pre-fill the message for bioblitz awards when the cart hydrates
  const bioblitzMessageSetRef = useRef(false);
  useEffect(() => {
    if (hydrated && bioblitzAward && !bioblitzMessageSetRef.current) {
      setMessage(bioblitzAward.message);
      bioblitzMessageSetRef.current = true;
    }
  }, [hydrated, bioblitzAward]);
  const [phase, setPhase] = useState<"review" | "paying" | "done">("review");
  const [lineStates, setLineStates] = useState<Record<string, LineState>>({});
  const [completed, setCompleted] = useState<CompletedLine[]>([]);
  const [copied, setCopied] = useState(false);
  /** The fee/tip explainer beside the footer note. */
  const [feeInfoOpen, setFeeInfoOpen] = useState(false);
  const payingRef = useRef(false);

  // Verify each organization's donation wallet once.
  const orgDids = useMemo(() => [...new Set(items.map((item) => item.orgDid))], [items]);
  useEffect(() => {
    if (sideEffects === "mock") {
      setRecipients(Object.fromEntries(orgDids.map((orgDid) => [orgDid, { status: "ready", address: MOCK_RECIPIENT_ADDRESS } satisfies RecipientState])));
      return;
    }

    let cancelled = false;
    for (const orgDid of orgDids) {
      if (recipients[orgDid]) continue;
      setRecipients((current) => ({ ...current, [orgDid]: { status: "loading" } }));
      fetchRecipient(orgDid)
        .then((result) => {
          if (cancelled) return;
          setRecipients((current) => ({
            ...current,
            [orgDid]: result.hasAttestation
              ? { status: "ready", address: result.address }
              : { status: "unavailable" },
          }));
        })
        .catch(() => {
          if (cancelled) return;
          setRecipients((current) => ({ ...current, [orgDid]: { status: "unavailable" } }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgDids, sideEffects]);

  useEffect(() => {
    if (sideEffects === "mock") {
      setTipConfig({ status: "ready", enabled: true, address: MOCK_TIP_ADDRESS });
      return;
    }

    let cancelled = false;
    fetch("/api/tip")
      .then((response) => response.json())
      .then((json: { enabled?: boolean; address?: string } | null) => {
        if (cancelled) return;
        setTipConfig({ status: "ready", enabled: json?.enabled === true, address: json?.address });
      })
      .catch(() => {
        if (cancelled) return;
        setTipConfig({ status: "ready", enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, [sideEffects]);

  const payableItems = items.filter(
    (item) => itemAmountValid(item) && recipients[item.orgDid]?.status === "ready",
  );
  const blockedItems = items.filter((item) => recipients[item.orgDid]?.status === "unavailable");
  const checkingRecipients = items.some((item) => (recipients[item.orgDid]?.status ?? "loading") === "loading");

  const subtotalUsd = Math.round(payableItems.reduce((total, item) => total + item.amountUsd, 0) * 100) / 100;
  const tipEnabled = tipConfig.status === "ready" && tipConfig.enabled && Boolean(tipConfig.address);
  const tipUsd = tipEnabled ? tipAmountUsd(subtotalUsd, tipPercent) : 0;
  const visibleTipPresets = tipPercent > 0 && !TIP_PRESETS.some((percent) => percent === tipPercent)
    ? [...TIP_PRESETS, tipPercent].sort((left, right) => left - right)
    : TIP_PRESETS;
  const totalUsd = Math.round((subtotalUsd + tipUsd) * 100) / 100;
  const hasEnoughBalance = wallet?.balance != null && wallet.balance >= toUsdcUnits(totalUsd);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);

    if (sideEffects === "mock") {
      await waitForMock(350);
      setWallet({ address: MOCK_WALLET_ADDRESS, balance: toUsdcUnits(500) });
      setConnecting(false);
      return;
    }

    const ethereum = getEthereum();
    if (!ethereum) {
      setConnectError(t("noWallet"));
      setConnecting(false);
      return;
    }
    try {
      const accounts = await ethereum.request<string[]>({ method: "eth_requestAccounts" });
      const address = accounts[0];
      if (!address) throw new Error(t("connectFailed"));
      await ensureEthereumNetwork(ethereum);
      const balance = await readUsdcBalance(ethereum, address).catch(() => null);
      setWallet({ address, balance });
    } catch (error) {
      setConnectError(error instanceof Error && error.message ? error.message : t("connectFailed"));
    } finally {
      setConnecting(false);
    }
  };

  const parseSettleError = (raw: unknown): string => {
    if (raw && typeof raw === "object") {
      const code = Reflect.get(raw, "code");
      if (code === "NON_ANONYMOUS_DONATION_REQUIRES_DONOR_DID") return t("errorProfile");
      if (code === "SETTLEMENT_TIMEOUT") return t("errorTimeout");
      const error = Reflect.get(raw, "error");
      if (typeof error === "string") {
        const lower = error.toLowerCase();
        if (lower.includes("receive donations")) return t("errorCannotReceive");
        if (lower.includes("amount")) return t("errorAmount");
        if (lower.includes("match")) return t("errorChanged");
      }
    }
    return t("errorGeneric");
  };

  const handleDonate = async () => {
    if (payingRef.current || !wallet) return;
    payingRef.current = true;
    setPhase("paying");

    // One optional note travels with every donation line. Blank stays absent,
    // so it never touches the receipt when the donor leaves it empty.
    const donationMessage = sanitizeDonationMessage(message);

    const lines = payableItems.map((item) => ({ item, key: cartItemKey(item) }));
    const includeTip = tipUsd > 0 && tipEnabled && tipConfig.status === "ready" && !!tipConfig.address;
    const initialStates: Record<string, LineState> = {};
    for (const line of lines) initialStates[line.key] = { phase: "pending" };
    if (tipUsd > 0 && tipEnabled) initialStates[TIP_LINE_KEY] = { phase: "pending" };
    setLineStates(initialStates);

    const setLine = (key: string, state: LineState) =>
      setLineStates((current) => ({ ...current, [key]: state }));

    if (sideEffects === "mock") {
      for (const { key } of lines) setLine(key, { phase: "signing" });
      if (includeTip) setLine(TIP_LINE_KEY, { phase: "signing" });
      await waitForMock(550);

      for (const { key } of lines) setLine(key, { phase: "processing" });
      if (includeTip) setLine(TIP_LINE_KEY, { phase: "processing" });
      await waitForMock(850);

      const mockResults: CompletedLine[] = lines.map(({ item, key }, index) => {
        const txHash = mockTransactionHash(index);
        setLine(key, { phase: "done", txHash });
        removeItem(item.orgDid, item.rkey);
        return {
          kind: "donation",
          title: item.title,
          orgName: item.orgName,
          amountUsd: item.amountUsd,
          txHash,
          receiptUri: mockReceiptUri(index),
          cardEligible: true,
          image: item.image,
        };
      });
      if (includeTip) {
        const txHash = mockTransactionHash(lines.length);
        setLine(TIP_LINE_KEY, { phase: "done", txHash });
        mockResults.push({
          kind: "tip",
          title: t("tipLineLabel"),
          orgName: "GainForest",
          amountUsd: tipUsd,
          txHash,
        });
      }

      setCompleted((current) => [...current, ...mockResults]);
      payingRef.current = false;
      setPhase("done");
      return;
    }

    const ethereum = getEthereum();
    if (!ethereum) {
      payingRef.current = false;
      setPhase("review");
      return;
    }

    const results: CompletedLine[] = [];
    let anyFailed = false;

    // Batched settlement: one wallet approval for the whole cart. The donor
    // authorizes the total to the facilitator, which fans it out server-side.
    // A single donation without a tip keeps the direct donor→org transfer.
    const facilitatorWallet = FACILITATOR_WALLET_ADDRESS;
    if (facilitatorWallet && lines.length + (includeTip ? 1 : 0) > 1) {
      const readyLines = lines.filter(({ item }) => recipients[item.orgDid]?.status === "ready");
      const totalUnits =
        readyLines.reduce((sum, { item }) => sum + toUsdcUnits(item.amountUsd), 0n) +
        (includeTip ? toUsdcUnits(tipUsd) : 0n);
      for (const { key } of readyLines) setLine(key, { phase: "signing" });
      if (includeTip) setLine(TIP_LINE_KEY, { phase: "signing" });

      try {
        const outcome = await signAndSettleBatch({
          ethereum,
          senderWallet: wallet.address,
          facilitatorWallet,
          totalUnits,
          onSigned: () => {
            for (const { key } of readyLines) setLine(key, { phase: "processing" });
            if (includeTip) setLine(TIP_LINE_KEY, { phase: "processing" });
          },
          body: {
            lines: readyLines.map(({ item }) => ({
              orgDid: item.orgDid,
              ...(item.kind === "project" ? { rkey: item.rkey } : {}),
              amount: String(item.amountUsd),
            })),
            ...(includeTip ? { tipAmount: String(tipUsd) } : {}),
            anonymous: authSession.isLoggedIn ? anonymous : true,
            ...(donationMessage ? { message: donationMessage } : {}),
          },
        });

        if (outcome.ok) {
          for (const { item, key } of readyLines) {
            const expectedRkey = item.kind === "project" ? item.rkey : undefined;
            const lineResult = outcome.response.lines?.find(
              (line) => line.orgDid === item.orgDid && line.rkey === expectedRkey,
            );
            if (lineResult?.transactionHash) {
              setLine(key, { phase: "done", txHash: lineResult.transactionHash });
              results.push({
                kind: "donation",
                title: item.title,
                orgName: item.orgName,
                amountUsd: item.amountUsd,
                txHash: lineResult.transactionHash,
                receiptUri: lineResult.receiptUri,
                cardEligible: lineResult.cardEligible === true,
                image: item.image,
              });
              removeItem(item.orgDid, item.rkey);
            } else {
              anyFailed = true;
              setLine(key, { phase: "failed", error: lineResult?.error ?? t("errorGeneric") });
            }
          }
          if (includeTip) {
            const tipResult = outcome.response.tip;
            if (tipResult?.transactionHash) {
              setLine(TIP_LINE_KEY, { phase: "done", txHash: tipResult.transactionHash });
              results.push({ kind: "tip", title: t("tipLineLabel"), orgName: "GainForest", amountUsd: tipUsd, txHash: tipResult.transactionHash });
            } else {
              // A failed tip never blocks the donations that already settled.
              setLine(TIP_LINE_KEY, { phase: "failed", error: tipResult?.error ?? t("tipFailed") });
            }
          }
        } else {
          anyFailed = true;
          const message = parseSettleError(outcome.errorRaw);
          for (const { key } of readyLines) setLine(key, { phase: "failed", error: message });
          if (includeTip) setLine(TIP_LINE_KEY, { phase: "failed", error: t("tipSkipped") });
        }
      } catch (error) {
        anyFailed = true;
        const message = error instanceof Error && error.message ? error.message.split("\n")[0] : t("errorGeneric");
        for (const { key } of readyLines) setLine(key, { phase: "failed", error: message });
        if (includeTip) setLine(TIP_LINE_KEY, { phase: "failed", error: t("tipSkipped") });
      }

      const balance = await readUsdcBalance(ethereum, wallet.address).catch(() => null);
      setWallet((current) => (current ? { ...current, balance } : current));

      setCompleted((current) => [...current, ...results]);
      payingRef.current = false;
      if (!anyFailed && results.length > 0) {
        setPhase("done");
      } else {
        setPhase("review");
      }
      return;
    }

    for (const { item, key } of lines) {
      const recipient = recipients[item.orgDid];
      if (recipient?.status !== "ready") continue;
      setLine(key, { phase: "signing" });
      try {
        const outcome = await signAndSettle({
          ethereum,
          senderWallet: wallet.address,
          recipientWallet: recipient.address,
          amountUsd: item.amountUsd,
          endpoint: "/api/fund",
          body: {
            ...(item.kind === "project"
              ? { activityUri: `at://${item.orgDid}/org.hypercerts.claim.activity/${item.rkey}` }
              : {}),
            orgDid: item.orgDid,
            amount: String(item.amountUsd),
            currency: "USDC",
            anonymous: authSession.isLoggedIn ? anonymous : true,
            ...(donationMessage ? { message: donationMessage } : {}),
          },
        });
        if ("txHash" in outcome) {
          setLine(key, { phase: "done", txHash: outcome.txHash });
          results.push({
            kind: "donation",
            title: item.title,
            orgName: item.orgName,
            amountUsd: item.amountUsd,
            txHash: outcome.txHash,
            receiptUri: outcome.receiptUri,
            cardEligible: outcome.cardEligible,
            image: item.image,
          });
          removeItem(item.orgDid, item.rkey);
        } else {
          anyFailed = true;
          setLine(key, { phase: "failed", error: parseSettleError(outcome.errorRaw) });
        }
      } catch (error) {
        anyFailed = true;
        setLine(key, {
          phase: "failed",
          error: error instanceof Error && error.message ? error.message.split("\n")[0] : t("errorGeneric"),
        });
      }
      // Refresh the visible balance between transfers so the next line's
      // signing prompt matches reality.
      const balance = await readUsdcBalance(ethereum, wallet.address).catch(() => null);
      setWallet((current) => (current ? { ...current, balance } : current));
    }

    if (tipUsd > 0 && tipEnabled && tipConfig.status === "ready" && tipConfig.address && results.length > 0) {
      setLine(TIP_LINE_KEY, { phase: "signing" });
      try {
        const outcome = await signAndSettle({
          ethereum,
          senderWallet: wallet.address,
          recipientWallet: tipConfig.address,
          amountUsd: tipUsd,
          endpoint: "/api/tip",
          body: {
            amount: String(tipUsd),
            anonymous: authSession.isLoggedIn ? anonymous : true,
          },
        });
        if ("txHash" in outcome) {
          setLine(TIP_LINE_KEY, { phase: "done", txHash: outcome.txHash });
          results.push({ kind: "tip", title: t("tipLineLabel"), orgName: "GainForest", amountUsd: tipUsd, txHash: outcome.txHash });
        } else {
          // A failed tip never blocks the donations that already settled.
          setLine(TIP_LINE_KEY, { phase: "failed", error: parseSettleError(outcome.errorRaw) });
        }
      } catch {
        setLine(TIP_LINE_KEY, { phase: "failed", error: t("tipFailed") });
      }
    } else if (initialStates[TIP_LINE_KEY]) {
      setLine(TIP_LINE_KEY, { phase: "failed", error: t("tipSkipped") });
    }

    setCompleted((current) => [...current, ...results]);
    payingRef.current = false;

    if (!anyFailed && results.length > 0) {
      setPhase("done");
    } else {
      // Partial or complete failure: return to review with the per-line
      // errors still visible so the visitor can retry what's left.
      setPhase("review");
    }
  };

  const handleRetry = () => {
    setLineStates({});
    setPhase("review");
  };

  const donatedTotal = completed.reduce((total, line) => total + line.amountUsd, 0);
  const shareText = t("shareText", {
    amount: `$${donatedTotal.toFixed(2)}`,
    url: typeof window !== "undefined" ? `${window.location.origin}/projects` : "https://www.gainforest.app/projects",
  });
  const shareLinks = [
    { platform: "x" as const, label: t("shareOnX"), href: socialShareUrl("x", shareText), className: "text-black dark:text-white" },
    { platform: "bluesky" as const, label: t("shareOnBluesky"), href: socialShareUrl("bluesky", shareText), className: "text-blue-600" },
    { platform: "telegram" as const, label: t("shareOnTelegram"), href: socialShareUrl("telegram", shareText), className: "text-blue-500" },
  ];
  const completedDonations = completed.filter((line) => line.kind === "donation");
  const allDonationsRecorded = completedDonations.length > 0 && completedDonations.every(
    (line) => typeof line.receiptUri === "string" && line.receiptUri.length > 0,
  );
  const rewardCards = authSession.isLoggedIn && !anonymous ? buildRewardCards(completed) : [];
  const recentReceiptQuery = new URLSearchParams();
  for (const card of rewardCards) recentReceiptQuery.append("receipt", card.lines[0]?.receiptUri ?? "");
  const cardsHref = recentReceiptQuery.size > 0 ? `/bumicerts?${recentReceiptQuery.toString()}` : "/bumicerts";

  if (!hydrated) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-10" aria-busy="true" />;
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="flex flex-col items-center gap-4 text-center">
          {rewardCards.length > 0 ? (
            <RewardDeck
              cards={rewardCards}
              cardsHref={sideEffects === "mock" ? "/_test/my-cards" : cardsHref}
            />
          ) : null}
          <p className="mt-2 font-instrument text-5xl italic text-primary">{t("thankYou")}</p>
          <p className="text-pretty text-muted-foreground">
            {t("successSummary", { amount: `$${donatedTotal.toFixed(2)}` })}
          </p>
          <p className="text-xs text-muted-foreground">
            {!allDonationsRecorded
              ? t("receiptIssue")
              : authSession.isLoggedIn && !anonymous
                ? t("recordedWithProfile")
                : t("recordedAnonymous")}
          </p>
        </div>

        <ul className="mt-6 divide-y divide-border-soft rounded-3xl bg-card/70 p-5 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
          {completed.map((line, index) => {
            const txHref = blockExplorerUrl(line.txHash, PAYMENT_NETWORK);
            return (
              <li key={`${line.txHash}-${index}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    {line.kind === "tip" ? <HeartHandshakeIcon className="mr-1 inline size-3.5 text-primary" aria-hidden /> : null}
                    {line.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{line.orgName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums text-foreground">${line.amountUsd.toFixed(2)}</span>
                  {txHref ? (
                    <Link href={txHref} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={t("paymentDetails")}>
                      <ArrowUpRightIcon className="size-4" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex w-full flex-col gap-2 rounded-3xl bg-muted/50 p-4 pt-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Share2Icon className="size-3.5" aria-hidden />
            <span className="text-sm">{t("shareTitle")}</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {shareLinks.map((item) => (
              <Button key={item.platform} variant="outline" className="shadow-none" asChild>
                <Link href={item.href} target="_blank" rel="noreferrer" aria-label={item.label}>
                  <span className={item.className}>
                    <SocialGlyph platform={item.platform} />
                  </span>
                </Link>
              </Button>
            ))}
            <Button
              variant="outline"
              className="shadow-none"
              onClick={async () => {
                await navigator.clipboard?.writeText(shareText);
                setCopied(true);
              }}
              aria-label={t("copyShareText")}
            >
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            </Button>
          </div>
        </div>

        {onExploreMore ? (
          <Button className="mt-6 w-full" onClick={onExploreMore}>
            <CompassIcon className="size-4" /> {t("exploreMore")}
          </Button>
        ) : (
          <Button asChild className="mt-6 w-full">
            <Link href="/projects">
              <CompassIcon className="size-4" /> {t("exploreMore")}
            </Link>
          </Button>
        )}
      </div>
    );
  }

  // ── Empty cart ────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-20 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-muted text-muted-foreground">
          <ShoppingCartIcon className="size-7" aria-hidden />
        </div>
        <h1 className="font-instrument text-4xl italic text-foreground">{t("emptyTitle")}</h1>
        {onExploreMore ? (
          <Button className="mt-2" onClick={onExploreMore}>
            <CompassIcon className="size-4" /> {t("exploreMore")}
          </Button>
        ) : (
          <Button asChild className="mt-2">
            <Link href="/projects">
              <CompassIcon className="size-4" /> {t("exploreMore")}
            </Link>
          </Button>
        )}
      </div>
    );
  }

  const paying = phase === "paying";
  // Only project donations mint collectible cards, and only for a signed-in,
  // non-anonymous donor. Otherwise the panel simply explains why.
  const cardPreviewItems = payableItems.filter((item) => item.kind === "project");
  const willEarnCards = authSession.isLoggedIn && !anonymous && cardPreviewItems.length > 0;
  const cardsMessage = !authSession.isLoggedIn
    ? t("signedOutNote")
    : anonymous
      ? t("anonymousHint")
      : checkingRecipients
        ? t("cardsCheckingNote")
        : t("cardsUnavailableNote");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {onBackToCart ? (
        <button
          type="button"
          onClick={onBackToCart}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden /> {t("backToCart")}
        </button>
      ) : (
        <Link href="/cart" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden /> {t("backToCart")}
        </Link>
      )}
      <h1 className="mt-4 font-instrument text-4xl italic leading-none tracking-[-0.01em] text-foreground sm:text-5xl">{t("title")}</h1>

      <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* ── Your donation: the order itself lives in the main column ─────── */}
        <div className="min-w-0">
          <div className="rounded-3xl bg-muted px-5">
            <ul className="divide-y divide-border">
              {payableItems.map((item) => {
                const key = cartItemKey(item);
                const line = lineStates[key];
                return (
                  <li key={key} className="flex items-center justify-between gap-4 py-4">
                    <span className="flex min-w-0 items-center gap-2.5">
                      {line?.phase === "signing" || line?.phase === "processing" ? (
                        <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                      ) : line?.phase === "done" ? (
                        <CheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
                      ) : line?.phase === "failed" ? (
                        <CircleAlertIcon className="size-4 shrink-0 text-destructive" aria-hidden />
                      ) : null}
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">{item.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{item.orgName}</span>
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-sm text-foreground">${item.amountUsd.toFixed(2)}</span>
                  </li>
                );
              })}
            </ul>

            {blockedItems.length > 0 ? (
              <p className="mb-4 rounded-2xl bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-400">
                {t("blockedItems", { titles: blockedItems.map((item) => item.title).join(", ") })}
              </p>
            ) : null}

            <div className="border-t border-border py-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("donations")}</span>
                <span className="tabular-nums text-foreground">${subtotalUsd.toFixed(2)}</span>
              </div>

              {tipEnabled ? (
                <div className="mt-4 border-t border-border pt-4">
                  <label className="flex cursor-pointer items-center justify-between gap-4">
                    <span className="text-sm text-foreground">{t("tipTitle")}</span>
                    <Checkbox
                      checked={tipPercent > 0}
                      onCheckedChange={(checked) => setTipPercent(checked === true ? 10 : 0)}
                      disabled={paying}
                    />
                  </label>
                  {tipPercent > 0 ? (
                    <>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {visibleTipPresets.map((percent) => {
                          const active = tipPercent === percent;
                          return (
                            <button
                              key={percent}
                              type="button"
                              disabled={paying}
                              aria-pressed={active}
                              onClick={() => setTipPercent(percent)}
                              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                                active ? "bg-primary text-primary-foreground" : "bg-background/80 text-foreground hover:bg-background"
                              }`}
                            >
                              {percent}%
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-4 text-sm">
                        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                          {lineStates[TIP_LINE_KEY]?.phase === "signing" || lineStates[TIP_LINE_KEY]?.phase === "processing" ? (
                            <Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
                          ) : lineStates[TIP_LINE_KEY]?.phase === "done" ? (
                            <CheckIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
                          ) : lineStates[TIP_LINE_KEY]?.phase === "failed" ? (
                            <CircleAlertIcon className="size-3.5 shrink-0 text-destructive" aria-hidden />
                          ) : null}
                          <span className="truncate">{t("tipLineLabel")}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-foreground">${tipUsd.toFixed(2)}</span>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
                <span className="text-sm text-muted-foreground">{t("total")}</span>
                <span className="font-instrument text-4xl italic tracking-tight tabular-nums text-foreground">${totalUsd.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Donor visibility and message stay together, separate from billing. */}
          <div className="mt-6 rounded-3xl bg-muted p-5">
            {authSession.isLoggedIn ? (
              <section className="border-b border-border pb-5">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="text-sm text-foreground">{t("anonymousLabel")}</span>
                  <Switch checked={anonymous} onCheckedChange={setAnonymous} disabled={paying} />
                </label>
              </section>
            ) : null}

            <section className={authSession.isLoggedIn ? "pt-5" : undefined}>
              <Textarea
                value={message}
                onChange={(event) => setMessage(clampDonationMessage(event.target.value))}
                maxLength={DONATION_MESSAGE_MAX_LENGTH * 2}
                disabled={paying || Boolean(bioblitzAward)}
                readOnly={Boolean(bioblitzAward)}
                rows={3}
                placeholder={t("messagePlaceholder")}
                aria-label={t("messagePlaceholder")}
                aria-describedby={messageCountId}
                className="min-h-20 resize-none rounded-xl border-border/60 bg-background shadow-none"
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">
                  {bioblitzAward
                    ? t("bioblitzAwardNote")
                    : anonymous || !authSession.isLoggedIn ? t("messageAnonymousNote") : ""}
                </span>
                <span id={messageCountId} className="shrink-0 tabular-nums text-muted-foreground/60">{Array.from(message).length}/{DONATION_MESSAGE_MAX_LENGTH}</span>
              </div>
            </section>
          </div>

          {Object.values(lineStates).some((line) => line.phase === "failed") ? (
            <div className="mt-5 space-y-1">
              {Object.entries(lineStates)
                .filter(([, line]) => line.phase === "failed" && line.error)
                .map(([key, line]) => (
                  <p key={key} className="rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {line.error}
                  </p>
                ))}
            </div>
          ) : null}
        </div>

        {/* ── Sidebar: card preview and payment connection ────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-24">
          <section className="rounded-3xl bg-muted p-5">
            <p className="font-instrument text-xl italic text-foreground">{t("cardsPreviewTitle")}</p>
            {willEarnCards ? (
              <div className="mt-4 flex">
                {cardPreviewItems.slice(0, 5).map((item, index) => {
                  const tier = tierForAmount(item.amountUsd);
                  return (
                    <div
                      key={cartItemKey(item)}
                      className={`relative aspect-[63/88] w-16 shrink-0 rounded-xl p-[2px] shadow-md ${index > 0 ? "-ml-4" : ""}`}
                      style={{ background: `linear-gradient(145deg, ${tier.foil})`, zIndex: index }}
                    >
                      <div className="relative size-full overflow-hidden rounded-[10px] bg-black">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image} alt="" className="absolute inset-0 size-full object-cover" referrerPolicy="no-referrer" draggable={false} />
                        ) : (
                          <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${tier.foil})` }} aria-hidden />
                        )}
                        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{cardsMessage}</p>
            )}
          </section>

          <section className="flex min-h-64 flex-col items-center justify-center rounded-3xl bg-muted p-6 text-center">
            <WalletIcon className="size-12 text-primary" strokeWidth={1.5} aria-hidden />
            <p className="mt-4 font-instrument text-xl italic text-foreground">{t("walletTitle")}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("walletHint")}</p>

            {wallet ? (
              <div className="mt-5 flex flex-col items-center">
                <div className="flex max-w-full items-center gap-2 rounded-full bg-background px-3 py-2">
                  <p className="truncate font-mono text-sm text-foreground">{shortWallet(wallet.address)}</p>
                  <BadgeCheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {wallet.balance !== null ? t("available", { amount: `$${formatUsdc(wallet.balance)}` }) : t("balanceUnavailable")}
                </p>
              </div>
            ) : null}

            <Button
              className="mt-5 min-w-44"
              size="sm"
              disabled={
                wallet
                  ? paying || checkingRecipients || payableItems.length === 0 || (wallet.balance !== null && !hasEnoughBalance)
                  : connecting
              }
              onClick={() => {
                if (!wallet) {
                  void handleConnect();
                  return;
                }
                if (Object.values(lineStates).some((line) => line.phase === "failed")) handleRetry();
                void handleDonate();
              }}
            >
              {!wallet ? (
                <>
                  <WalletIcon className="size-4" /> {connecting ? t("connecting") : t("connectWallet")}
                </>
              ) : paying ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" /> {t("processing")}
                </>
              ) : Object.values(lineStates).some((line) => line.phase === "failed") ? (
                t("tryAgain")
              ) : (
                t("donateNow", { amount: `$${totalUsd.toFixed(2)}` })
              )}
            </Button>

            {payableItems.length > 1 || (tipEnabled && tipUsd > 0) ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {FACILITATOR_WALLET_ADDRESS
                  ? t("singleApprovalNote")
                  : t("multiApprovalNote", { count: payableItems.length + (tipEnabled && tipUsd > 0 ? 1 : 0) })}
              </p>
            ) : null}
            {connectError ? <p className="mt-3 text-xs text-destructive">{connectError}</p> : null}
            {wallet && wallet.balance !== null && !hasEnoughBalance ? (
              <p className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {t("insufficientBalance")}
              </p>
            ) : null}
            {paying ? <p className="mt-2 text-xs text-muted-foreground">{t("doNotClose")}</p> : null}
            {!paying ? (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs leading-5 text-muted-foreground">
                <span>{t("footerNote", { amount: `$${subtotalUsd.toFixed(2)}` })}</span>
                <Popover open={feeInfoOpen} onOpenChange={setFeeInfoOpen}>
                  <PopoverAnchor asChild>
                    <button
                      type="button"
                      aria-label={t("footerInfoLabel")}
                      aria-expanded={feeInfoOpen}
                      onClick={() => setFeeInfoOpen(true)}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "mouse") setFeeInfoOpen(true);
                      }}
                      onPointerLeave={(event) => {
                        if (event.pointerType === "mouse") setFeeInfoOpen(false);
                      }}
                      onFocus={(event) => {
                        if (event.currentTarget.matches(":focus-visible")) setFeeInfoOpen(true);
                      }}
                      onBlur={() => setFeeInfoOpen(false)}
                      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <InfoIcon className="size-3.5" aria-hidden />
                    </button>
                  </PopoverAnchor>
                  <PopoverContent
                    align="end"
                    side="top"
                    className="w-64 p-3 text-xs leading-5 text-muted-foreground"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                  >
                    {t("footerInfoFees")}
                    {tipEnabled && tipUsd > 0 ? ` ${t("footerInfoTip", { tip: `$${tipUsd.toFixed(2)}` })}` : ""}
                  </PopoverContent>
                </Popover>
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
