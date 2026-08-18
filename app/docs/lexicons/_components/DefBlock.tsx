import Link from "next/link";
import { FieldTable } from "./FieldTable";
import { lexiconHref, resolveRef, viewDef, type LexiconDef } from "../_lib/types";
import type { DocsLabels } from "../_lib/labels";

// Protocol keywords describing a def's shape — kept verbatim across locales.
const KIND_LABEL: Record<string, string> = {
  record: "record",
  object: "object",
  query: "query",
  procedure: "procedure",
  subscription: "subscription",
  token: "token",
  string: "string",
  array: "array",
  union: "union",
  other: "def",
};

export function DefBlock({
  name,
  def,
  lexiconId,
  known,
  labels,
  primary,
}: {
  name: string;
  def: LexiconDef;
  lexiconId: string;
  known: Set<string>;
  labels: DocsLabels;
  /** the primary def is rendered without the #name heading */
  primary?: boolean;
}) {
  const view = viewDef(def);
  const kind = KIND_LABEL[view.kind] ?? view.kind;

  return (
    <div id={name} className="mb-8 scroll-mt-20">
      {!primary && (
        <h4 className="m-0 mb-1 flex items-baseline gap-2 font-mono text-[13px] font-medium text-muted-foreground">
          #{name}
          <span className="text-[11px] text-muted-foreground/60">{kind}</span>
        </h4>
      )}

      {primary && (
        <div className="mb-2 font-mono text-[11px] text-muted-foreground/60">
          {kind}
          {view.key && (
            <span>
              {" · "}
              {labels.key}{" "}
              <span className="text-primary">{view.key}</span>
            </span>
          )}
        </div>
      )}

      {view.description && (
        <p className="mb-3 max-w-[660px] text-[13.5px] text-muted-foreground">{view.description}</p>
      )}

      <FieldTable fields={view.fields} lexiconId={lexiconId} known={known} labels={labels} />

      {view.values && view.values.length > 0 && (
        <div className="mb-2 break-words border-t border-border pt-2.5 font-mono text-[12px] text-muted-foreground">
          <span className="text-muted-foreground/60">{labels.values}: </span>
          {view.values.join("  ·  ")}
        </div>
      )}

      {view.refs && view.refs.length > 0 && (
        <div className="mb-2 border-t border-border pt-2.5 font-mono text-[12px]">
          <span className="text-muted-foreground/60">{labels.members}: </span>
          {view.refs.map((r, i) => {
            const link = resolveRef(r, lexiconId, known);
            return (
              <span key={r}>
                {i > 0 && "  ·  "}
                {link.targetId ? (
                  <Link
                    href={lexiconHref(link.targetId, link.anchor)}
                    className="text-primary no-underline hover:underline"
                  >
                    {link.label}
                  </Link>
                ) : (
                  link.label
                )}
              </span>
            );
          })}
        </div>
      )}

      {view.outputFields && view.outputFields.length > 0 && (
        <div className="mt-2">
          <div className="mb-0.5 font-mono text-[11px] text-muted-foreground/60">{labels.output}</div>
          <FieldTable fields={view.outputFields} lexiconId={lexiconId} known={known} labels={labels} />
        </div>
      )}
    </div>
  );
}
