import Link from "next/link";
import type { ReactNode } from "react";

function documentationHref(href: string): string {
  const schemaPrefix = "../app/docs/lexicons/_schemas/";
  if (href.startsWith(schemaPrefix) && href.endsWith(".json")) {
    const nsid = href.slice(schemaPrefix.length, -".json".length).replaceAll("/", ".");
    return `/docs/lexicons/${encodeURIComponent(nsid)}`;
  }
  return href;
}

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={`${match.index}-code`} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={`${match.index}-strong`} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        nodes.push(
          <Link key={`${match.index}-link`} href={documentationHref(link[2]!)} className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
            {link[1]}
          </Link>,
        );
      }
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function isTableDivider(line: string | undefined): boolean {
  return Boolean(line && /^\|(?:\s*:?-+:?\s*\|)+$/.test(line));
}

function tableCells(line: string): string[] {
  return line.slice(1, -1).split("|").map((cell) => cell.trim());
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return (
    line.trim() === "" ||
    /^#{1,4}\s/.test(line) ||
    line.startsWith("```") ||
    /^-\s/.test(line) ||
    /^\d+\.\s/.test(line) ||
    (line.startsWith("|") && isTableDivider(lines[index + 1]))
  );
}

/**
 * Small, dependency-free Markdown renderer for trusted repository documentation.
 * It intentionally supports only the constructs used by the schema usage guides.
 */
export function MarkdownDocument({ source }: { source: string }) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1]!.length;
      const content = inline(heading[2]!);
      if (level === 1) {
        blocks.push(<h1 key={`h-${index}`} className="mb-4 mt-0 font-serif text-3xl font-semibold tracking-tight text-foreground">{content}</h1>);
      } else if (level === 2) {
        blocks.push(<h2 key={`h-${index}`} className="mb-3 mt-10 border-t border-border/60 pt-7 font-serif text-xl font-semibold tracking-tight text-foreground first:mt-0 first:border-0 first:pt-0">{content}</h2>);
      } else {
        blocks.push(<h3 key={`h-${index}`} className="mb-2 mt-7 font-serif text-base font-semibold text-foreground">{content}</h3>);
      }
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]!.startsWith("```")) {
        code.push(lines[index]!);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre key={`code-${index}`} className="my-4 overflow-x-auto rounded-xl border border-border/60 bg-muted/50 p-4 font-mono text-[12px] leading-relaxed text-foreground">
          <code data-language={language || undefined}>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (line.startsWith("|") && isTableDivider(lines[index + 1])) {
      const header = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]!.startsWith("|")) {
        rows.push(tableCells(lines[index]!));
        index += 1;
      }
      blocks.push(
        <div key={`table-${index}`} className="my-5 overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full min-w-[620px] border-collapse text-left text-[13px]">
            <thead className="bg-muted/60">
              <tr>{header.map((cell, cellIndex) => <th key={cellIndex} className="border-b border-border px-3 py-2 font-semibold text-foreground">{inline(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/50 last:border-0">
                  {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top leading-relaxed text-muted-foreground">{inline(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^-\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^-\s/.test(lines[index]!)) {
        items.push(lines[index]!.replace(/^-\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`} className="my-3 list-disc space-y-1.5 pl-6 text-[14px] leading-relaxed text-muted-foreground">
          {items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index]!)) {
        items.push(lines[index]!.replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${index}`} className="my-3 list-decimal space-y-1.5 pl-6 text-[14px] leading-relaxed text-muted-foreground">
          {items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}
        </ol>,
      );
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraph.push(lines[index]!.trim());
      index += 1;
    }
    blocks.push(
      <p key={`p-${index}`} className="my-3 max-w-[760px] text-[14px] leading-7 text-muted-foreground">
        {inline(paragraph.join(" "))}
      </p>,
    );
  }

  return <article>{blocks}</article>;
}
