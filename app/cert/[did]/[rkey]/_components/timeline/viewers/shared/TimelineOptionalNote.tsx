"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  getTimelineOptionalNoteBlocks,
  type TimelineOptionalNoteBlock,
  type TimelineOptionalNoteSpan,
} from "./optionalNoteModel";

function alignmentClassName(align?: string | null): string | undefined {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return undefined;
}

function Spans({ spans }: { spans: TimelineOptionalNoteSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        let node: ReactNode = span.text;
        if (span.code) {
          node = <code className="rounded bg-foreground/[0.07] px-1 py-0.5 font-mono text-[0.9em]">{node}</code>;
        }
        if (span.bold) node = <strong className="font-semibold text-foreground">{node}</strong>;
        if (span.italic) node = <em>{node}</em>;
        if (span.underline) node = <span className="underline underline-offset-2">{node}</span>;
        if (span.strike) node = <span className="line-through">{node}</span>;
        if (span.href) {
          node = (
            <Link
              href={span.href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
            >
              {node}
            </Link>
          );
        }
        return <span key={`${span.text}-${index}`}>{node}</span>;
      })}
    </>
  );
}

function NoteLink({ block }: { block: Extract<TimelineOptionalNoteBlock, { type: "link" }> }) {
  const t = useTranslations("bumicert.detail.timelineEntry");
  return (
    <Link
      href={block.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground hover:bg-muted/30"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{block.title ?? t("open")}</span>
        {block.description ? (
          <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{block.description}</span>
        ) : null}
      </span>
      <ExternalLinkIcon className="h-4 w-4 shrink-0" />
    </Link>
  );
}

function Block({ block }: { block: TimelineOptionalNoteBlock }) {
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.level, 1), 3);
      const className = level === 1
        ? "text-base font-medium text-foreground"
        : level === 2
          ? "text-sm font-medium text-foreground"
          : "text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground";
      return (
        <p className={cn(className, alignmentClassName(block.align))}>
          <Spans spans={block.spans} />
        </p>
      );
    }
    case "paragraph":
      return (
        <p className={alignmentClassName(block.align)}>
          <Spans spans={block.spans} />
        </p>
      );
    case "blockquote":
      return (
        <blockquote className={cn("border-l-2 border-primary/40 pl-3 italic text-foreground/70", alignmentClassName(block.align))}>
          <Spans spans={block.spans} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-lg border border-border/50 bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground/85">
          <code>{block.text}</code>
        </pre>
      );
    case "list":
      return block.ordered ? (
        <ol className="list-decimal space-y-1 pl-5 marker:text-muted-foreground">
          {block.items.map((item, index) => (
            <li key={index}><Spans spans={item} /></li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
          {block.items.map((item, index) => (
            <li key={index}><Spans spans={item} /></li>
          ))}
        </ul>
      );
    case "image":
      return (
        <figure className="overflow-hidden rounded-xl border border-border/50 bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element -- note images may be from many safe hosts. */}
          <img src={block.src} alt={block.alt ?? ""} className="max-h-[320px] w-full object-contain" loading="lazy" />
          {block.alt ? <figcaption className="px-3 py-2 text-xs text-muted-foreground">{block.alt}</figcaption> : null}
        </figure>
      );
    case "link":
      return <NoteLink block={block} />;
    case "hr":
      return <hr className="border-border/50" />;
    default:
      return null;
  }
}

export function TimelineOptionalNote({ note }: { note: unknown }) {
  const blocks = getTimelineOptionalNoteBlocks(note);
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl bg-muted/20 px-3 py-2 text-sm leading-6 text-foreground/80">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
