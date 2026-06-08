"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { HeartIcon, ExternalLinkIcon } from "lucide-react";
import type { FundingReceipt } from "../../_lib/dashboard";
import { formatCompactUsd } from "../../_lib/format";
import { PreferredBumicertLink } from "../../_components/PreferredLinks";

interface DonationHistoryProps {
  receipts: FundingReceipt[];
}

function extractBumicertInfo(uri: string | null): { did: string; rkey: string } | null {
  if (!uri) return null;
  const match = uri.match(/^at:\/\/(did:[^/]+)\/[^/]+\/(.+)$/);
  if (!match) return null;
  return { did: match[1]!, rkey: match[2]! };
}

function formatDistanceToNowLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} months ago`;
  const years = Math.round(months / 12);
  return `${years} years ago`;
}

function DonationCard({
  item,
  index,
}: {
  item: FundingReceipt;
  index: number;
}) {
  const amount = item.amount;
  const txId = item.txHash;
  const occurredAt = item.occurredAt ?? item.createdAt;
  const bumicertInfo = extractBumicertInfo(item.bumicertUri);

  const relativeTime = useMemo(() => formatDistanceToNowLabel(occurredAt), [occurredAt]);

  const baseScanUrl = txId ? `https://basescan.org/tx/${txId}` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.2,
        delay: index * 0.03,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
    >
      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <HeartIcon className="h-3 w-3 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="font-semibold text-sm text-foreground">
            ${amount.toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          {bumicertInfo ? (
            <PreferredBumicertLink
              did={bumicertInfo.did}
              rkey={bumicertInfo.rkey}
              className="text-xs text-primary hover:underline truncate"
            >
              View bumicert
            </PreferredBumicertLink>
          ) : (
            <span className="text-xs text-muted-foreground truncate">
              Unknown bumicert
            </span>
          )}
        </div>
        {relativeTime && (
          <p className="text-xs text-muted-foreground">{relativeTime}</p>
        )}
      </div>

      {baseScanUrl && (
        <a
          href={baseScanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
          title="Payment details"
        >
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )}
    </motion.div>
  );
}

export function DonationHistory({ receipts }: DonationHistoryProps) {
  const totalDonated = useMemo(() => receipts.reduce((sum, receipt) => sum + receipt.amount, 0), [receipts]);

  if (receipts.length === 0) {
    return (
      <div className="w-full space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          Donation History
        </h2>
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No donations yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Donation History
        </h2>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-1">Total Donated</p>
            <p className="text-xl font-bold text-foreground">
              {formatCompactUsd(totalDonated)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-1">Donations</p>
            <p className="text-xl font-bold text-foreground">
              {receipts.length}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="divide-y divide-border">
            {receipts.map((item, index) => (
              <DonationCard key={item.uri ?? index} item={item} index={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
