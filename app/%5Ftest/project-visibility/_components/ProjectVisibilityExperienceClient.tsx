"use client";

import Link from "next/link";
import { ArrowLeftIcon, FlaskConicalIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ProjectVisibilityCard,
  type ProjectVisibilityAdapter,
} from "@/app/(manage)/manage/projects/_components/ProjectVisibilityCard";
import { groupManageTarget, type ManageTarget } from "@/lib/links";

/**
 * The visibility card from Manage → Projects, in each state it can be in.
 *
 * The card itself is the production component; only its two server calls are
 * replaced by fixtures, so nothing here can list a real account on the explore
 * pages. Adapters are module constants because the card re-reads its status
 * whenever the adapter identity changes.
 */

const FIXTURE_ORG = { did: "did:plc:testregistryorg", accountKind: "organization" as const, identifier: "preview-org.gainforest.app" };
const OWNER_TARGET = groupManageTarget({ ...FIXTURE_ORG, role: "owner" });
const MEMBER_TARGET = groupManageTarget({ ...FIXTURE_ORG, role: "member" });

function fixedStatus(status: { available: boolean; published: boolean }): ProjectVisibilityAdapter {
  return {
    loadStatus: async () => status,
    // Listing is a real side effect, so the preview never performs one — it
    // just reports success and lets the card show its own listed state.
    publish: async () => {},
  };
}

const UNLISTED = fixedStatus({ available: true, published: false });
const LISTED = fixedStatus({ available: true, published: true });
const UNAVAILABLE = fixedStatus({ available: false, published: false });
const UNKNOWN: ProjectVisibilityAdapter = {
  loadStatus: async () => null,
  publish: async () => {},
};

export function ProjectVisibilityExperienceClient() {
  const t = useTranslations("cart.testRegistry");
  const scenario = useTranslations("cart.testRegistry.projectVisibility");

  const scenarios: Array<{ key: string; target: ManageTarget; adapter: ProjectVisibilityAdapter }> = [
    { key: "unlisted", target: OWNER_TARGET, adapter: UNLISTED },
    { key: "listed", target: OWNER_TARGET, adapter: LISTED },
    { key: "member", target: MEMBER_TARGET, adapter: UNLISTED },
    { key: "unavailable", target: OWNER_TARGET, adapter: UNAVAILABLE },
    { key: "unknown", target: OWNER_TARGET, adapter: UNKNOWN },
  ];

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
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
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{scenario("title")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{scenario("description")}</p>
        </div>

        <aside className="mt-7 rounded-3xl border border-primary/20 bg-primary/[0.06] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheckIcon className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{t("parityTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-foreground/75">{t("parityBody")}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{scenario("mockNote")}</p>
            </div>
          </div>
        </aside>

        <section className="mt-8 space-y-6">
          {scenarios.map(({ key, target, adapter }) => (
            <div key={key} className="rounded-[2rem] border border-border-soft bg-surface p-5 shadow-sm sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {scenario(`scenarios.${key}.label`)}
              </p>
              <p className="mt-1 mb-4 text-sm leading-6 text-muted-foreground">{scenario(`scenarios.${key}.body`)}</p>
              <ProjectVisibilityCard target={target} adapter={adapter} />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
