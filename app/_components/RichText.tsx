"use client";

import { useState } from "react";
import Link from "next/link";
import type { RichBlock, RichSpan } from "../_lib/indexer";

// Renders a decoded Leaflet linear document (bumicert descriptions) as elegant,
// readable rich text: headings, styled paragraphs, quotes, lists, code, plus
// embedded images and iframe/video embeds. Inline styling (bold/italic/links)
// comes from richtext facets already resolved into spans by the data layer.

export function RichText({ blocks }: { blocks: RichBlock[] }) {
  if (!blocks?.length) return null;
  return (
    <div className="mt-5 space-y-3.5 text-[14px] leading-[1.62] text-foreground/80">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

function Block({ block: b }: { block: RichBlock }) {
  switch (b.type) {
    case "heading": {
      const lvl = Math.min(Math.max(b.level, 1), 3);
      const cls =
        lvl <= 1
          ? "mt-6 font-garamond text-[20px] font-normal tracking-[-0.01em] text-foreground"
          : lvl === 2
            ? "mt-5 font-garamond text-[17.5px] font-normal text-foreground"
            : "mt-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground/55";
      return (
        <p className={`${cls} leading-[1.25]`}>
          <Spans spans={b.spans} />
        </p>
      );
    }
    case "paragraph":
      return (
        <p>
          <Spans spans={b.spans} />
        </p>
      );
    case "blockquote":
      return (
        <blockquote className="border-l-2 border-primary/40 pl-3.5 text-foreground/70 italic">
          <Spans spans={b.spans} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="thin-scroll overflow-x-auto rounded-lg border border-border-soft bg-surface-sunken px-3.5 py-3 font-mono text-[12.5px] leading-[1.5] text-foreground/85">
          <code>{b.text}</code>
        </pre>
      );
    case "list":
      return b.ordered ? (
        <ol className="list-decimal space-y-1.5 pl-5 marker:text-foreground/40">
          {b.items.map((it, i) => (
            <li key={i}>
              <Spans spans={it} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 marker:text-foreground/40">
          {b.items.map((it, i) => (
            <li key={i}>
              <Spans spans={it} />
            </li>
          ))}
        </ul>
      );
    case "image":
      return <RichImage url={b.url} alt={b.alt ?? ""} aspectRatio={b.aspectRatio ?? null} />;
    case "iframe":
      return <Embed url={b.url} aspectRatio={b.aspectRatio ?? null} height={b.height ?? null} />;
    case "website":
      return <WebsiteCard {...b} />;
    case "button":
      return (
        <Link
          href={b.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
        >
          {b.text}
          <span aria-hidden>↗</span>
        </Link>
      );
    case "hr":
      return <hr className="border-t border-border-soft" />;
    default:
      return null;
  }
}

function Spans({ spans }: { spans: RichSpan[] }) {
  return (
    <>
      {spans.map((s, i) => {
        let node: React.ReactNode = s.text;
        if (s.code)
          node = (
            <code className="rounded bg-foreground/[0.07] px-1 py-0.5 font-mono text-[0.9em]">{node}</code>
          );
        if (s.bold) node = <strong className="font-semibold text-foreground">{node}</strong>;
        if (s.italic) node = <em>{node}</em>;
        if (s.underline) node = <span className="underline underline-offset-2">{node}</span>;
        if (s.strike) node = <span className="line-through">{node}</span>;
        if (s.href)
          node = (
            <Link
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
            >
              {node}
            </Link>
          );
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function RichImage({
  url,
  alt,
  aspectRatio,
}: {
  url: string | null;
  alt: string;
  aspectRatio: { width: number; height: number } | null;
}) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  const ratio = aspectRatio ? `${aspectRatio.width} / ${aspectRatio.height}` : undefined;
  return (
    <figure className="my-4">
      <div
        className="relative overflow-hidden rounded-xl border border-border-soft bg-surface-sunken"
        style={ratio ? { aspectRatio: ratio } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- in-content
            images come from arbitrary PDS hosts; a plain img with lazy loading
            avoids widening next/image's remotePatterns surface. */}
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      </div>
      {alt && <figcaption className="mt-1.5 text-[12px] text-foreground/50">{alt}</figcaption>}
    </figure>
  );
}

/** Normalize common video page URLs to their embeddable form (watch pages
 *  refuse to be framed; YouTube/Vimeo need their /embed/ endpoints). */
function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    /* keep original */
  }
  return url;
}

function Embed({
  url,
  aspectRatio,
  height,
}: {
  url: string;
  aspectRatio: { width: number; height: number } | null;
  height: number | null;
}) {
  const ratio = aspectRatio ? `${aspectRatio.width} / ${aspectRatio.height}` : "16 / 9";
  return (
    <div
      className="my-4 overflow-hidden rounded-xl border border-border-soft bg-black"
      style={height && !aspectRatio ? { height } : { aspectRatio: ratio }}
    >
      <iframe
        src={toEmbedUrl(url)}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full"
      />
    </div>
  );
}

function WebsiteCard({
  src,
  title,
  description,
  image,
}: {
  src: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
}) {
  let host = src;
  try {
    host = new URL(src).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw */
  }
  return (
    <Link
      href={src}
      target="_blank"
      rel="noreferrer"
      className="my-4 flex gap-3 overflow-hidden rounded-xl border border-border-soft bg-surface transition-colors hover:border-primary/40"
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- preview blobs vary by host
        <img src={image} alt="" loading="lazy" className="h-[88px] w-[88px] shrink-0 object-cover" />
      )}
      <div className="min-w-0 flex-1 py-2.5 pr-3">
        {title && <div className="truncate text-[13.5px] font-medium text-foreground">{title}</div>}
        {description && (
          <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-[1.4] text-foreground/60">
            {description}
          </div>
        )}
        <div className="mt-1 truncate text-[11px] text-foreground/40">{host}</div>
      </div>
    </Link>
  );
}
