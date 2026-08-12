"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon, FlaskConicalIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  AdminRewildingPanel,
  type RewildingAdminActions,
} from "@/app/admin/_components/AdminRewildingPanel";
import type { RewildingAdminDocument, RewildingAdminGrantee } from "@/app/admin/_lib/rewilding-admin";
import { MyGrantView } from "@/app/grants/_components/rewilding/MyGrantView";
import type { GrantOverview } from "@/app/grants/_components/rewilding/model";
import { REWILDING_MILESTONES } from "@/app/_lib/rewilding-milestones";

/**
 * Side-by-side preview of the two Rewilding milestone surfaces: what the
 * grantee sees (read-only) and what a GainForest admin sees (the checklist
 * they confirm from). Both render the production components; only the data
 * and the write adapter are fixtures.
 *
 * Safety: `mockActions` never calls /api/admin/rewilding, never uploads a
 * file, and never mints a document link — it edits local state only.
 */

const INITIALLY_DONE = ["m1", "m2"];

function granteeOverviewFor(done: ReadonlySet<string>): GrantOverview {
  return {
    projectName: null,
    granteeLabel: null,
    nextStep: null,
    audioMinutes: 0,
    audioTargetMinutes: 7000,
    grantAmountUsd: 1000,
    audioTrend: [],
    speciesCount: 0,
    speciesTrend: [],
    milestones: REWILDING_MILESTONES.map((definition) => ({
      id: definition.id,
      code: definition.code,
      title: definition.title,
      description: definition.description,
      state: done.has(definition.id) ? "done" : "todo",
      ...(definition.payout ? { payout: definition.payout } : {}),
      ...(definition.isRecorderInventory ? { isRecorderInventory: true } : {}),
    })),
  };
}

const FIXTURE_DOCUMENT: RewildingAdminDocument = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Grant contract",
  fileName: "grant-contract-signed.pdf",
  sizeBytes: 184_320,
  uploadedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
};

const adminGrantees: RewildingAdminGrantee[] = [
  {
    did: "did:example:fixture-grantee",
    displayName: "Sample Community Partner",
    avatarUrl: null,
    hasGrantBadge: true,
    applicationText: null,
    milestones: REWILDING_MILESTONES.map((definition) => ({
      id: definition.id,
      code: definition.code,
      title: definition.title,
      description: definition.description,
      payout: definition.payout ?? null,
      done: INITIALLY_DONE.includes(definition.id),
      updatedAt: INITIALLY_DONE.includes(definition.id)
        ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        : null,
    })),
    documents: [FIXTURE_DOCUMENT],
  },
];

export function RewildingMilestonesExperienceClient() {
  const registry = useTranslations("cart.testRegistry");
  const page = useTranslations("cart.testRegistry.rewildingMilestones");
  const [openedDocument, setOpenedDocument] = useState<string | null>(null);
  // Shared fixture state, so confirming in the admin panel below updates the
  // grantee's view above — the way the two surfaces relate in production.
  const [doneMilestones, setDoneMilestones] = useState<ReadonlySet<string>>(
    () => new Set(INITIALLY_DONE),
  );

  // Fixture writers. Nothing here reaches the network.
  const mockActions: RewildingAdminActions = {
    async setMilestone(_subjectDid, milestoneId, done) {
      setDoneMilestones((current) => {
        const next = new Set(current);
        if (done) next.add(milestoneId);
        else next.delete(milestoneId);
        return next;
      });
    },
    async addDocument(input) {
      return {
        id: `fixture-${Date.now()}`,
        title: input.title,
        fileName: input.fileName,
        sizeBytes: Math.round((input.dataBase64.length * 3) / 4),
        uploadedAt: new Date().toISOString(),
      };
    },
    async deleteDocument() {},
    async openDocument(document) {
      setOpenedDocument(document.title);
    },
  };

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/_test"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden /> {registry("backToRegistry")}
        </Link>

        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2 text-primary">
            <FlaskConicalIcon className="size-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">
              {registry("scenarioLabel")}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {page("title")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">{page("description")}</p>
        </div>

        <aside className="mt-7 rounded-3xl border border-primary/20 bg-primary/[0.06] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheckIcon className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{registry("parityTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-foreground/75">{registry("parityBody")}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{page("mockNote")}</p>
            </div>
          </div>
        </aside>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">{page("granteeTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{page("granteeDescription")}</p>
          <div className="mt-4 rounded-[2rem] border border-border-soft bg-surface p-5 shadow-sm sm:p-6">
            <MyGrantView
              overview={granteeOverviewFor(doneMilestones)}
              recorders={[]}
              onOpenRecorders={() => {}}
            />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">{page("adminTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{page("adminDescription")}</p>
          <div className="mt-4 rounded-[2rem] border border-border-soft bg-surface p-5 shadow-sm sm:p-6">
            <AdminRewildingPanel
              grantees={adminGrantees}
              documentStorageConfigured
              actions={mockActions}
            />
            {openedDocument ? (
              <p className="mt-3 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2 text-xs text-foreground/75">
                {page("openedNote", { title: openedDocument })}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
