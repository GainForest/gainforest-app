// Shared types + pure helpers for the lexicon docs. No Node `fs` here so this
// module is safe to import from both server and client components. The file
// loader (which needs `fs`) lives in ./registry.ts and stays server-only.

export interface LexiconProperty {
  type: string;
  format?: string;
  description?: string;
  ref?: string;
  refs?: string[];
  items?: LexiconProperty;
  // string / numeric constraints seen across our schemas
  maxLength?: number;
  minLength?: number;
  maxGraphemes?: number;
  minGraphemes?: number;
  minimum?: number;
  maximum?: number;
  default?: string | number | boolean;
  const?: string | number | boolean;
  enum?: string[];
  knownValues?: string[];
  // blob
  accept?: string[];
  maxSize?: number;
  // union
  closed?: boolean;
}

export interface LexiconDef {
  type: string;
  description?: string;
  key?: string;
  // record
  record?: { type: string; required?: string[]; properties?: Record<string, LexiconProperty> };
  // object
  required?: string[];
  properties?: Record<string, LexiconProperty>;
  // query / procedure
  parameters?: { properties?: Record<string, LexiconProperty>; required?: string[] };
  input?: { encoding?: string; schema?: LexiconDef };
  output?: { encoding?: string; schema?: LexiconDef };
  // string token-ish / array / union
  enum?: string[];
  knownValues?: string[];
  items?: LexiconProperty;
  refs?: string[];
  closed?: boolean;
}

export interface LexiconDoc {
  lexicon: number;
  id: string;
  description?: string;
  defs: Record<string, LexiconDef>;
}

/** Short label for a lexicon (last NSID segment). */
export function shortName(id: string): string {
  return id.slice(id.lastIndexOf(".") + 1);
}

/** The "main" def name if present, else the first def. */
export function mainDefName(doc: LexiconDoc): string {
  return "main" in doc.defs ? "main" : Object.keys(doc.defs)[0];
}

/** A human description for catalog rows. */
export function lexiconDescription(doc: LexiconDoc): string {
  if (doc.description) return doc.description;
  const main = doc.defs[mainDefName(doc)];
  return main?.description ?? "";
}

type DefKind =
  | "record"
  | "object"
  | "query"
  | "procedure"
  | "subscription"
  | "token"
  | "string"
  | "array"
  | "union"
  | "other";

export interface FlatField extends LexiconProperty {
  name: string;
  required: boolean;
}

export interface DefView {
  kind: DefKind;
  description?: string;
  /** record key, e.g. "tid" / "literal:self" */
  key?: string;
  /** main object/record/query-parameter fields */
  fields: FlatField[];
  /** for token/string enum defs */
  values?: string[];
  /** for union defs */
  refs?: string[];
  /** query / procedure output schema, summarized */
  outputFields?: FlatField[];
}

function fieldsFrom(
  properties: Record<string, LexiconProperty> | undefined,
  required: string[] | undefined,
): FlatField[] {
  const req = new Set(required ?? []);
  return Object.entries(properties ?? {}).map(([name, prop]) => ({
    ...prop,
    name,
    required: req.has(name),
  }));
}

/** Normalize any def into a renderable view. */
export function viewDef(def: LexiconDef): DefView {
  const kind = (def.type as DefKind) ?? "other";
  switch (def.type) {
    case "record":
      return {
        kind: "record",
        description: def.description,
        key: def.key,
        fields: fieldsFrom(def.record?.properties, def.record?.required),
      };
    case "object":
      return {
        kind: "object",
        description: def.description,
        fields: fieldsFrom(def.properties, def.required),
      };
    case "query":
    case "procedure":
    case "subscription": {
      const out = def.output?.schema;
      return {
        kind,
        description: def.description,
        fields: fieldsFrom(def.parameters?.properties, def.parameters?.required),
        outputFields: out ? fieldsFrom(out.properties, out.required) : undefined,
      };
    }
    case "token":
      return { kind: "token", description: def.description, fields: [] };
    case "string":
      return {
        kind: "string",
        description: def.description,
        fields: [],
        values: def.knownValues ?? def.enum,
      };
    case "array":
      return {
        kind: "array",
        description: def.description,
        fields: [],
        refs: def.items?.ref ? [def.items.ref] : undefined,
      };
    default:
      return { kind: "other", description: def.description, fields: [] };
  }
}

// --- type & constraint labelling ----------------------------------------

function refTail(ref: string): string {
  if (ref.startsWith("#")) return ref;
  // app.gainforest.common.defs#richtext -> defs#richtext ; ...strongRef -> strongRef
  const [base, anchor] = ref.split("#");
  const tail = base.slice(base.lastIndexOf(".") + 1);
  return anchor ? `${tail}#${anchor}` : tail;
}

/** A compact, human-readable type label for a property. */
export function typeLabel(prop: LexiconProperty): string {
  const t = prop.type ?? "";
  if (t === "ref") return prop.ref ? refTail(prop.ref) : "ref";
  if (t === "union") {
    const n = prop.refs?.length ?? 0;
    return n ? `union<${prop.refs!.map(refTail).join(" | ")}>` : "union";
  }
  if (t === "array") {
    const items = prop.items;
    if (!items) return "array";
    if (items.type === "ref" && items.ref) return `${refTail(items.ref)}[]`;
    if (items.type === "union") return "union[]";
    return `${items.format ?? items.type}[]`;
  }
  if (t === "blob") return "blob";
  if (prop.format) return prop.format;
  return t;
}

/** All ref targets referenced by a property (for cross-linking). */
export function refsOf(prop: LexiconProperty): string[] {
  const out: string[] = [];
  if (prop.ref) out.push(prop.ref);
  if (prop.refs) out.push(...prop.refs);
  if (prop.items?.ref) out.push(prop.items.ref);
  if (prop.items?.refs) out.push(...prop.items.refs);
  return out;
}

export interface RefLink {
  label: string;
  /** in-registry lexicon id this ref resolves to, or undefined when external */
  targetId?: string;
  anchor?: string;
}

/**
 * Resolve a ref string to an in-registry link when possible. `known` is the set
 * of surfaced lexicon ids (so we only link to pages that exist). `currentId`
 * lets bare `#localDef` refs resolve back into the current lexicon.
 */
export function resolveRef(ref: string, currentId: string, known: Set<string>): RefLink {
  const [base, anchor] = ref.split("#");
  if (ref.startsWith("#")) {
    return { label: ref, targetId: currentId, anchor };
  }
  if (known.has(base)) {
    return { label: refTail(ref), targetId: base, anchor };
  }
  return { label: refTail(ref) };
}

/** A compact constraints label for a property. */
export function constraintsLabel(prop: LexiconProperty): string {
  const parts: string[] = [];
  const maxChars = prop.maxGraphemes ?? prop.maxLength;
  const minChars = prop.minGraphemes ?? prop.minLength;
  if (minChars !== undefined) parts.push(`min ${minChars}`);
  if (maxChars !== undefined) parts.push(`max ${maxChars}`);
  if (prop.minimum !== undefined) parts.push(`≥ ${prop.minimum}`);
  if (prop.maximum !== undefined) parts.push(`≤ ${prop.maximum}`);
  if (prop.maxSize !== undefined) parts.push(`≤ ${formatBytes(prop.maxSize)}`);
  if (prop.accept?.length) parts.push(prop.accept.join(", "));
  if (prop.default !== undefined) parts.push(`default: ${prop.default}`);
  if (prop.const !== undefined) parts.push(`const: ${prop.const}`);
  return parts.join(" · ");
}

/** Enum / knownValues for a property, if any. */
export function valuesOf(prop: LexiconProperty): string[] | undefined {
  return prop.enum ?? prop.knownValues;
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}

/** Build the URL for a lexicon page (optionally to a def anchor). */
export function lexiconHref(id: string, anchor?: string): string {
  return anchor ? `/docs/lexicons/${id}#${anchor}` : `/docs/lexicons/${id}`;
}
