"use client";

import { useEffect } from "react";
import type { BumicertsBumicertCardRecord } from "@/components/bumicert/BumicertsBumicertCard";

export const BUMICERT_HEADER_SUMMARY_EVENT = "bumicerts:bumicert-summary";

export type BumicertHeaderSummary = {
  title: string;
  card: BumicertsBumicertCardRecord;
  donateHref: string;
};

type WindowWithBumicertSummary = Window & {
  __bumicertHeaderSummary?: BumicertHeaderSummary | null;
};

export function BumicertHeaderTitleBridge({ summary }: { summary: BumicertHeaderSummary }) {
  useEffect(() => {
    (window as WindowWithBumicertSummary).__bumicertHeaderSummary = summary;
    window.dispatchEvent(
      new CustomEvent(BUMICERT_HEADER_SUMMARY_EVENT, { detail: summary }),
    );

    return () => {
      (window as WindowWithBumicertSummary).__bumicertHeaderSummary = null;
      window.dispatchEvent(
        new CustomEvent(BUMICERT_HEADER_SUMMARY_EVENT, { detail: null }),
      );
    };
  }, [summary]);

  return null;
}
