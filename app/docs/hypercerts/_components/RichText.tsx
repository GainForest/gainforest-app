// Translated copy on this page carries inline code spans written with
// backticks (`org.hypercerts.collection`), because field and record names are
// identical in every locale and translators should not have to touch markup.
// This renders those spans as real <code> elements.

import { Fragment } from "react";
import { cn } from "@/lib/utils";

export function RichText({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{renderInlineCode(text)}</span>;
}

export function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn("m-0 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground", className)}>
      {renderInlineCode(text)}
    </p>
  );
}

export function renderInlineCode(text: string): React.ReactNode[] {
  // Odd indexes are the contents of a matched backtick pair.
  return text.split("`").map((part, index) =>
    index % 2 === 1 ? (
      <code
        key={index}
        className="rounded bg-muted px-1 py-0.5 font-mono text-[0.86em] text-foreground/85 [overflow-wrap:anywhere]"
      >
        {part}
      </code>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
