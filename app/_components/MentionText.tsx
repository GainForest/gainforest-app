"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { segmentTextWithMentions, type MentionCandidate } from "@/app/_lib/mentions";
import { accountHref } from "@/app/_lib/urls";

/**
 * Post/comment body text with `@Name` mentions linkified to the tagged
 * account's page. Mentions render as span-links (role="link" + router.push)
 * instead of anchors because several call sites live inside a wrapping
 * `<Link>` (e.g. feed rows), where a nested `<a>` is invalid — the span
 * navigates itself and stops the event so the outer link doesn't fire.
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
          <span
            key={i}
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
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}
