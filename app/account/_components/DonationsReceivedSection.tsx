import { ExternalLinkIcon, HeartIcon, WalletIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthorInline } from "../../_components/AuthorChip";
import { PreferredBumicertLink } from "../../_components/PreferredLinks";
import { fetchReceiptsFresh, type FundingReceipt } from "../../_lib/dashboard";
import { formatCompactUsd } from "../../_lib/format";
import { fetchBumicertsByDid } from "../../_lib/indexer";
import { blockExplorerUrl } from "../../_lib/urls";
import { fetchVerifiedRecipientAddress } from "@/lib/facilitator/recipient";

/** at://did/collection/rkey → { did, rkey } */
function bumicertParts(uri: string | null): { did: string; rkey: string } | null {
  if (!uri) return null;
  const match = uri.match(/^at:\/\/(did:[^/]+)\/[^/]+\/([^/?#]+)$/);
  return match ? { did: match[1]!, rkey: match[2]! } : null;
}

function receiptDate(receipt: FundingReceipt): string | null {
  return receipt.occurredAt ?? receipt.createdAt;
}

function dateValue(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Public funding history for a profile: every donation receipt this account
// received, aggregated and newest first. A donation counts as received when it
// either funded one of the account's Certs (the receipt's funded Cert is owned
// by this DID) OR was paid to the account's verified receiving wallet — the
// latter catches donations and prize payouts that carry no Cert reference at
// all. Personal and organization accounts render the exact same section.
export async function DonationsReceivedSection({ did, className = "" }: { did: string; className?: string }) {
  const [t, quoteT, locale, receipts, recipientAddress] = await Promise.all([
    getTranslations("common.accountDonationsReceived"),
    getTranslations("common.accountDonations"),
    getLocale(),
    fetchReceiptsFresh().catch(() => [] as FundingReceipt[]),
    fetchVerifiedRecipientAddress(did).catch(() => null),
  ]);

  const recipientWallet = recipientAddress?.toLowerCase() ?? null;
  const received = receipts
    .filter(
      (receipt) =>
        receipt.orgDid === did ||
        (recipientWallet !== null &&
          receipt.to?.type === "wallet" &&
          receipt.to.id.toLowerCase() === recipientWallet),
    )
    .sort((a, b) => dateValue(receiptDate(b)) - dateValue(receiptDate(a)));

  // Cert titles so each entry can say *what* the donation funded. Receipts only
  // point at Certs owned by this same account, so one owner-scoped fetch covers
  // every entry; a failure just falls back to the generic link label.
  const bumicerts = received.length > 0
    ? await fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => [])
    : [];
  const certTitles = new Map(bumicerts.map((record) => [record.atUri, record.title]));

  const totalUsd = received
    .filter((receipt) => ["USD", "USDC"].includes(receipt.currency.toUpperCase()))
    .reduce((sum, receipt) => sum + receipt.amount, 0);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <section className={`rounded-3xl border border-border/60 bg-card p-5 org-animate org-fade-in-up org-delay-2 sm:p-6 ${className}`.trim()}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-instrument text-2xl italic leading-none text-foreground">{t("title")}</h2>
        {received.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("summary", { amount: formatCompactUsd(totalUsd), count: received.length })}
          </p>
        ) : null}
      </div>

      {received.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="mt-4 max-h-[28rem] divide-y divide-border/60 overflow-y-auto rounded-2xl border border-border/60 bg-background/60 px-4">
          {received.map((receipt) => {
            const parts = bumicertParts(receipt.bumicertUri);
            const certTitle = (receipt.bumicertUri ? certTitles.get(receipt.bumicertUri) : null) ?? null;
            const when = receiptDate(receipt);
            const explorerUrl = receipt.txHash ? blockExplorerUrl(receipt.txHash, receipt.paymentNetwork ?? "ethereum") : null;

            return (
              <li key={receipt.uri} className="flex items-start gap-3 py-3.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <HeartIcon className="size-3.5 text-primary" aria-hidden />
                </span>

                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-foreground">
                    {receipt.from?.type === "did" ? (
                      <span className="min-w-0 truncate">
                        <AuthorInline did={receipt.from.id} />
                      </span>
                    ) : (
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground/80">
                        <WalletIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{t("anonymousDonor")}</span>
                      </span>
                    )}
                    {when ? (
                      <>
                        <span aria-hidden className="text-muted-foreground">·</span>
                        <span className="text-xs font-normal text-muted-foreground">{dateFormat.format(new Date(when))}</span>
                      </>
                    ) : null}
                  </p>
                  {parts ? (
                    <p className="min-w-0 text-xs leading-5">
                      <PreferredBumicertLink did={parts.did} rkey={parts.rkey} className="text-primary hover:underline">
                        {certTitle ?? t("certFallback")}
                      </PreferredBumicertLink>
                    </p>
                  ) : null}
                  {receipt.message ? (
                    <p className="mt-1 whitespace-pre-line break-words text-xs italic leading-snug text-foreground/70">
                      {quoteT("messageQuote", { message: receipt.message })}
                    </p>
                  ) : null}
                </div>

                <span className="shrink-0 whitespace-nowrap pt-0.5 text-sm font-bold tabular-nums text-primary">
                  ${receipt.amount.toFixed(2)}
                </span>
                {explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 shrink-0 text-muted-foreground transition-colors hover:text-primary"
                    title={t("paymentDetails")}
                    aria-label={t("paymentDetails")}
                  >
                    <ExternalLinkIcon className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
