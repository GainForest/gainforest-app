"use client";

import { HeartIcon, ExternalLinkIcon, EyeOffIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { FundingReceipt } from "../../_lib/dashboard";
import { EmptyHeroBanner } from "../../_components/EmptyHeroBanner";
import { PreferredBumicertLink } from "../../_components/PreferredLinks";
import { blockExplorerUrl } from "../../_lib/urls";
import { Button } from "@/components/ui/button";

type DonationHistoryStatus = "ready" | "unavailable";

interface DonationHistoryProps {
  receipts: FundingReceipt[];
  status?: DonationHistoryStatus;
  /** Owner view only: explain how private anonymous receipts are handled. */
  showAnonymousNote?: boolean;
}

function extractBumicertInfo(uri: string | null): { did: string; rkey: string } | null {
  if (!uri) return null;
  const match = uri.match(/^at:\/\/(did:[^/]+)\/[^/]+\/(.+)$/);
  if (!match) return null;
  return { did: match[1]!, rkey: match[2]! };
}

function DonationRow({ item, anonymousBadge }: { item: FundingReceipt; anonymousBadge: string }) {
  const t = useTranslations("common.accountDonations");
  const format = useFormatter();
  const occurredAt = item.occurredAt ?? item.createdAt;
  const occurredDate = occurredAt ? new Date(occurredAt) : null;
  const relativeTime = occurredDate && !Number.isNaN(occurredDate.getTime())
    ? format.relativeTime(occurredDate)
    : null;
  const bumicertInfo = extractBumicertInfo(item.bumicertUri);
  const explorerUrl = blockExplorerUrl(item.txHash, item.paymentNetwork ?? "ethereum");

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <HeartIcon className="size-3.5 text-primary" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            {format.number(item.amount, { style: "currency", currency: "USD" })}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          {bumicertInfo ? (
            <PreferredBumicertLink
              did={bumicertInfo.did}
              rkey={bumicertInfo.rkey}
              className="truncate text-xs text-primary hover:underline"
            >
              {t("viewProject")}
            </PreferredBumicertLink>
          ) : (
            <span className="truncate text-xs text-muted-foreground">{t("unknownProject")}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {relativeTime ? <p className="text-xs text-muted-foreground">{relativeTime}</p> : null}
          {item.isAnonymous ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <EyeOffIcon className="size-2.5" aria-hidden />
              {anonymousBadge}
            </span>
          ) : null}
        </div>
      </div>

      {explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary motion-reduce:transition-none"
          aria-label={t("paymentDetails")}
        >
          <ExternalLinkIcon className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </li>
  );
}

function AnonymousNote() {
  const t = useTranslations("common.accountDonations");
  return (
    <p className="rounded-2xl bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
      {t("anonymousNote")}
    </p>
  );
}

export function DonationHistory({ receipts, status = "ready", showAnonymousNote = false }: DonationHistoryProps) {
  const t = useTranslations("common.accountDonations");
  const format = useFormatter();
  const totalDonated = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);

  if (status === "unavailable") {
    return (
      <div className="flex w-full flex-col items-center gap-3 rounded-2xl bg-muted/50 px-6 py-12 text-center">
        <TriangleAlertIcon className="size-8 text-muted-foreground" aria-hidden />
        <h2 className="font-instrument text-2xl italic text-foreground">{t("unavailableTitle")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t("unavailableDescription")}</p>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="w-full space-y-4">
        <EmptyHeroBanner
          description={t("emptyHeroDescription")}
          ctaLabel={t("emptyHeroCta")}
          ctaHref="/projects"
        />
        {showAnonymousNote ? <AnonymousNote /> : null}
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {showAnonymousNote ? <AnonymousNote /> : null}
      <section>
        <h2 className="font-instrument text-2xl italic text-foreground">{t("historyTitle")}</h2>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted/50 p-4">
            <dt className="text-xs text-muted-foreground">{t("totalDonated")}</dt>
            <dd className="mt-1 text-xl font-semibold text-foreground">
              {format.number(totalDonated, { style: "currency", currency: "USD" })}
            </dd>
          </div>
          <div className="rounded-2xl bg-muted/50 p-4">
            <dt className="text-xs text-muted-foreground">{t("donations")}</dt>
            <dd className="mt-1 text-xl font-semibold text-foreground">{format.number(receipts.length)}</dd>
          </div>
        </dl>

        <ul className="mt-4 divide-y divide-border-soft rounded-2xl bg-muted/30 p-4">
          {receipts.map((item, index) => (
            <DonationRow key={item.uri ?? index} item={item} anonymousBadge={t("anonymousBadge")} />
          ))}
        </ul>
      </section>
    </div>
  );
}
