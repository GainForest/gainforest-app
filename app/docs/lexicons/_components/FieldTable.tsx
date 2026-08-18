import Link from "next/link";
import {
  constraintsLabel,
  lexiconHref,
  refsOf,
  resolveRef,
  typeLabel,
  valuesOf,
  type FlatField,
} from "../_lib/types";
import type { DocsLabels } from "../_lib/labels";

export function FieldTable({
  fields,
  lexiconId,
  known,
  labels,
}: {
  fields: FlatField[];
  /** id of the lexicon these fields belong to (resolves local `#` refs) */
  lexiconId: string;
  /** surfaced lexicon ids, so only resolvable refs become links */
  known: Set<string>;
  labels: DocsLabels;
}) {
  if (!fields.length) return null;
  return (
    <div className="mb-7 border-t border-border text-[13px]">
      {fields.map((prop) => {
        const constraints = constraintsLabel(prop);
        const values = valuesOf(prop);
        const refs = refsOf(prop).map((r) => resolveRef(r, lexiconId, known));
        return (
          <div
            key={prop.name}
            className="flex flex-col gap-0.5 border-b border-border/60 py-2.5 sm:flex-row sm:items-start sm:gap-3"
          >
            <div className="shrink-0 font-mono text-[12.5px] text-primary [overflow-wrap:anywhere] sm:basis-[200px]">
              {prop.name}
              {prop.required && (
                <span className="ml-1 text-destructive" title={labels.required} aria-label={labels.required}>
                  *
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 text-muted-foreground">
              {prop.description ?? ""}

              <div className="mt-1 font-mono text-[10.5px] text-muted-foreground/60 [overflow-wrap:anywhere]">
                {typeLabel(prop)}
                {constraints && <span>{` · ${constraints}`}</span>}
                {refs
                  .filter((r) => r.targetId)
                  .map((r, i) => (
                    <span key={i}>
                      {" · "}
                      <Link
                        href={lexiconHref(r.targetId!, r.anchor)}
                        className="text-primary no-underline hover:underline"
                      >
                        {r.label}
                      </Link>
                    </span>
                  ))}
              </div>

              {values && (
                <div className="mt-1 font-mono text-[10.5px] text-muted-foreground/60 [overflow-wrap:anywhere]">
                  <strong className="font-semibold">{`${labels.values}: `}</strong>
                  {values.join(", ")}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
