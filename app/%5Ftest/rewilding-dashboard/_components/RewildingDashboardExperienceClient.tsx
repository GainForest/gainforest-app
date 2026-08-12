"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, FlaskConicalIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { MyGrantView } from "@/app/grants/_components/rewilding/MyGrantView";
import { MyRecordersView } from "@/app/grants/_components/rewilding/MyRecordersView";
import type {
  GrantOverview,
  NewRecorderInput,
  Recorder,
} from "@/app/grants/_components/rewilding/model";
import { cn } from "@/lib/utils";

/**
 * Registry experience for the Rewilding the Web grantee dashboard. Renders the
 * production MyGrantView / MyRecordersView / AddRecorderForm components against
 * local fixture state only: "adding" a recorder appends fixture rows, completes
 * the inventory milestone, and clears the next step. Nothing is written to a
 * PDS, indexer, or shipping service.
 */

// Fixture grant: proper nouns stay untranslated, like real indexer data would be.
const MOCK_PROJECT_NAME = "Sounds of the Savannah";
const MOCK_GRANTEE_LABEL = "SORALO · Kenya";
const RECORDER_INVENTORY_MILESTONE_ID = "m4";

function inDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildMockOverview(): GrantOverview {
  return {
    projectName: MOCK_PROJECT_NAME,
    granteeLabel: MOCK_GRANTEE_LABEL,
    nextStep: { title: "Tell us which recorders you already have", dueDate: inDays(4) },
    audioMinutes: 412,
    audioTrend: [12, 40, 74, 96, 150, 231, 305, 412],
    speciesCount: 27,
    speciesTrend: [2, 5, 9, 11, 16, 19, 24, 27],
    milestones: [
      { id: "m1", title: "Grant agreement signed", state: "done" },
      { id: "m2", title: "Project registered on GainForest", state: "done" },
      { id: "m3", title: "First test recording uploaded", state: "done" },
      {
        id: RECORDER_INVENTORY_MILESTONE_ID,
        title: "Recorder inventory — register the devices you already have",
        state: "active",
        isRecorderInventory: true,
      },
      { id: "m5", title: "All recorders deployed in the field", state: "todo" },
      { id: "m6", title: "First month of monitoring data published", state: "todo" },
    ],
  };
}

function buildMockRecorders(): Recorder[] {
  return [
    {
      id: "r1",
      deviceType: "AudioMoth 1.2.0",
      site: "Olkiramatian ridge",
      origin: "owned",
      status: "recording",
      weeklyMinutes: [18, 42, 35, 61, 48, 74],
    },
    {
      id: "r2",
      deviceType: "Song Meter Micro",
      site: "Shompole swamp",
      origin: "owned",
      status: "recording",
      weeklyMinutes: [9, 21, 16, 33, 27, 41],
    },
    {
      id: "r3",
      deviceType: "AudioMoth 1.2.0",
      site: null,
      origin: "gainforest",
      status: "inTransit",
      arrivalEstimate: inDays(10),
      weeklyMinutes: [],
    },
    {
      id: "r4",
      deviceType: "AudioMoth 1.2.0",
      site: null,
      origin: "gainforest",
      status: "requested",
      weeklyMinutes: [],
    },
  ];
}

type PageTab = "grant" | "recorders";

export function RewildingDashboardExperienceClient() {
  const t = useTranslations("cart.testRegistry");
  const rd = useTranslations("cart.testRegistry.rewildingDashboard");
  const nav = useTranslations("marketplace.grants.rewildingDashboard");

  const [tab, setTab] = useState<PageTab>("grant");
  const [overview, setOverview] = useState<GrantOverview>(buildMockOverview);
  const [recorders, setRecorders] = useState<Recorder[]>(buildMockRecorders);
  const [nextId, setNextId] = useState(5);

  const reset = () => {
    setOverview(buildMockOverview());
    setRecorders(buildMockRecorders());
    setNextId(5);
    setTab("grant");
  };

  // Mock persistence: append fixture rows and let the milestone/next-step state
  // react, so the cross-page flow the wireframes describe is walkable end to end.
  const handleAddRecorder = (input: NewRecorderInput) => {
    setRecorders((current) => {
      const added: Recorder[] = Array.from({ length: input.quantity }, (_, index) => ({
        id: `r${nextId + index}`,
        deviceType: input.deviceType,
        site: input.site.length > 0 ? input.site : null,
        origin: input.source === "owned" ? "owned" : "gainforest",
        status:
          input.source === "owned" ? (input.condition === "fieldWorking" ? "recording" : "idle") : "requested",
        weeklyMinutes: input.source === "owned" ? [0, 0, 0, 0, 0, 0] : [],
      }));
      return [...current, ...added];
    });
    setNextId((id) => id + input.quantity);
    if (input.source === "owned") {
      setOverview((current) => ({
        ...current,
        nextStep: null,
        milestones: current.milestones.map((milestone) =>
          milestone.id === RECORDER_INVENTORY_MILESTONE_ID ? { ...milestone, state: "done" } : milestone,
        ),
      }));
    }
  };

  const pageTabs = useMemo(
    () =>
      [
        { id: "grant" as const, label: nav("grant.navLabel") },
        { id: "recorders" as const, label: nav("recorders.navLabel") },
      ] satisfies Array<{ id: PageTab; label: string }>,
    [nav],
  );

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
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{rd("title")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{rd("description")}</p>
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
          {/* Stand-in for the app-shell sidebar rows the wireframes add: the two
              dashboard pages, switchable the way the sidebar would. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
            <div role="tablist" aria-label={rd("pagesLabel")} className="flex gap-1.5">
              {pageTabs.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === page.id}
                  onClick={() => setTab(page.id)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    tab === page.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {page.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t("reset")}
            </button>
          </div>
          <div className="p-4 sm:p-6">
            {tab === "grant" ? (
              <MyGrantView overview={overview} recorders={recorders} onOpenRecorders={() => setTab("recorders")} />
            ) : (
              <MyRecordersView recorders={recorders} canAddRecorders onAddRecorder={handleAddRecorder} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
