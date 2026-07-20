"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MicroscopeIcon, UserIcon } from "lucide-react";
import { fetchComments, type FeedComment } from "@/app/_lib/feed-engagement";
import { formatDate } from "@/app/_lib/format";
import { parseSpeciesSuggestion, type SpeciesSuggestion } from "@/app/_lib/species-suggestions";
import { ResolvedAvatar } from "@/app/feed/ResolvedAvatar";

type SuggestionItem = {
  comment: FeedComment;
  suggestion: SpeciesSuggestion;
};

export function SpeciesSuggestions({ subjectUri }: { subjectUri: string }) {
  const t = useTranslations("marketplace.observationPage.suggestions");
  const [items, setItems] = useState<SuggestionItem[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchComments(subjectUri, controller.signal)
      .then((comments) => {
        setItems(
          comments.flatMap((comment) => {
            const suggestion = parseSpeciesSuggestion(comment.text);
            return suggestion ? [{ comment, suggestion }] : [];
          }),
        );
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setItems([]);
      });
    return () => controller.abort();
  }, [subjectUri]);

  if (!items?.length) return null;

  return (
    <section className="mt-6 rounded-2xl border border-primary/20 bg-primary/[0.05] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <MicroscopeIcon className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {items.map(({ comment, suggestion }) => (
          <li key={comment.uri} className="rounded-xl border border-border-soft bg-background/90 p-4">
            <div className="flex items-start gap-3">
              <ResolvedAvatar
                did={comment.did}
                avatarRef={comment.authorAvatarRef}
                name={comment.authorName}
                fallbackIcon={<UserIcon className="size-3.5" aria-hidden />}
                className="size-8 shrink-0"
                sizes="32px"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-medium text-foreground">
                    {comment.authorName || t("expertFallback")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {comment.createdAt ? formatDate(comment.createdAt) : null}
                  </p>
                </div>
                <p className="mt-2 text-lg font-semibold italic text-foreground">{suggestion.scientificName}</p>
                {suggestion.vernacularName ? (
                  <p className="text-sm text-muted-foreground">{suggestion.vernacularName}</p>
                ) : null}
                {suggestion.note ? (
                  <p className="mt-2 text-sm leading-6 text-foreground/75">{suggestion.note}</p>
                ) : null}
                <span className="mt-3 inline-flex rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
                  {t("status")}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
