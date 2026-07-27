"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { JsonBlock } from "./JsonBlock";
import { RichText } from "./RichText";

type TopicId =
  | "description"
  | "workScope"
  | "tags"
  | "subjects"
  | "rights"
  | "location"
  | "contributors"
  | "receipt";

// Record fragments taken verbatim from what each app writes today. JSON is
// data, not copy, so it is never translated.
const SNIPPETS: Record<TopicId, { gainforest: string; maearth: string; advice: string }> = {
  description: {
    gainforest: `"description": {
  "$type": "org.hypercerts.defs#descriptionString",
  "value": "Restoring 2 ha of riverbank."
}`,
    maearth: `"description": {
  "$type": "pub.leaflet.pages.linearDocument",
  "blocks": [{
    "$type": "pub.leaflet.pages.linearDocument#block",
    "block": {
      "$type": "pub.leaflet.blocks.text",
      "plaintext": "Restoring 2 ha of riverbank."
    }
  }]
}`,
    advice: `const doc = record.description;
switch (doc?.$type) {
  case "pub.leaflet.pages.linearDocument": return renderBlocks(doc.blocks);
  case "org.hypercerts.defs#descriptionString": return renderText(doc.value);
  default: return null; // unknown arm — degrade, don't throw
}`,
  },
  workScope: {
    gainforest: `"workScope": {
  "$type": "org.hypercerts.workscope.cel",
  "expression": "scope.hasAny([\\"reforestation\\", \\"agroforestry\\"])",
  "usedTags": [
    { "uri": "at://did:plc:…/org.hypercerts.workscope.tag/reforestation",
      "cid": "bafy…" }
  ],
  "version": "v1",
  "createdAt": "2026-07-27T10:00:00Z"
}

// Records published before this was unified still carry the
// legacy arm — sometimes holding translated display labels:
// { "$type": "org.hypercerts.claim.activity#workScopeString",
//   "scope": "Reforestasi, Pemantauan alam" }`,
    maearth: `"workScope": {
  "$type": "org.hypercerts.workscope.cel",
  "expression": "scope.hasAny([\\"restoration\\", \\"education\\"])",
  "usedTags": [
    { "uri": "at://did:plc:…/org.hypercerts.workscope.tag/3l…",
      "cid": "bafy…" }
  ],
  "version": "v1",
  "createdAt": "2026-01-15T10:00:00Z"
}`,
    advice: `// Read both arms with one tolerant helper.
const tags = workScope?.scope
  ? workScope.scope.split(",").map((s) => s.trim())
  : [...(workScope?.expression ?? "").matchAll(/(["'])(.*?)\\1/g)].map((m) => m[2]);`,
  },
  tags: {
    gainforest: `// rkey === the scope key → create is idempotent per repo
// PUT <user repo> / org.hypercerts.workscope.tag / mangrove_restoration
{ "key": "mangrove_restoration",
  "name": "Mangrove restoration",
  "category": "topic", "createdAt": "…" }`,
    maearth: `// one curated taxonomy on the platform account, TID rkeys
// POST <platform repo> / org.hypercerts.workscope.tag / 3lkq…
{ "key": "restoration", "name": "Restoration",
  "category": "topic", "status": "accepted",
  "createdAt": "…" }`,
    advice: `// Identity is the key, not the URI: the same concept exists
// as many records across many repos.
const byKey = new Map(tagRecords.map((r) => [r.value.key, r]));`,
  },
  subjects: {
    gainforest: `"subjects": [
  // [0] the claim — this is what puts it on the timeline
  { "$type": "com.atproto.repo.strongRef",
    "uri": "at://…/org.hypercerts.claim.activity/…", "cid": "…" },
  // [1..] optional context, e.g. the site
  { "$type": "com.atproto.repo.strongRef",
    "uri": "at://…/app.certified.location/…", "cid": "…" }
]`,
    maearth: `"subjects": [
  // [0] the project collection
  { "uri": "at://…/org.hypercerts.collection/…", "cid": "…" },
  // [1] the claim
  { "uri": "at://…/org.hypercerts.claim.activity/…", "cid": "…" }
]`,
    advice: `// Membership, not position.
const belongs = (att, uris) =>
  (att.subjects ?? []).some((s) => uris.includes(s.uri));`,
  },
  rights: {
    gainforest: `// field omitted`,
    maearth: `// one platform-wide default, hosted on another account
"rights": {
  "uri": "at://did:plc:…hypercerts.org…/org.hypercerts.claim.rights/3l…",
  "cid": "bafy…"
}`,
    advice: `// Compare identity on the URI only — editing the rights text
// rotates its CID and would otherwise churn every activity.
const sameRights = a.rights?.uri === b.rights?.uri;`,
  },
  location: {
    gainforest: `{
  "$type": "app.certified.location",
  "lpVersion": "1.0",
  "srs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
  "locationType": "coordinate-decimal",
  "location": { "$type": "app.certified.location#string",
                "string": "1.2345,103.6789" }
}`,
    maearth: `{
  "$type": "app.certified.location",
  "lpVersion": "1.0",
  "srs": "http://www.opengis.net/def/crs/EPSG/0/4326",
  "locationType": "geojson-polygon",
  "location": { "$type": "app.certified.location#string",
                "string": "{\\"type\\":\\"Polygon\\",\\"coordinates\\":[[…]]}" }
}`,
    advice: `switch (record.locationType) {
  case "coordinate-decimal": { const [lat, lng] = str.split(","); return point(lat, lng); }
  case "geojson-polygon":    return JSON.parse(str);
  default:                   return null;
}`,
  },
  contributors: {
    gainforest: `"contributors": [
  { "contributorIdentity": {
      "$type": "org.hypercerts.claim.activity#contributorIdentity",
      "identity": "Maria Santos" } }
]`,
    maearth: `"contributors": [
  { "contributorIdentity": {
      "$type": "org.hypercerts.claim.activity#contributorIdentity",
      "identity": "did:plc:xyz…" } }
]`,
    advice: `const id = entry.contributorIdentity?.identity ?? "";
return id.startsWith("did:") ? resolveProfile(id) : { displayName: id };`,
  },
  receipt: {
    gainforest: `{
  "$type": "org.hypercerts.funding.receipt",
  "from": { "$type": "app.certified.defs#did",
            "did": "did:plc:donor…" },
  "to":   { "$type": "org.hypercerts.funding.receipt#text",
            "value": "0xabc…" },
  "amount": "25.00", "currency": "USDC",
  "paymentRail": "onchain", "paymentNetwork": "base",
  "transactionId": "0x…",
  "for": { "uri": "at://…/org.hypercerts.claim.activity/…",
           "cid": "…" },
  "occurredAt": "…", "createdAt": "…"
}`,
    maearth: `// not published to PDS`,
    advice: `// \`for\` is a strong ref in newer schemas and a plain at-uri in older ones.
const subjectUri = typeof r.for === "string" ? r.for : r.for?.uri;`,
  },
};

const TOPICS: TopicId[] = [
  "description",
  "workScope",
  "tags",
  "subjects",
  "rights",
  "location",
  "contributors",
  "receipt",
];

// Pick a field, see both apps' wire shapes side by side plus the shape a third
// app should write and the reader that survives both.
export function DivergenceMatrix() {
  const t = useTranslations("common.hypercerts.divergence");
  const [topic, setTopic] = useState<TopicId>("description");

  // Literal keys so the static i18n checker can verify every message exists.
  const copy: Record<TopicId, { label: string; title: string; gainforest: string; maearth: string; advice: string }> = {
    description: {
      label: t("topics.description.label"),
      title: t("topics.description.title"),
      gainforest: t("topics.description.gainforest"),
      maearth: t("topics.description.maearth"),
      advice: t("topics.description.advice"),
    },
    workScope: {
      label: t("topics.workScope.label"),
      title: t("topics.workScope.title"),
      gainforest: t("topics.workScope.gainforest"),
      maearth: t("topics.workScope.maearth"),
      advice: t("topics.workScope.advice"),
    },
    tags: {
      label: t("topics.tags.label"),
      title: t("topics.tags.title"),
      gainforest: t("topics.tags.gainforest"),
      maearth: t("topics.tags.maearth"),
      advice: t("topics.tags.advice"),
    },
    subjects: {
      label: t("topics.subjects.label"),
      title: t("topics.subjects.title"),
      gainforest: t("topics.subjects.gainforest"),
      maearth: t("topics.subjects.maearth"),
      advice: t("topics.subjects.advice"),
    },
    rights: {
      label: t("topics.rights.label"),
      title: t("topics.rights.title"),
      gainforest: t("topics.rights.gainforest"),
      maearth: t("topics.rights.maearth"),
      advice: t("topics.rights.advice"),
    },
    location: {
      label: t("topics.location.label"),
      title: t("topics.location.title"),
      gainforest: t("topics.location.gainforest"),
      maearth: t("topics.location.maearth"),
      advice: t("topics.location.advice"),
    },
    contributors: {
      label: t("topics.contributors.label"),
      title: t("topics.contributors.title"),
      gainforest: t("topics.contributors.gainforest"),
      maearth: t("topics.contributors.maearth"),
      advice: t("topics.contributors.advice"),
    },
    receipt: {
      label: t("topics.receipt.label"),
      title: t("topics.receipt.title"),
      gainforest: t("topics.receipt.gainforest"),
      maearth: t("topics.receipt.maearth"),
      advice: t("topics.receipt.advice"),
    },
  };

  const active = copy[topic];
  const snippet = SNIPPETS[topic];

  return (
    <div>
      <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
        {TOPICS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTopic(id)}
            aria-pressed={topic === id}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] transition-colors",
              topic === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {copy[id].label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={topic}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="mt-5"
        >
          <h3 className="m-0 text-[15px] font-medium text-foreground">
            <RichText text={active.title} />
          </h3>

          <div className="mt-4 flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
                <span className="mr-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                  {t("gainforestLabel")}
                </span>
                <RichText text={active.gainforest} />
              </p>
              <JsonBlock code={snippet.gainforest} label="GainForest" />
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
                <span className="mr-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                  {t("maearthLabel")}
                </span>
                <RichText text={active.maearth} />
              </p>
              <JsonBlock code={snippet.maearth} label="Ma Earth" />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/[0.04] px-5 py-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary">{t("adviceLabel")}</div>
            <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
              <RichText text={active.advice} />
            </p>
            <div className="mt-3">
              <JsonBlock code={snippet.advice} label="TypeScript" tone="advice" />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
