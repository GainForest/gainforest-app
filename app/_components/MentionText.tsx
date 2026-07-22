"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { segmentTextWithLinks, segmentTextWithMentions, type MentionCandidate } from "@/app/_lib/mentions";
import { accountHref } from "@/app/_lib/urls";
import { AccountHoverCard } from "./AccountHoverCard";

/**
 * Post/comment body text with `@Name` mentions linkified to the tagged
 * account's page, and plain URLs (https://…, gainforest.app, example.com/x)
 * made clickable, opening in a new tab. Hovering a mention opens the same rich
 * account preview card used on feed author chips. Both render as span-links
 * (role="link") instead of anchors because several call sites live inside a
 * wrapping `<Link>` (e.g. feed rows), where a nested `<a>` is invalid — the
 * span navigates itself and stops the event so the outer link doesn't fire.
 */
export function MentionText({
  text,
  mentions,
}: {
  text: string;
  mentions: MentionCandidate[] | null | undefined;
}) {
  const router = useRouter();
  const segments = useMemo(() => segmentTextWithMentions(text, mentions), [text, mentions]);

  return (
    <>
      {segments.map((segment, i) =>
        segment.did ? (
          <AccountHoverCard
            key={i}
            did={segment.did}
            name={segment.text.replace(/^@/, "")}
          >
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(accountHref(segment.did as string));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(accountHref(segment.did as string));
                }
              }}
              className="cursor-pointer font-medium text-primary hover:underline"
            >
              {segment.text}
            </span>
          </AccountHoverCard>
        ) : (
          <LinkifiedText key={i} text={segment.text} />
        ),
      )}
    </>
  );
}

/** Plain text with detected URLs rendered as clickable span-links that open
 *  the destination in a new tab (stopping the wrapping row link). */
function LinkifiedText({ text }: { text: string }) {
  const parts = useMemo(() => segmentTextWithLinks(text), [text]);
  const open = (href: string) => {
    window.open(href, "_blank", "noopener,noreferrer");
  };
  return (
    <>
      {parts.map((part, i) =>
        part.href ? (
          <span
            key={i}
            role="link"
            tabIndex={0}
            title={part.href}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              open(part.href as string);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                open(part.href as string);
              }
            }}
            className="cursor-pointer break-all font-medium text-primary hover:underline"
          >
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
