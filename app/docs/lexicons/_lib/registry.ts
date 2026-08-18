// Server-only registry over every lexicon JSON in ./_schemas. Reads the files
// from disk at build time (these pages are statically generated), groups them
// into the sections we surface, and exposes lookup helpers. Keep this out of
// client components — it uses `node:fs`. Pure helpers/types live in ./types.ts.

import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { LexiconDoc } from "./types";

const SCHEMA_DIR = path.join(process.cwd(), "app", "docs", "lexicons", "_schemas");

function loadAll(): LexiconDoc[] {
  const out: LexiconDoc[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".json")) {
        const doc = JSON.parse(readFileSync(full, "utf8")) as LexiconDoc;
        if (doc && typeof doc.id === "string" && doc.defs) out.push(doc);
      }
    }
  };
  walk(SCHEMA_DIR);
  return out;
}

// Sections shown in the catalog, in display order. A lexicon belongs to the
// first section whose `prefix` matches its id (exact or a dotted descendant),
// or — when `ids` is set — only to the listed ids. Schemas matching no section
// stay on disk (so refs to them still resolve as labels) but aren't surfaced.
// `id` is a stable key used for translation lookups (common.docs.sections.<id>);
// `title` is a proper-noun standard name kept verbatim across locales.
interface Section {
  id: string;
  title: string;
  prefix: string;
  ids?: string[];
}

const SECTIONS: Section[] = [
  {
    id: "feed",
    title: "Feed",
    prefix: "app.gainforest.feed",
    ids: ["app.gainforest.feed.post", "app.gainforest.feed.like", "app.gainforest.feed.pin"],
  },
  {
    id: "dwc",
    title: "Darwin Core",
    prefix: "app.gainforest.dwc",
  },
  {
    id: "ac",
    title: "Audiovisual Core",
    prefix: "app.gainforest.ac",
  },
  {
    id: "organization",
    title: "Organization",
    prefix: "app.gainforest.organization",
    // Only the reviewed map-data pair is surfaced; the other organization
    // schemas on disk are drafts and stay unlisted until they get the same
    // usage-driven cleanup.
    ids: ["app.gainforest.organization.layer", "app.gainforest.organization.layerGroup"],
  },
  {
    id: "certified",
    title: "Certified",
    prefix: "app.certified",
    ids: [
      "app.certified.actor.organization",
      "app.certified.actor.profile",
      "app.certified.graph.follow",
      "app.certified.badge.award",
      "app.certified.badge.definition",
      "app.certified.location",
    ],
  },
  {
    id: "hypercerts",
    title: "Hypercerts",
    prefix: "org.hypercerts",
  },
];

function sectionFor(id: string): Section | undefined {
  return SECTIONS.find((s) =>
    s.ids ? s.ids.includes(id) : id === s.prefix || id.startsWith(s.prefix + "."),
  );
}

const ALL = loadAll();

/** Every surfaced lexicon, sorted by id. */
export const LEXICONS: LexiconDoc[] = ALL.filter((m) => sectionFor(m.id)).sort((a, b) =>
  a.id.localeCompare(b.id),
);

export const byId = new Map(LEXICONS.map((l) => [l.id, l]));

/** Ids of every surfaced lexicon — used to decide which refs become links. */
export const KNOWN_IDS = new Set(LEXICONS.map((l) => l.id));

export interface Group {
  id: string;
  title: string;
  lexicons: LexiconDoc[];
}

export const GROUPS: Group[] = SECTIONS.map((s) => ({
  id: s.id,
  title: s.title,
  lexicons: LEXICONS.filter((l) => sectionFor(l.id) === s),
})).filter((g) => g.lexicons.length > 0);

export function groupOf(id: string): Group | undefined {
  return GROUPS.find((g) => g.lexicons.some((l) => l.id === id));
}
