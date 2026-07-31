/**
 * Work scope ⇄ CEL helpers.
 *
 * `org.hypercerts.claim.activity.workScope` is a union with two arms:
 *
 *   - `org.hypercerts.workscope.cel`            — structured, machine-evaluable
 *   - `#workScopeString`                        — a free-form comma string (legacy)
 *
 * We **write** CEL everywhere and **read** both arms, per the interop guide at
 * `/en/docs/hypercerts` ("write narrowly, read generously"). The string arm is
 * still valid upstream and a large share of published records carry it, so
 * decoding it is not optional.
 *
 * Historically the project editor wrote the string arm *and* filled it with
 * translated display labels ("Reforestasi, Pemantauan alam") rather than stable
 * keys, so the decoder also carries a reverse label map for every locale the
 * app has ever shipped. Without it those records cannot be re-keyed.
 */

import {
  normalizeKnownWorkScopeKey,
  type KnownWorkScopeKey,
  type WorkScopeLabels,
} from "@/app/_lib/work-scope-labels";

export const WORK_SCOPE_TAG_COLLECTION = "org.hypercerts.workscope.tag";
export const WORK_SCOPE_CEL_TYPE = "org.hypercerts.workscope.cel";
export const WORK_SCOPE_STRING_TYPE = "org.hypercerts.claim.activity#workScopeString";

/** A work scope as the forms model it: known keys plus free-text terms. */
export type WorkScopeSelection = {
  keys: KnownWorkScopeKey[];
  custom: string[];
};

export type StrongRef = { uri: string; cid?: string | null };

/**
 * Every translated work-scope label this app has ever rendered, mapped back to
 * its stable key. The project editor used to persist these labels verbatim, so
 * this table is what lets us recover a key from a legacy record instead of
 * treating "Pemantauan alam" as an unknown free-text term.
 *
 * Keep in sync with `messages/<locale>/**` → `common.workScopes`. Adding a
 * locale without adding it here silently degrades old records to free text.
 */
const LOCALE_WORK_SCOPE_LABELS: Record<string, Record<string, KnownWorkScopeKey>> = {
  en: {
    "Reforestation": "reforestation",
    "Forest protection": "forest_protection",
    "Nature monitoring": "biodiversity_monitoring",
    "Community stewardship": "community_stewardship",
    "Carbon removal": "carbon_removal",
    "Restoration maintenance": "restoration_maintenance",
  },
  es: {
    "Reforestación": "reforestation",
    "Protección forestal": "forest_protection",
    "Monitoreo de naturaleza": "biodiversity_monitoring",
    "Cuidado comunitario": "community_stewardship",
    "Remoción de carbono": "carbon_removal",
    "Mantenimiento de restauración": "restoration_maintenance",
  },
  id: {
    "Reforestasi": "reforestation",
    "Perlindungan hutan": "forest_protection",
    "Pemantauan alam": "biodiversity_monitoring",
    "Pengelolaan komunitas": "community_stewardship",
    "Penghilangan karbon": "carbon_removal",
    "Pemeliharaan restorasi": "restoration_maintenance",
  },
  pt: {
    "Reflorestamento": "reforestation",
    "Proteção florestal": "forest_protection",
    "Monitoramento da natureza": "biodiversity_monitoring",
    "Cuidado comunitário": "community_stewardship",
    "Remoção de carbono": "carbon_removal",
    "Manutenção da restauração": "restoration_maintenance",
  },
  sw: {
    "Upandaji upya wa misitu": "reforestation",
    "Ulinzi wa misitu": "forest_protection",
    "Ufuatiliaji wa asili": "biodiversity_monitoring",
    "Utunzaji wa jamii": "community_stewardship",
    "Uondoaji wa kaboni": "carbon_removal",
    "Matengenezo ya urejeshaji": "restoration_maintenance",
  },
};

const labelToKey = new Map<string, KnownWorkScopeKey>();
for (const labels of Object.values(LOCALE_WORK_SCOPE_LABELS)) {
  for (const [label, key] of Object.entries(labels)) labelToKey.set(label.toLowerCase(), key);
}

/**
 * Resolve one scope term to a known key. Accepts a stable key
 * (`biodiversity_monitoring`), a legacy alias (`nature_monitoring`), or a
 * translated display label in any shipped locale. Returns null for free text.
 */
export function workScopeTermToKey(term: string): KnownWorkScopeKey | null {
  const trimmed = term.trim();
  if (!trimmed) return null;
  return normalizeKnownWorkScopeKey(trimmed) ?? labelToKey.get(trimmed.toLowerCase()) ?? null;
}

/** Slug used as the tag record's rkey for a free-text scope term. */
export function customScopeTagKey(term: string): string {
  const slug = term
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "custom";
}

/** Split a comma-separated scope string into known keys and free-text terms. */
export function parseWorkScopeString(scope: string): WorkScopeSelection {
  const keys: KnownWorkScopeKey[] = [];
  const custom: string[] = [];
  for (const raw of scope.split(",")) {
    const term = raw.trim();
    if (!term) continue;
    const key = workScopeTermToKey(term);
    if (key) {
      if (!keys.includes(key)) keys.push(key);
    } else if (!custom.includes(term)) {
      custom.push(term);
    }
  }
  return { keys, custom };
}

/** Pull the tag keys out of a CEL expression like `scope.hasAny(['a', 'b'])`. */
function parseCelExpression(expression: string): string[] {
  const out: string[] = [];
  for (const match of expression.matchAll(/'([^']+)'|"([^"]+)"/g)) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function rkeyOf(uri: string): string | null {
  const rkey = uri.split("/").pop();
  return rkey && rkey.length > 0 ? rkey : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Decode either arm of the `workScope` union into the selection the forms use.
 *
 * Branches on `$type` and falls back to shape sniffing, because records written
 * by other apps are not guaranteed to carry the tag we expect. An unrecognised
 * shape yields an empty selection rather than throwing — never drop a record
 * because its work scope is odd.
 */
export function decodeWorkScope(workScope: unknown): WorkScopeSelection {
  if (!isRecord(workScope)) return { keys: [], custom: [] };
  const type = typeof workScope.$type === "string" ? workScope.$type : null;

  const isCel = type === WORK_SCOPE_CEL_TYPE || (!type && typeof workScope.expression === "string");
  if (isCel) {
    // Prefer usedTags — the rkey of a tag record *is* its key, and the refs
    // survive an expression we cannot parse. Fall back to the expression.
    const refs = Array.isArray(workScope.usedTags) ? workScope.usedTags : [];
    let terms = refs
      .map((ref) => (isRecord(ref) && typeof ref.uri === "string" ? rkeyOf(ref.uri) : null))
      .filter((value): value is string => Boolean(value));
    if (terms.length === 0 && typeof workScope.expression === "string") {
      terms = parseCelExpression(workScope.expression);
    }
    return parseWorkScopeString(terms.join(","));
  }

  const isString = type === WORK_SCOPE_STRING_TYPE || (!type && typeof workScope.scope === "string");
  if (isString && typeof workScope.scope === "string") return parseWorkScopeString(workScope.scope);

  return { keys: [], custom: [] };
}

/** All scope tag keys for a selection, known keys first, in a stable order. */
export function workScopeTagKeys(selection: WorkScopeSelection): string[] {
  const out: string[] = [...selection.keys];
  for (const term of selection.custom) {
    const key = customScopeTagKey(term);
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

export function buildWorkScopeExpression(selection: WorkScopeSelection): string {
  const keys = workScopeTagKeys(selection)
    .map((key) => `'${key.replaceAll("'", "\\'")}'`)
    .join(", ");
  return `scope.hasAny([${keys}])`;
}

/** Minimal repo client surface the tag writer needs. */
export type WorkScopeTagClient = {
  getRecord: (
    collection: string,
    rkey: string,
    options?: { repo?: string },
  ) => Promise<{ uri: string; cid?: string | null } | null>;
  createRecord: (
    collection: string,
    record: Record<string, unknown>,
    rkey?: string,
    options?: { repo?: string },
  ) => Promise<{ uri: string; cid?: string | null }>;
};

export type WorkScopeCel = {
  $type: typeof WORK_SCOPE_CEL_TYPE;
  expression: string;
  usedTags: StrongRef[];
  version: "v1";
  createdAt: string;
};

/**
 * Ensure an `org.hypercerts.workscope.tag` record exists for every term in the
 * selection and return the CEL object to embed in the claim.
 *
 * Tags are keyed by rkey so the same scope resolves to the same record on every
 * publish. A create that loses a race is retried as a read, not surfaced as an
 * error. Returns null when nothing is selected, so callers can delete the field
 * rather than write an empty expression.
 */
export async function buildWorkScopeCel(
  selection: WorkScopeSelection,
  options: {
    client: WorkScopeTagClient;
    labels: WorkScopeLabels;
    repo?: string;
    createdAt?: string;
  },
): Promise<WorkScopeCel | null> {
  const { client, labels, repo } = options;
  const tagKeys = workScopeTagKeys(selection);
  if (tagKeys.length === 0) return null;

  const createdAt = options.createdAt ?? new Date().toISOString();
  const writeOptions = repo ? { repo } : undefined;
  const customByKey = new Map(selection.custom.map((term) => [customScopeTagKey(term), term]));

  const usedTags = await Promise.all(
    tagKeys.map(async (key) => {
      const known = normalizeKnownWorkScopeKey(key);
      const name = known ? labels[known] : (customByKey.get(key) ?? key);
      const existing = await client.getRecord(WORK_SCOPE_TAG_COLLECTION, key, writeOptions).catch(() => null);
      if (existing) return { uri: existing.uri, cid: existing.cid };

      const record = {
        $type: WORK_SCOPE_TAG_COLLECTION,
        key,
        name,
        category: "topic",
        createdAt,
      };
      try {
        const created = await client.createRecord(WORK_SCOPE_TAG_COLLECTION, record, key, writeOptions);
        return { uri: created.uri, cid: created.cid };
      } catch (error) {
        const raced = await client.getRecord(WORK_SCOPE_TAG_COLLECTION, key, writeOptions).catch(() => null);
        if (raced) return { uri: raced.uri, cid: raced.cid };
        throw error;
      }
    }),
  );

  return {
    $type: WORK_SCOPE_CEL_TYPE,
    expression: buildWorkScopeExpression(selection),
    usedTags,
    version: "v1",
    createdAt,
  };
}
