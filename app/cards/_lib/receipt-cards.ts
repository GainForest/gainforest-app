import "server-only";

import { fetchFundingReceiptsByDonorDid, type FundingReceipt } from "@/app/_lib/dashboard";
import { fetchRecordByUri } from "@/app/_lib/indexer";
import { fetchRecentOwnedFundingReceipts } from "@/app/_lib/recent-funding-receipts";
import { blockExplorerUrl, localBumicertHref } from "@/app/_lib/urls";
import type { EarnedCard, EarnedCardsResult } from "@/app/_components/rewards/earned-card";
import { dedupeCardReceipts, fundingReceiptCardIdentity } from "@/app/_components/rewards/receipt-card-model";

const MAX_RECENT_RECEIPTS = 20;

type FallbackLabels = {
  projectTitle: string;
  organizationName: string;
};

function projectRouteFromUri(uri: string | null): string | null {
  const match = uri?.match(/^at:\/\/([^/]+)\/org\.hypercerts\.claim\.activity\/([^/?#]+)$/);
  if (!match) return null;
  return localBumicertHref(match[1], match[2]);
}

async function cardsFromReceipts(
  receipts: FundingReceipt[],
  fallback: FallbackLabels,
): Promise<{ cards: EarnedCard[]; metadataPartial: boolean }> {
  const uniqueProjectUris = Array.from(
    new Set(receipts.flatMap((receipt) => (receipt.bumicertUri ? [receipt.bumicertUri] : []))),
  );
  let metadataPartial = false;
  const metadataEntries = await Promise.all(
    uniqueProjectUris.map(async (uri) => {
      try {
        return [uri, await fetchRecordByUri(uri)] as const;
      } catch {
        metadataPartial = true;
        return [uri, null] as const;
      }
    }),
  );
  const metadata = new Map(metadataEntries);

  const cards = receipts.map((receipt): EarnedCard => {
    const record = receipt.bumicertUri ? metadata.get(receipt.bumicertUri) : null;
    const project = record?.kind === "bumicert" ? record : null;
    const title = project?.title?.trim() || fallback.projectTitle;
    const organizationName = project?.creatorName?.trim() || fallback.organizationName;
    const occurredAt = receipt.occurredAt ?? receipt.createdAt;

    return {
      id: fundingReceiptCardIdentity(receipt),
      variant: "project",
      totalUsd: receipt.amount,
      receiptUri: receipt.uri,
      earnedAt: occurredAt,
      projectHref: project
        ? localBumicertHref(project.did, project.rkey)
        : projectRouteFromUri(receipt.bumicertUri),
      paymentHref: blockExplorerUrl(receipt.txHash, receipt.paymentNetwork),
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
  const [history, recent] = await Promise.allSettled([
    fetchFundingReceiptsByDonorDid(ownerDid),
    boundedRecent.length > 0
      ? fetchRecentOwnedFundingReceipts(ownerDid, boundedRecent)
      : Promise.resolve({ receipts: [] as FundingReceipt[], partial: false }),
  ]);

  if (
    history.status === "rejected" &&
    (boundedRecent.length === 0 || recent.status === "rejected")
  ) {
    throw new Error("Unable to load receipt-backed cards");
  }

  const receipts = dedupeCardReceipts([
    ...(history.status === "fulfilled" ? history.value : []),
    ...(recent.status === "fulfilled" ? recent.value.receipts : []),
  ]).filter((receipt) => receipt.from?.type === "did" && receipt.from.id === ownerDid);
  const { cards, metadataPartial } = await cardsFromReceipts(receipts, fallback);

  return {
    cards,
    partial:
      history.status === "rejected" ||
      recent.status === "rejected" ||
      (recent.status === "fulfilled" && recent.value.partial) ||
      metadataPartial,
  };
}
