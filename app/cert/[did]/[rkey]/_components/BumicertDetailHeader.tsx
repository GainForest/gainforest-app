"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRightIcon, CheckIcon, HeartIcon, Share2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { HeaderContent } from "@/app/_components/HeaderSlots";
import { BumicertsBumicertCard, type BumicertsBumicertCardRecord } from "@/components/bumicert/BumicertsBumicertCard";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The cert detail route owns its header tab strip and publishes it into the
// shell's sub-header slot via <HeaderContent sub={…}>. This replaces the old
// window.__bumicertHeaderSummary global + custom-event bridge and the
// path-regex tab logic that used to live inside the app shell.

export type BumicertHeaderSummary = {
  title: string;
  card: BumicertsBumicertCardRecord;
  donateHref: string;
};

const BUMICERT_DETAIL_TAB_IDS = [
  "overview",
  "site-boundaries",
  "reviews",
  "donations",
  "timeline",
] as const;

type BumicertDetailTab = (typeof BUMICERT_DETAIL_TAB_IDS)[number];

const TAB_LABEL_KEYS: Record<BumicertDetailTab, "overview" | "siteBoundaries" | "reviews" | "donations" | "timeline"> = {
  overview: "overview",
  "site-boundaries": "siteBoundaries",
  reviews: "reviews",
  donations: "donations",
  timeline: "timeline",
};

function parseBumicertTab(value: string | null): BumicertDetailTab {
  return BUMICERT_DETAIL_TAB_IDS.some((tab) => tab === value) ? (value as BumicertDetailTab) : "overview";
}

function bumicertTabHref(pathname: string, tab: BumicertDetailTab): string {
  if (tab === "overview") return pathname;
  return `${pathname}?${new URLSearchParams({ tab }).toString()}`;
}

/** One entry in the project page's in-page section nav. `href` is either the
 *  page path itself (overview) or a `#section` anchor; labels arrive already
 *  translated from the server component. */
export type BumicertAnchorNavItem = { id: string; href: string; label: string };

export function BumicertDetailHeader({
  summary,
  anchorNav,
  activeAnchorId,
}: {
  summary: BumicertHeaderSummary;
  anchorNav?: BumicertAnchorNavItem[];
  activeAnchorId?: string;
}) {
  // Project pages can provide their own navigation items while legacy
  // standalone Cert pages keep the route-driven tab strip below.
  return (
    <HeaderContent
      sub={anchorNav ? <BumicertHeaderAnchorNav items={anchorNav} activeId={activeAnchorId} /> : <BumicertHeaderTabs summary={summary} />}
    />
  );
}

function BumicertHeaderAnchorNav({ items, activeId }: { items: BumicertAnchorNavItem[]; activeId?: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="flex min-w-max items-end border-b border-border">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex items-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-150",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              {isActive ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BumicertHeaderTabs({ summary }: { summary: BumicertHeaderSummary }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const activeTab = parseBumicertTab(searchParams.get("tab"));
  const t = useTranslations("bumicert.detail.headerTabs");

  return (
    <div>
      {activeTab !== "overview" ? (
        <div className={activeTab === "timeline" ? undefined : "lg:hidden"}>
          <BumicertHeaderAccordion summary={summary} overviewHref={bumicertTabHref(pathname, "overview")} />
        </div>
      ) : null}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max items-end border-b border-border">
          {BUMICERT_DETAIL_TAB_IDS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Link
                key={tab}
                href={bumicertTabHref(pathname, tab)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex items-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-150",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(TAB_LABEL_KEYS[tab])}
                {isActive ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BumicertHeaderAccordion({
  summary,
  overviewHref,
}: {
  summary: BumicertHeaderSummary;
  overviewHref: string;
}) {
  const t = useTranslations("bumicert.detail.headerTabs");
  const [copied, setCopied] = useState(false);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Accordion type="single" collapsible className="mb-1.5 rounded-2xl bg-secondary px-3 text-secondary-foreground">
      <AccordionItem value="bumicert-card" className="border-b-0">
        <AccordionTrigger className="min-w-0 py-2.5 text-base hover:no-underline">
          <span className="min-w-0 truncate text-sm font-medium sm:text-base">{summary.title}</span>
        </AccordionTrigger>
        <AccordionContent className="pt-1">
          <div className="mx-auto w-full max-w-[360px] space-y-3">
            <BumicertsBumicertCard record={summary.card} />
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleShare}>
                <AnimatePresence mode="wait" initial={false}>
                  {copied ? (
                    <motion.span
                      key="copied"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1.5"
                    >
                      <CheckIcon className="h-3.5 w-3.5 text-primary" />
                      {t("copied")}
                    </motion.span>
                  ) : (
                    <motion.span
                      key="share"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1.5"
                    >
                      <Share2Icon className="h-3.5 w-3.5" />
                      {t("share")}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
              <Button asChild size="sm">
                <Link href={summary.donateHref}>
                  <HeartIcon className="h-3.5 w-3.5" />
                  {t("donate")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="icon-sm" aria-label={t("goToOverview")}>
                <Link href={overviewHref}>
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                  <span className="sr-only">{t("overview")}</span>
                </Link>
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
