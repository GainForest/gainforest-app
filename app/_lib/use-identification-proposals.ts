"use client";

import { useEffect, useState } from "react";
import { fetchComments, type FeedComment } from "@/app/_lib/feed-engagement";
import { parseSpeciesSuggestion } from "@/app/_lib/species-suggestions";
import {
  fetchSpeciesIdentification,
  identificationRkeyFromTags,
} from "@/app/_lib/species-identifications";

/** One identification proposal on an observation, resolved for display. */
export type IdentificationProposal = {
  /** The tagged comment that announced the proposal (author + timestamp). */
  comment: FeedComment;
  scientificName: string;
  vernacularName: string | null;
  taxonRank: string | null;
  confidence: number | null;
  remarks: string | null;
};

/**
 * Resolve the identification proposals on one observation, client-side.
 *
 * Discovery mirrors the observation page's flow: comments on the subject,
 * with the structured `app.gainforest.dwc.identification` record fetched from
 * its author's PDS when the comment carries the identification ref tag. A
 * text-parsed fallback keeps older suggestions visible and survives a
 * temporarily unavailable PDS.
 *
 * Returns null while loading, an array afterwards (empty when there are no
 * proposals).
 */
export function useIdentificationProposals(subjectUri: string): IdentificationProposal[] | null {
  const [items, setItems] = useState<IdentificationProposal[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchComments(subjectUri, controller.signal)
      .then(async (comments) => {
        const resolved = await Promise.all(
          comments.map(async (comment): Promise<IdentificationProposal | null> => {
            const identificationRkey = identificationRkeyFromTags(comment.tags);
            if (identificationRkey) {
              const record = await fetchSpeciesIdentification(
                comment.did,
                identificationRkey,
                controller.signal,
              );
              if (record?.subjectUri === subjectUri) {
                return {
                  comment,
                  scientificName: record.scientificName,
                  vernacularName: record.vernacularName,
                  taxonRank: record.taxonRank,
                  confidence: record.confidence,
                  remarks: record.identificationRemarks,
                };
              }
            }
            // Backward compatibility for suggestions created before the
            // identification lexicon was introduced, and a resilient fallback
            // if the author's PDS is temporarily unavailable.
            const suggestion = parseSpeciesSuggestion(comment.text);
            return suggestion
              ? {
                  comment,
                  scientificName: suggestion.scientificName,
                  vernacularName: suggestion.vernacularName,
                  taxonRank: null,
                  confidence: null,
                  remarks: suggestion.note,
                }
              : null;
          }),
        );
        setItems(resolved.filter((item): item is IdentificationProposal => item !== null));
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setItems([]);
      });
    return () => controller.abort();
  }, [subjectUri]);

  return items;
}
