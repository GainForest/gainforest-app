"use client";

/**
 * Checkout for the donation cart. One USDC wallet approval per project plus
 * an optional GainForest tip (slider, default 10%) that goes to the platform
 * wallet covering everyone's network fees.
 *
 * Payments run sequentially; each line shows its own progress. Successful
 * lines are removed from the cart immediately, so a partial failure leaves
 * only the unpaid projects behind for a retry.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
  LeafIcon,
  Loader2Icon,
  Share2Icon,
  ShoppingCartIcon,
  WalletIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AuthSession } from "@/app/_lib/auth";
import { SocialGlyph } from "@/app/_components/SocialIcon";
import { blockExplorerUrl } from "@/app/_lib/urls";
import {
  cartItemKey,
  MAX_TIP_PERCENT,
  tipAmountUsd,
  useCart,
  type CartItem,
} from "@/app/_components/cart/CartProvider";
import { itemAmountValid } from "@/app/cart/_components/CartView";
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
};

const TIP_LINE_KEY = "gainforest-tip";

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
}): Promise<{ txHash: string } | { errorRaw: unknown }> {
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

  const response = await fetch(params.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": sigHeader },
    body: JSON.stringify(params.body),
  });
  const raw = (await response.json().catch(() => null)) as { transactionHash?: string } | null;
  if (!response.ok || typeof raw?.transactionHash !== "string") return { errorRaw: raw };
  return { txHash: raw.transactionHash };
}

type BatchLineResult = {
  orgDid: string;
  rkey?: string;
  amount: string;
  transactionHash?: string;
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

  const response = await fetch("/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": sigHeader },
    body: JSON.stringify(params.body),
  });
  const raw = (await response.json().catch(() => null)) as BatchResponse | null;
  if (!response.ok || !raw?.success) return { ok: false, errorRaw: raw };
  return { ok: true, response: raw };
}

export function CheckoutView({ authSession }: { authSession: AuthSession }) {
  const t = useTranslations("cart.checkoutPage");
  const cart = useCart();
  const { hydrated, items, tipPercent, setTipPercent, removeItem } = cart;

  const [recipients, setRecipients] = useState<Record<string, RecipientState>>({});
  const [tipConfig, setTipConfig] = useState<TipConfig>({ status: "loading" });
  const [wallet, setWallet] = useState<{ address: string; balance: bigint | null } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [phase, setPhase] = useState<"review" | "paying" | "done">("review");
  const [lineStates, setLineStates] = useState<Record<string, LineState>>({});
  const [completed, setCompleted] = useState<CompletedLine[]>([]);
  const [copied, setCopied] = useState(false);
  const payingRef = useRef(false);

  // Verify each organization's donation wallet once.
  const orgDids = useMemo(() => [...new Set(items.map((item) => item.orgDid))], [items]);
  useEffect(() => {
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
  }, [orgDids]);

  useEffect(() => {
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
  }, []);

  const payableItems = items.filter(
    (item) => itemAmountValid(item) && recipients[item.orgDid]?.status === "ready",
  );
  const blockedItems = items.filter((item) => recipients[item.orgDid]?.status === "unavailable");
  const checkingRecipients = items.some((item) => (recipients[item.orgDid]?.status ?? "loading") === "loading");

  const subtotalUsd = Math.round(payableItems.reduce((total, item) => total + item.amountUsd, 0) * 100) / 100;
  const tipEnabled = tipConfig.status === "ready" && tipConfig.enabled && Boolean(tipConfig.address);
  const tipUsd = tipEnabled ? tipAmountUsd(subtotalUsd, tipPercent) : 0;
  const totalUsd = Math.round((subtotalUsd + tipUsd) * 100) / 100;
  const hasEnoughBalance = wallet?.balance != null && wallet.balance >= toUsdcUnits(totalUsd);

  const handleConnect = async () => {
    const ethereum = getEthereum();
    if (!ethereum) {
      setConnectError(t("noWallet"));
      return;
    }
    setConnecting(true);
    setConnectError(null);
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
    if (payingRef.current) return;
    const ethereum = getEthereum();
    if (!ethereum || !wallet) return;
    payingRef.current = true;
    setPhase("paying");

    const lines = payableItems.map((item) => ({ item, key: cartItemKey(item) }));
    const includeTip = tipUsd > 0 && tipEnabled && tipConfig.status === "ready" && !!tipConfig.address;
    const initialStates: Record<string, LineState> = {};
    for (const line of lines) initialStates[line.key] = { phase: "pending" };
    if (tipUsd > 0 && tipEnabled) initialStates[TIP_LINE_KEY] = { phase: "pending" };
    setLineStates(initialStates);

    const setLine = (key: string, state: LineState) =>
      setLineStates((current) => ({ ...current, [key]: state }));

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
              rkey: item.rkey,
              amount: String(item.amountUsd),
            })),
            ...(includeTip ? { tipAmount: String(tipUsd) } : {}),
            anonymous: authSession.isLoggedIn ? anonymous : true,
            donorDid: authSession.isLoggedIn && !anonymous ? authSession.did : undefined,
          },
        });

        if (outcome.ok) {
          for (const { item, key } of readyLines) {
            const lineResult = outcome.response.lines?.find(
              (line) => line.orgDid === item.orgDid && line.rkey === item.rkey,
            );
            if (lineResult?.transactionHash) {
              setLine(key, { phase: "done", txHash: lineResult.transactionHash });
              results.push({ kind: "donation", title: item.title, orgName: item.orgName, amountUsd: item.amountUsd, txHash: lineResult.transactionHash });
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
            activityUri: `at://${item.orgDid}/org.hypercerts.claim.activity/${item.rkey}`,
            orgDid: item.orgDid,
            amount: String(item.amountUsd),
            currency: "USDC",
            anonymous: authSession.isLoggedIn ? anonymous : true,
            donorDid: authSession.isLoggedIn && !anonymous ? authSession.did : undefined,
          },
        });
        if ("txHash" in outcome) {
          setLine(key, { phase: "done", txHash: outcome.txHash });
          results.push({ kind: "donation", title: item.title, orgName: item.orgName, amountUsd: item.amountUsd, txHash: outcome.txHash });
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
            donorDid: authSession.isLoggedIn && !anonymous ? authSession.did : undefined,
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

  if (!hydrated) {
    return <div className="mx-auto w-full max-w-3xl px-4 py-10" aria-busy="true" />;
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 animate-pulse rounded-full bg-primary blur-xl" />
            <BadgeCheckIcon className="relative size-12 text-primary" />
          </div>
          <p className="font-instrument text-4xl font-medium italic text-primary">{t("thankYou")}</p>
          <p className="text-pretty font-medium text-muted-foreground">
            {t("successSummary", { amount: `$${donatedTotal.toFixed(2)}` })}
          </p>
          <p className="text-xs text-muted-foreground">
            {authSession.isLoggedIn && !anonymous ? t("recordedWithProfile") : t("recordedAnonymous")}
          </p>
        </div>

        <ul className="mt-6 divide-y divide-border-soft rounded-3xl border border-border-soft bg-surface p-4">
          {completed.map((line, index) => {
            const txHref = blockExplorerUrl(line.txHash, PAYMENT_NETWORK);
            return (
              <li key={`${line.txHash}-${index}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {line.kind === "tip" ? <HeartHandshakeIcon className="mr-1 inline size-3.5 text-primary" aria-hidden /> : null}
                    {line.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{line.orgName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">${line.amountUsd.toFixed(2)}</span>
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

        <div className="mt-4 flex w-full flex-col gap-2 rounded-3xl bg-muted p-3 pt-2">
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

        <Button asChild className="mt-6 w-full">
          <Link href="/projects">
            <CompassIcon className="size-4" /> {t("exploreMore")}
          </Link>
        </Button>
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
        <h1 className="text-2xl font-semibold text-foreground">{t("emptyTitle")}</h1>
        <Button asChild className="mt-2">
          <Link href="/projects">
            <CompassIcon className="size-4" /> {t("exploreMore")}
          </Link>
        </Button>
      </div>
    );
  }

  const paying = phase === "paying";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/cart" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("backToCart")}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold text-foreground">{t("title")}</h1>

      <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
        <LeafIcon className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-sm font-medium text-foreground">{t("encouragement")}</p>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {/* ── Donor identity ──────────────────────────────────────────────── */}
        <section className="rounded-3xl border border-border-soft bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("donorTitle")}</h2>
          {authSession.isLoggedIn ? (
            <label className="mt-3 flex min-w-0 cursor-pointer items-start gap-3">
              <Checkbox checked={anonymous} onCheckedChange={(checked) => setAnonymous(checked === true)} className="mt-1" disabled={paying} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{t("anonymousLabel")}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{t("anonymousHint")}</span>
              </span>
            </label>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("signedOutNote")}</p>
          )}
        </section>

        {/* ── Wallet ──────────────────────────────────────────────────────── */}
        <section className="rounded-3xl border border-border-soft bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("walletTitle")}</h2>
          {wallet ? (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3">
              <div>
                <p className="font-mono text-sm font-medium text-foreground">{shortWallet(wallet.address)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {wallet.balance !== null ? t("available", { amount: `$${formatUsdc(wallet.balance)}` }) : t("balanceUnavailable")}
                </p>
              </div>
              <BadgeCheckIcon className="size-5 text-primary" aria-hidden />
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs leading-5 text-muted-foreground">{t("walletHint")}</p>
              <Button onClick={() => void handleConnect()} disabled={connecting} className="w-full sm:w-auto">
                <WalletIcon className="size-4" /> {connecting ? t("connecting") : t("connectWallet")}
              </Button>
              {connectError ? <p className="text-sm text-destructive">{connectError}</p> : null}
            </div>
          )}
        </section>

        {/* ── Tip ─────────────────────────────────────────────────────────── */}
        {tipEnabled ? (
          <section className="rounded-3xl border border-border-soft bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("tipTitle")}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("tipDescription")}</p>
            <div className="relative mt-12">
              {/* Value bubble tracks the slider thumb, MaEarth-style. */}
              <div
                className="pointer-events-none absolute -top-10 -translate-x-1/2"
                style={{
                  left: `calc(${(tipPercent / MAX_TIP_PERCENT) * 100}% + ${(0.5 - tipPercent / MAX_TIP_PERCENT) * 16}px)`,
                }}
                aria-hidden
              >
                <span className="block whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1 text-xs font-semibold text-background">
                  {tipPercent}% (${tipUsd.toFixed(2)})
                </span>
                <span className="mx-auto block size-0 border-x-[5px] border-t-[5px] border-x-transparent border-t-foreground" />
              </div>
              <input
                type="range"
                min={0}
                max={MAX_TIP_PERCENT}
                step={1}
                value={tipPercent}
                disabled={paying}
                onChange={(event) => setTipPercent(Number(event.target.value))}
                className="w-full accent-primary"
                aria-label={t("tipSliderLabel")}
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>0%</span>
                <span>{MAX_TIP_PERCENT}%</span>
              </div>
            </div>

            {/* Gentle nudge when the slider sits at zero — never blocking. */}
            {tipPercent === 0 ? (
              <div className="mt-4 rounded-2xl bg-muted px-4 py-5 text-center">
                <p className="text-sm font-semibold text-foreground">{t("tipNudgeTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("tipNudgeBody")}</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {[5, 10, 15].map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      disabled={paying}
                      onClick={() => setTipPercent(percent)}
                      className="rounded-full border border-border bg-background px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-foreground disabled:pointer-events-none disabled:opacity-50"
                      aria-label={t("tipNudgeSet", { percent })}
                    >
                      {percent}%
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("yourTip")} <span className="font-semibold text-foreground">${tipUsd.toFixed(2)}</span>
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ── Summary + progress ──────────────────────────────────────────── */}
        <section className="rounded-3xl border border-border-soft bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("summaryTitle")}</h2>

          <ul className="mt-3 space-y-2">
            {payableItems.map((item) => {
              const key = cartItemKey(item);
              const line = lineStates[key];
              return (
                <li key={key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {line?.phase === "signing" || line?.phase === "processing" ? (
                      <Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
                    ) : line?.phase === "done" ? (
                      <CheckIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
                    ) : line?.phase === "failed" ? (
                      <CircleAlertIcon className="size-3.5 shrink-0 text-destructive" aria-hidden />
                    ) : null}
                    <span className="truncate text-foreground">{item.title}</span>
                  </span>
                  <span className="shrink-0 font-medium text-foreground">${item.amountUsd.toFixed(2)}</span>
                </li>
              );
            })}
            {tipEnabled && tipUsd > 0 ? (
              <li className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {lineStates[TIP_LINE_KEY]?.phase === "signing" ? (
                    <Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
                  ) : lineStates[TIP_LINE_KEY]?.phase === "done" ? (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
                  ) : lineStates[TIP_LINE_KEY]?.phase === "failed" ? (
                    <CircleAlertIcon className="size-3.5 shrink-0 text-destructive" aria-hidden />
                  ) : null}
                  <span className="truncate text-muted-foreground">{t("tipLineLabel")}</span>
                </span>
                <span className="shrink-0 font-medium text-foreground">${tipUsd.toFixed(2)}</span>
              </li>
            ) : null}
          </ul>

          {Object.values(lineStates).some((line) => line.phase === "failed") ? (
            <div className="mt-3 space-y-1">
              {Object.entries(lineStates)
                .filter(([, line]) => line.phase === "failed" && line.error)
                .map(([key, line]) => (
                  <p key={key} className="rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {line.error}
                  </p>
                ))}
            </div>
          ) : null}

          {blockedItems.length > 0 ? (
            <p className="mt-3 rounded-2xl bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-400">
              {t("blockedItems", { titles: blockedItems.map((item) => item.title).join(", ") })}
            </p>
          ) : null}

          <div className="mt-4 border-t border-border-soft pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("donations")}</span>
              <span className="font-medium text-foreground">${subtotalUsd.toFixed(2)}</span>
            </div>
            {tipEnabled && tipUsd > 0 ? (
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("tipLineLabel")}</span>
                <span className="font-medium text-foreground">${tipUsd.toFixed(2)}</span>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{t("total")}</span>
              <span className="text-2xl font-semibold tracking-tight text-foreground">${totalUsd.toFixed(2)}</span>
            </div>
          </div>

          {wallet && wallet.balance !== null && !hasEnoughBalance ? (
            <p className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {t("insufficientBalance")}
            </p>
          ) : null}

          {payableItems.length > 1 || (tipEnabled && tipUsd > 0) ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {FACILITATOR_WALLET_ADDRESS
                ? t("singleApprovalNote")
                : t("multiApprovalNote", { count: payableItems.length + (tipEnabled && tipUsd > 0 ? 1 : 0) })}
            </p>
          ) : null}

          <Button
            size="lg"
            className="mt-4 h-12 w-full"
            disabled={
              paying ||
              !wallet ||
              checkingRecipients ||
              payableItems.length === 0 ||
              (wallet.balance !== null && !hasEnoughBalance)
            }
            onClick={() => {
              if (Object.values(lineStates).some((line) => line.phase === "failed")) handleRetry();
              void handleDonate();
            }}
          >
            {paying ? (
              <>
                <Loader2Icon className="size-4 animate-spin" /> {t("processing")}
              </>
            ) : Object.values(lineStates).some((line) => line.phase === "failed") ? (
              t("tryAgain")
            ) : (
              t("donateNow", { amount: `$${totalUsd.toFixed(2)}` })
            )}
          </Button>
          {paying ? <p className="mt-2 text-center text-xs text-muted-foreground">{t("doNotClose")}</p> : null}
          {!paying ? (
            <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">{t("footerNote")}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
