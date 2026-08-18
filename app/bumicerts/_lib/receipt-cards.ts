import "server-only";

import { fetchOwnAnonymousReceipts } from "@/app/_lib/anonymous-donations";
import { fetchFundingReceiptsByDonorDid, type FundingReceipt } from "@/app/_lib/dashboard";
import { fetchAccountCards, fetchDidsByEvmAddresses, fetchRecordByUri, type AccountCard } from "@/app/_lib/indexer";
import { resolveBlobUrl } from "@/app/_lib/pds";
import { fetchRecentOwnedFundingReceipts, MAX_RECENT_RECEIPTS } from "@/app/_lib/recent-funding-receipts";
import { getTipWalletAddress } from "@/lib/facilitator/tip";
import { blockExplorerUrl, localBumicertHref } from "@/app/_lib/urls";
import type { EarnedCard, EarnedCardsResult } from "@/app/_components/rewards/earned-card";
import {
  dedupeCardReceipts,
  fundingReceiptCardIdentity,
  receiptCardVariant,
} from "@/app/_components/rewards/receipt-card-model";

const METADATA_CONCURRENCY = 8;

type FallbackLabels = {
  projectTitle: string;
  organizationName: string;
  /** Shown on a person card when the recipient's profile can't be resolved. */
  recipientName: string;
  /** Context line on a person card when the receipt carries no message. */
  personContext: string;
  /** Shown on an account-support card when the recipient can't be resolved. */
  accountName: string;
};

function projectRouteFromUri(uri: string | null): string | null {
  const match = uri?.match(/^at:\/\/([^/]+)\/org\.hypercerts\.claim\.activity\/([^/?#]+)$/);
  if (!match) return null;
  return localBumicertHref(match[1], match[2]);
}

/** Resolve recipient profiles (name + avatar art) for account cards, best effort. */
async function resolveRecipients(
  dids: string[],
): Promise<{ recipients: Map<string, AccountCard & { avatarUrl: string | null }>; partial: boolean }> {
  const uniqueDids = Array.from(new Set(dids));
  const recipients = new Map<string, AccountCard & { avatarUrl: string | null }>();
  if (uniqueDids.length === 0) return { recipients, partial: false };

  let partial = false;
  try {
    const accounts = await fetchAccountCards(uniqueDids);
    await Promise.all(
      Array.from(accounts.values(), async (account) => {
        let avatarUrl: string | null = null;
        if (account.avatarRef) {
          try {
            avatarUrl = await resolveBlobUrl(account.did, account.avatarRef);
          } catch {
            /* card falls back to its tier gradient */
          }
        }
        recipients.set(account.did, { ...account, avatarUrl });
      }),
    );
  } catch {
    partial = true;
  }
  return { recipients, partial };
}

async function cardsFromReceipts(
  receipts: FundingReceipt[],
  fallback: FallbackLabels,
): Promise<{ cards: EarnedCard[]; metadataPartial: boolean }> {
  // A tip goes to the GainForest tip wallet, not to a project or account, so it
  // never earns a collectible. It reaches here as an "org" (wallet-recipient)
  // receipt, so drop it by matching the known tip wallet address.
  const tipWallet = (await getTipWalletAddress().catch(() => null))?.toLowerCase() ?? null;
  const cardReceipts = receipts.filter(
    (receipt) => !(tipWallet && receipt.to?.type === "wallet" && receipt.to.id.toLowerCase() === tipWallet),
  );

  const uniqueProjectUris = Array.from(
    new Set(cardReceipts.flatMap((receipt) => (receipt.bumicertUri ? [receipt.bumicertUri] : []))),
  );
  let metadataPartial = false;
  const metadataEntries: Array<readonly [string, Awaited<ReturnType<typeof fetchRecordByUri>> | null]> = [];
  for (let index = 0; index < uniqueProjectUris.length; index += METADATA_CONCURRENCY) {
    const batch = uniqueProjectUris.slice(index, index + METADATA_CONCURRENCY);
    metadataEntries.push(
      ...(await Promise.all(
        batch.map(async (uri) => {
          try {
            return [uri, await fetchRecordByUri(uri)] as const;
          } catch {
            metadataPartial = true;
            return [uri, null] as const;
          }
        }),
      )),
    );
  }
  const metadata = new Map(metadataEntries);

  // Account-support receipts ("org" variant) only carry the recipient wallet,
  // so reverse-resolve those wallets to account DIDs, best effort. The DID then
  // feeds the same profile lookup used by person cards.
  const orgWallets = Array.from(
    new Set(
      cardReceipts.flatMap((receipt) =>
        receiptCardVariant(receipt) === "org" && receipt.to?.type === "wallet" ? [receipt.to.id] : [],
      ),
    ),
  );
  let walletToDid = new Map<string, string>();
  if (orgWallets.length > 0) {
    try {
      walletToDid = await fetchDidsByEvmAddresses(orgWallets);
    } catch {
      metadataPartial = true;
    }
  }
  const orgRecipientDidFor = (receipt: FundingReceipt): string | null =>
    receipt.to?.type === "wallet" ? walletToDid.get(receipt.to.id.toLowerCase()) ?? null : null;

  const recipientDids = [
    ...cardReceipts.flatMap((receipt) =>
      receiptCardVariant(receipt) === "person" && receipt.to?.type === "did" ? [receipt.to.id] : [],
    ),
    ...cardReceipts.flatMap((receipt) => {
      const did = receiptCardVariant(receipt) === "org" ? orgRecipientDidFor(receipt) : null;
      return did ? [did] : [];
    }),
  ];
  const { recipients, partial: recipientsPartial } = await resolveRecipients(recipientDids);
  metadataPartial ||= recipientsPartial;

  const cards = cardReceipts.map((receipt): EarnedCard => {
    const occurredAt = receipt.occurredAt ?? receipt.createdAt;
    const base = {
      id: fundingReceiptCardIdentity(receipt),
      totalUsd: receipt.amount,
      receiptUri: receipt.uri,
      earnedAt: occurredAt,
      paymentHref: blockExplorerUrl(receipt.txHash, receipt.paymentNetwork),
    };

    if (receiptCardVariant(receipt) === "person" && receipt.to?.type === "did") {
      const account = recipients.get(receipt.to.id) ?? null;
      const name = account?.displayName?.trim() || account?.handle?.trim() || fallback.recipientName;
      return {
        ...base,
        variant: "person",
        projectHref: null,
        personHref: `/account/${encodeURIComponent(receipt.to.id)}`,
        lines: [
          {
            kind: "donation",
            title: name,
            orgName: receipt.message ?? fallback.personContext,
            amountUsd: receipt.amount,
            image: account?.avatarUrl ?? null,
            receiptUri: receipt.uri,
            cardEligible: true,
            txHash: receipt.txHash,
            occurredAt,
          },
        ],
      };
    }

    if (receiptCardVariant(receipt) === "org") {
      const recipientDid = orgRecipientDidFor(receipt);
      const account = recipientDid ? recipients.get(recipientDid) ?? null : null;
      const name = account?.displayName?.trim() || account?.handle?.trim() || fallback.accountName;
      return {
        ...base,
        variant: "person",
        projectHref: null,
        personHref: recipientDid ? `/account/${encodeURIComponent(recipientDid)}` : null,
        lines: [
          {
            kind: "donation",
            title: name,
            orgName: receipt.message ?? fallback.personContext,
            amountUsd: receipt.amount,
            image: account?.avatarUrl ?? null,
            receiptUri: receipt.uri,
            cardEligible: true,
            txHash: receipt.txHash,
            occurredAt,
          },
        ],
      };
    }

    const record = receipt.bumicertUri ? metadata.get(receipt.bumicertUri) : null;
    const project = record?.kind === "bumicert" ? record : null;
    const title = project?.title?.trim() || fallback.projectTitle;
    const organizationName = project?.creatorName?.trim() || fallback.organizationName;

    return {
      ...base,
      variant: "project",
      projectHref: project
        ? localBumicertHref(project.did, project.rkey)
        : projectRouteFromUri(receipt.bumicertUri),
      lines: [
        {
          kind: "donation",
          title,
          orgName: organizationName,
          amountUsd: receipt.amount,
          image: project?.imageUrl ?? null,
          receiptUri: receipt.uri,
          cardEligible: true,
          txHash: receipt.txHash,
          occurredAt,
        },
      ],
    };
  });

  return { cards, metadataPartial };
}

/**
 * Load a donor's collection from authoritative funding receipts. Hyperindex
 * supplies history; checkout-returned receipt URIs are re-read from the PDS so
 * brand-new cards do not disappear while indexing catches up.
 */
export async function fetchEarnedCards(
  ownerDid: string,
  recentReceiptUris: string[],
  fallback: FallbackLabels,
): Promise<EarnedCardsResult> {
  const boundedRecent = Array.from(new Set(recentReceiptUris)).slice(0, MAX_RECENT_RECEIPTS);
  // Three authoritative sources: DID-attributed history from Hyperindex, the
  // just-checked-out receipt URIs re-read from the PDS, and the owner's own
  // anonymous donations (matched server-side via their donor hash). The last
  // one is why a donor who gave anonymously — or while signed out — still sees
  // their collectibles here, exactly as their profile's donations view does.
  const [history, recent, anonymous] = await Promise.allSettled([
    fetchFundingReceiptsByDonorDid(ownerDid),
    boundedRecent.length > 0
      ? fetchRecentOwnedFundingReceipts(ownerDid, boundedRecent)
      : Promise.resolve({ receipts: [] as FundingReceipt[], partial: false }),
    fetchOwnAnonymousReceipts(ownerDid),
  ]);

  if (
    history.status === "rejected" &&
    (boundedRecent.length === 0 || recent.status === "rejected") &&
    anonymous.status === "rejected"
  ) {
    throw new Error("Unable to load receipt-backed cards");
  }

  // Keep receipts the owner is entitled to see: those the indexer attributes to
  // their DID, plus anonymous receipts already matched to them by donor hash.
  const ownsReceipt = (receipt: FundingReceipt): boolean =>
    receipt.isAnonymous === true || (receipt.from?.type === "did" && receipt.from.id === ownerDid);

  const receipts = dedupeCardReceipts([
    ...(history.status === "fulfilled" ? history.value : []),
    ...(recent.status === "fulfilled" ? recent.value.receipts : []),
    ...(anonymous.status === "fulfilled" ? anonymous.value : []),
  ].filter(ownsReceipt));
  const { cards, metadataPartial } = await cardsFromReceipts(receipts, fallback);

  return {
    cards,
    partial:
      history.status === "rejected" ||
      recent.status === "rejected" ||
      anonymous.status === "rejected" ||
      (recent.status === "fulfilled" && recent.value.partial) ||
      metadataPartial,
  };
}
