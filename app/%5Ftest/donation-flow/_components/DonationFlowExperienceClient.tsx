"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { CartProvider, useCart, type CartItem } from "@/app/_components/cart/CartProvider";
import { CartView } from "@/app/cart/_components/CartView";
import { CheckoutView } from "@/app/checkout/_components/CheckoutView";
import { DonateButton } from "@/app/cert/[did]/[rkey]/_components/donate/DonateButton";
import { BumicertCardVisual } from "@/components/bumicert/BumicertCard";
import { useModal } from "@/components/ui/modal/context";
import type { AuthSession } from "@/app/_lib/auth";
import { TestBadge } from "../../_components/TestBadge";

type DonationStage = "project" | "cart" | "checkout";

const MOCK_SESSION: AuthSession = {
  isLoggedIn: true,
  did: "did:plc:testregistrydonor",
  handle: "preview-donor.gainforest.app",
};

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
    <div
      ref={stageRegionRef}
      tabIndex={-1}
      role="region"
      aria-label={t(`stage.${stage}`)}
      className="focus:outline-2 focus:outline-primary focus:outline-offset-2"
    >
      {stage === "project" ? (
        <div className="mx-auto grid max-w-4xl gap-8 px-4 py-10 md:grid-cols-[minmax(0,1fr)_22rem] md:items-center md:px-6 md:py-14">
          <div className="max-w-xl">
            <h2 className="font-instrument text-4xl font-medium italic leading-tight text-foreground sm:text-5xl">
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
    <main className="min-h-screen bg-background">
      <div className="mx-4 mt-4 flex h-10 items-center gap-3 rounded-xl bg-muted px-4 sm:mx-6">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <Link href="/_test" className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeftIcon className="size-4" aria-hidden />
            <span className="sr-only">{t("backToRegistry")}</span>
          </Link>
          <h1 className="text-sm font-medium text-foreground">{t("experienceTitle")}</h1>
          <div className="ml-auto">
            <TestBadge label={t("testBadge")} description={t("parityBody")} />
          </div>
        </div>
      </div>
      <CartProvider key={experienceKey} persistence="memory">
        <DonationExperience onReset={resetExperience} />
      </CartProvider>
    </main>
  );
}
