"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, PencilLineIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import {
  plaintextWithFacetsFromSegments,
  type LeafletLinearDocument,
} from "@/app/_lib/leaflet-richtext";
import { EvidenceAdder } from "@/app/cert/[did]/[rkey]/_components/timeline/EvidenceAdder";
import {
  buildOptimisticAttachmentItem,
  buildStubContextAttachmentRecord,
  createContextAttachment,
} from "@/app/cert/[did]/[rkey]/_components/timeline/contextAttachmentMutations";
import { ProjectTimelineReadonly } from "@/app/projects/[did]/[rkey]/_components/ProjectTimelineReadonly";

// Fixture identity — nothing here resolves to a real account or record.
const MOCK_DID = "did:example:project-updates-registry";
const MOCK_ACTIVITY_URI = `at://${MOCK_DID}/org.hypercerts.claim.activity/mock-activity`;
const MOCK_CID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";

// Non-empty source data stops the composer from fetching the (nonexistent)
// account's evidence; every picker simply shows its empty state.
const MOCK_SOURCES = {
  audio: [],
  occurrences: [],
  occurrencesIncomplete: true,
  treeGroups: [],
  places: [],
};

type MockCreateArgs = Parameters<typeof createContextAttachment>[0];

export function ProjectUpdatesExperienceClient() {
  const t = useTranslations("cart.testRegistry");
  const experienceT = useTranslations("cart.testRegistry.projectUpdates");
  const mockCounter = useRef(0);

  const seedEntries = useMemo<TimelineAttachmentItem[]>(() => {
    const richBody = plaintextWithFacetsFromSegments([
      { text: `${experienceT("seedIntro")} `, marks: {} },
      { text: experienceT("seedIntroBold"), marks: { bold: true } },
      { text: ` ${experienceT("seedIntroTail")}`, marks: {} },
    ]);
    const richDocument: LeafletLinearDocument = {
      $type: "pub.leaflet.pages.linearDocument",
      blocks: [
        {
          $type: "pub.leaflet.pages.linearDocument#block",
          block: { $type: "pub.leaflet.blocks.header", level: 2, plaintext: experienceT("seedHeading") },
        },
        {
          $type: "pub.leaflet.pages.linearDocument#block",
          block: {
            $type: "pub.leaflet.blocks.text",
            plaintext: richBody.plaintext,
            ...(richBody.facets.length > 0 ? { facets: richBody.facets } : {}),
          },
        },
        {
          $type: "pub.leaflet.pages.linearDocument#block",
          block: {
            $type: "pub.leaflet.blocks.unorderedList",
            children: [
              { content: { $type: "pub.leaflet.blocks.text", plaintext: experienceT("seedListOne") } },
              { content: { $type: "pub.leaflet.blocks.text", plaintext: experienceT("seedListTwo") } },
            ],
          },
        },
        {
          $type: "pub.leaflet.pages.linearDocument#block",
          block: { $type: "pub.leaflet.blocks.blockquote", plaintext: experienceT("seedQuote") },
        },
      ],
    };

    const seed = (
      rkey: string,
      title: string,
      description: unknown,
      createdAt: string,
    ): TimelineAttachmentItem => ({
      metadata: {
        did: MOCK_DID,
        uri: `at://${MOCK_DID}/org.hypercerts.context.attachment/${rkey}`,
        rkey,
        cid: MOCK_CID,
        createdAt,
        indexedAt: createdAt,
      },
      creatorInfo: {
        did: MOCK_DID,
        organizationName: t("mockOrganization"),
        organizationLogo: null,
      },
      record: {
        title,
        shortDescription: null,
        description,
        contentType: "update",
        subjects: [{ uri: MOCK_ACTIVITY_URI, cid: MOCK_CID }],
        content: [],
        createdAt,
      },
    });

    return [
      seed("seed-leaflet", experienceT("seedTitle"), richDocument, "2026-08-10T09:30:00.000Z"),
      seed(
        "seed-plain",
        experienceT("seedPlainTitle"),
        { $type: "org.hypercerts.defs#descriptionString", value: experienceT("seedPlainBody") },
        "2026-08-03T14:00:00.000Z",
      ),
    ];
  }, [experienceT, t]);

  const [entries, setEntries] = useState<TimelineAttachmentItem[]>(seedEntries);

  // Production parity with zero side effects: the same validation and record
  // building as the real path, but nothing ever leaves the page.
  const mockCreateAttachment = useCallback(async (args: MockCreateArgs) => {
    const record = buildStubContextAttachmentRecord({
      draft: args.draft,
      activitySubject: args.activitySubject,
    });
    mockCounter.current += 1;
    const rkey = `mock-${mockCounter.current}`;
    const created = {
      uri: `at://${args.organizationDid}/org.hypercerts.context.attachment/${rkey}`,
      cid: MOCK_CID,
      rkey,
      record,
    };
    const content = args.draft.contents.map((item) =>
      typeof item === "string"
        ? ({ $type: "org.hypercerts.defs#uri", uri: item } as const)
        : ({
            $type: "org.hypercerts.defs#smallBlob",
            blob: {
              $type: "blob",
              uri: URL.createObjectURL(item),
              cid: null,
              name: item.name,
              mimeType: item.type || "application/octet-stream",
              size: item.size,
            },
          } as const),
    );
    return {
      created,
      optimisticItem: buildOptimisticAttachmentItem({
        did: args.organizationDid,
        created,
        draft: args.draft,
        activitySubject: args.activitySubject,
        content,
      }),
    };
  }, []);

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/_test"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {t("backToRegistry")}
        </Link>

        <div className="mt-5 flex items-center gap-2 text-primary">
          <PencilLineIcon className="size-5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">{t("eyebrow")}</span>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {experienceT("title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
          {experienceT("description")}
        </p>

        <aside className="mt-6 rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-foreground">{experienceT("mockBadge")}</p>
              <p className="mt-1 text-sm leading-6 text-foreground/75">{experienceT("mockNote")}</p>
            </div>
          </div>
        </aside>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {experienceT("composerLabel")}
          </h2>
          <div className="mt-3">
            <EvidenceAdder
              organizationDid={MOCK_DID}
              activityUri={MOCK_ACTIVITY_URI}
              activityCid={MOCK_CID}
              sources={MOCK_SOURCES}
              entries={entries}
              attachmentsUnavailable={false}
              createPermission={{ allowed: true, reason: null }}
              onCreated={(entry) => setEntries((current) => [entry, ...current])}
              onChanged={() => {}}
              createAttachment={mockCreateAttachment}
            />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {experienceT("timelineLabel")}
          </h2>
          <div className="mt-3">
            <ProjectTimelineReadonly
              organizationDid={MOCK_DID}
              entries={entries}
              references={[]}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
