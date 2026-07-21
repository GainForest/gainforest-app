"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, FlaskConicalIcon, RefreshCcwIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { CartProvider, useCart, type CartItem } from "@/app/_components/cart/CartProvider";
import { CartView } from "@/app/cart/_components/CartView";
import { CheckoutView } from "@/app/checkout/_components/CheckoutView";
import { DonateButton } from "@/app/cert/[did]/[rkey]/_components/donate/DonateButton";
import { Button } from "@/components/ui/button";
import { BumicertCardVisual } from "@/components/bumicert/BumicertCard";
import { useModal } from "@/components/ui/modal/context";
import type { AuthSession } from "@/app/_lib/auth";

type DonationStage = "project" | "cart" | "checkout";

const MOCK_SESSION: AuthSession = {
  isLoggedIn: true,
  did: "did:plc:testregistrydonor",
  handle: "preview-donor.gainforest.app",
};

// Companion donations added alongside the hero project so the checkout settles
// several lines — the reward deck then mints one card per project plus an
// overall card, exercising the flick + collect flow end to end.
const MOCK_COMPANIONS: CartItem[] = [
  {
    kind: "project",
    orgDid: "mock:rainforest-trust",
    rkey: "mock-andes-cloudforest",
    title: "Andes Cloudforest Watch",
    orgName: "Rainforest Trust",
    image: null,
    amountUsd: 40,
    minUsd: 5,
    maxUsd: 500,
  },
  {
    kind: "project",
    orgDid: "mock:ocean-guardians",
    rkey: "mock-mangrove-belt",
    title: "Mangrove Belt Restoration",
    orgName: "Ocean Guardians",
    image: null,
    amountUsd: 120,
    minUsd: 5,
    maxUsd: 500,
  },
];

function DonationExperience({ onReset }: { onReset: () => void }) {
  const t = useTranslations("cart.testRegistry");
  const cart = useCart();
  const [stage, setStage] = useState<DonationStage>("project");
  const stageRegionRef = useRef<HTMLDivElement | null>(null);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    stageRegionRef.current?.focus();
  }, [stage]);

  return (
    <div className="border-t border-border-soft bg-background/60">
        <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("scenarioLabel")}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{t("experienceTitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span aria-live="polite" className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary sm:inline-flex">
              {t(`stage.${stage}`)}
            </span>
            <Button type="button" variant="outline" size="sm" className="shadow-none" onClick={onReset}>
              <RefreshCcwIcon className="size-3.5" aria-hidden />
              {t("reset")}
            </Button>
          </div>
        </div>

        <div ref={stageRegionRef} tabIndex={-1} className="outline-none">
          {stage === "project" ? (
            <div className="mx-auto grid max-w-4xl gap-8 px-4 py-10 md:grid-cols-[minmax(0,1fr)_22rem] md:items-center md:px-6 md:py-14">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/[0.07] px-3 py-1 text-xs font-semibold text-primary">
                  <FlaskConicalIcon className="size-3.5" aria-hidden />
                  {t("mockBadge")}
                </span>
                <h2 className="mt-5 font-instrument text-4xl font-medium italic leading-tight text-foreground sm:text-5xl">
                  {t("projectPrompt")}
                </h2>
                <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                  {t("projectPromptBody")}
                </p>
              </div>

              <div className="space-y-3">
                <BumicertCardVisual
                  coverImage="/assets/media/images/landing/supporter-river.jpg"
                  logoUrl={null}
                  ownerDid={null}
                  title={t("mockProjectTitle")}
                  organizationName={t("mockOrganization")}
                  objectives={[t("mockObjectiveOne"), t("mockObjectiveTwo")]}
                  description={t("mockProjectDescription")}
                />
                <DonateButton
                  bumicert={{
                    organizationDid: "mock:testregistryorganization",
                    rkey: "mock-cloud-forest-corridor",
                    title: t("mockProjectTitle"),
                    organizationName: t("mockOrganization"),
                    image: "/assets/media/images/landing/supporter-river.jpg",
                  }}
                  fundingConfig={{ minDonationInUSD: "5", maxDonationInUSD: "500" }}
                  disabled={false}
                  label={t("donate")}
                  onAddedToCart={() => {
                    // Round out the basket so the reward deck has several cards.
                    for (const companion of MOCK_COMPANIONS) cart.addItem(companion);
                    setStage("cart");
                  }}
                />
              </div>
            </div>
          ) : stage === "cart" ? (
            <CartView onCheckout={() => setStage("checkout")} />
          ) : (
            <CheckoutView
              authSession={MOCK_SESSION}
              sideEffects="mock"
              onBackToCart={() => setStage("cart")}
              onExploreMore={onReset}
            />
          )}
        </div>
    </div>
  );
}

export function DonationFlowExperienceClient() {
  const t = useTranslations("cart.testRegistry");
  const modal = useModal();
  const [experienceKey, setExperienceKey] = useState(0);

  const resetExperience = () => {
    modal.onVisibilityChange(false);
    modal.clear();
    setExperienceKey((current) => current + 1);
  };

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/_test"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {t("backToRegistry")}
        </Link>

        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2 text-primary">
            <FlaskConicalIcon className="size-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">{t("scenarioLabel")}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{t("experienceTitle")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{t("experienceDescription")}</p>
        </div>

        <aside className="mt-7 rounded-3xl border border-primary/20 bg-primary/[0.06] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheckIcon className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{t("parityTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-foreground/75">{t("parityBody")}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("indexingNote")}</p>
            </div>
          </div>
        </aside>

        <section className="mt-8 overflow-hidden rounded-[2rem] border border-border-soft bg-surface shadow-sm">
          <CartProvider key={experienceKey} persistence="memory">
            <DonationExperience onReset={resetExperience} />
          </CartProvider>
        </section>
      </div>
    </main>
  );
}
