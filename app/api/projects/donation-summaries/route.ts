import { NextRequest } from "next/server";
import { fetchReceipts } from "@/app/_lib/dashboard";
import { fetchAccountMaEarthRounds, indexerQuery } from "@/app/_lib/indexer";
import { fetchMaEarthDonationSummary, maEarthDonationUrl } from "@/app/_lib/maearth-donations";

export const revalidate = 1800;

type RequestItem = {
  key?: unknown;
  did?: unknown;
  atUri?: unknown;
  bumicertUris?: unknown;
};

type DonationSourceSummary = {
  totalUsd: number;
  donorCount: number;
};

type GainForestDonationTarget = {
  organizationDid: string;
  rkey: string;
  minDonationInUSD: string | null;
  maxDonationInUSD: string | null;
};

type RawFundingConfig = {
  receivingWallet?: { uri?: string | null } | null;
  status?: string | null;
  minDonationInUSD?: string | null;
  maxDonationInUSD?: string | null;
} | null;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function donorKey(from: { type: "did" | "wallet"; id: string } | null): string | null {
  return from ? `${from.type}:${from.id}` : null;
}

function usdAmount(receipt: { amount: number; currency: string }): number {
  return ["USD", "USDC"].includes(receipt.currency.toUpperCase()) ? receipt.amount : 0;
}

function activityParts(uri: string): { did: string; rkey: string } | null {
  const match = /^at:\/\/([^/]+)\/org\.hypercerts\.claim\.activity\/([^/?#]+)$/.exec(uri);
  return match ? { did: match[1]!, rkey: match[2]! } : null;
}

async function fetchGainForestDonationTargets(activityUris: string[]): Promise<Map<string, GainForestDonationTarget>> {
  const entries = [...new Set(activityUris)]
    .map((activityUri) => {
      const parts = activityParts(activityUri);
      return parts
        ? { activityUri, parts, configUri: `at://${parts.did}/app.gainforest.funding.config/${parts.rkey}` }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  if (entries.length === 0) return new Map();

  const selections = entries.map((entry, index) => `
    f${index}: appGainforestFundingConfigByUri(uri: ${JSON.stringify(entry.configUri)}) {
      receivingWallet { ... on AppGainforestFundingConfigEvmLinkRef { uri } }
      status
      minDonationInUSD
      maxDonationInUSD
    }
  `);
  const data = await indexerQuery<Record<string, RawFundingConfig>>(
    `query ProjectDonationTargets { ${selections.join("\n")} }`,
    {},
  ).catch(() => null);

  const targets = new Map<string, GainForestDonationTarget>();
  entries.forEach((entry, index) => {
    const config = data?.[`f${index}`];
    if (!config?.receivingWallet?.uri || (config.status ?? "open") !== "open") return;
    targets.set(entry.activityUri, {
      organizationDid: entry.parts.did,
      rkey: entry.parts.rkey,
      minDonationInUSD: config.minDonationInUSD ?? null,
      maxDonationInUSD: config.maxDonationInUSD ?? null,
    });
  });
  return targets;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { items?: RequestItem[] } | null;
  const items = Array.isArray(body?.items) ? body.items.slice(0, 80) : [];
  const normalized = items
    .map((item) => {
      const key = asString(item.key);
      const did = asString(item.did);
      const atUri = asString(item.atUri);
      const bumicertUris = Array.isArray(item.bumicertUris)
        ? item.bumicertUris.map(asString).filter((uri): uri is string => Boolean(uri))
        : [];
      return key && did ? { key, did, atUri, bumicertUris } : null;
    })
    .filter((item): item is { key: string; did: string; atUri: string | null; bumicertUris: string[] } => Boolean(item));

  if (normalized.length === 0) return Response.json({ summaries: {} });

  const uniqueDids = [...new Set(normalized.map((item) => item.did))];
  const receiptsPromise = fetchReceipts().catch(() => []);
  const gainForestTargetsPromise = fetchGainForestDonationTargets(normalized.flatMap((item) => item.bumicertUris));
  const maEarthByDidPromise = Promise.all(
    uniqueDids.map(async (did) => {
      const donateUrl = maEarthDonationUrl(did);
      if (!donateUrl) return [did, null] as const;
      const [summary, rounds] = await Promise.all([
        fetchMaEarthDonationSummary(donateUrl).catch(() => null),
        fetchAccountMaEarthRounds(did).catch(() => [] as number[]),
      ]);
      return [did, { donateUrl, summary, rounds }] as const;
    }),
  );

  const [receipts, gainForestTargets, maEarthEntries] = await Promise.all([
    receiptsPromise,
    gainForestTargetsPromise,
    maEarthByDidPromise,
  ]);
  const maEarthByDid = new Map(maEarthEntries);
  const summaries: Record<string, {
    acceptsDonations: boolean;
    totalUsd: number;
    donorCount: number;
    gainforest: DonationSourceSummary | null;
    gainforestDonation: GainForestDonationTarget | null;
    maEarth: (DonationSourceSummary & { donateUrl: string; rounds: number[] }) | null;
  }> = {};

  for (const item of normalized) {
    const certUris = new Set(item.bumicertUris);
    const matchingReceipts = receipts.filter((receipt) => receipt.bumicertUri && certUris.has(receipt.bumicertUri));
    const gainforestTotal = matchingReceipts.reduce((sum, receipt) => sum + usdAmount(receipt), 0);
    const gainforestDonors = new Set(matchingReceipts.map((receipt) => donorKey(receipt.from)).filter(Boolean)).size;
    const gainforestDonation = item.bumicertUris
      .map((uri) => gainForestTargets.get(uri) ?? null)
      .find((target): target is GainForestDonationTarget => Boolean(target)) ?? null;
    const gainforest = matchingReceipts.length > 0 || gainforestTotal > 0 || gainforestDonation
      ? { totalUsd: gainforestTotal, donorCount: gainforestDonors }
      : null;

    const maEarthData = maEarthByDid.get(item.did) ?? null;
    const maEarth = maEarthData
      ? {
          donateUrl: maEarthData.donateUrl,
          rounds: maEarthData.rounds,
          totalUsd: maEarthData.summary?.totalUsd ?? 0,
          donorCount: maEarthData.summary?.donorCount ?? 0,
        }
      : null;

    const totalUsd = (gainforest?.totalUsd ?? 0) + (maEarth?.totalUsd ?? 0);
    const donorCount = (gainforest?.donorCount ?? 0) + (maEarth?.donorCount ?? 0);
    summaries[item.key] = {
      acceptsDonations: Boolean(gainforestDonation || maEarth),
      totalUsd,
      donorCount,
      gainforest,
      gainforestDonation,
      maEarth,
    };
  }

  return Response.json({ summaries });
}
