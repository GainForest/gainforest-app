/**
 * Live Darwin Core occurrence counter for the /research page.
 *
 * Hits the production Hyperindex GraphQL endpoint and asks for the
 * `totalCount` field on the `appGainforestDwcOccurrence` connection.
 * That collection holds every record published against the
 * `app.gainforest.dwc.occurrence` ATProto lexicon — the open Darwin
 * Core biodiversity-observation format GainForest indexes across
 * partner PDS instances.
 *
 * Schema discovery: introspecting the indexer at hi.gainforest.app
 * shows the connection exposes `edges`, `pageInfo`, and `totalCount`
 * (Relay-cursor style). We only need `totalCount`, so we request
 * `first: 0` to avoid pulling any actual edge rows.
 *
 * Caching: the count moves slowly (hundreds per hour at most) and
 * the /research page is a static editorial surface. A 15-minute
 * revalidate matches the other Hyperindex fetchers (see bumicerts.ts).
 *
 * Fallback: any 5xx / parse error returns the most recent observed
 * value rather than 0 so the KPI never renders as a hard zero. Bump
 * the FALLBACK_TOTAL constant when re-baselining the page.
 */

const INDEXER_URL =
  process.env.NEXT_PUBLIC_INDEXER_URL?.trim() ||
  "https://dev.hi.gainforest.app/graphql";

/** Revalidate the count every 15 minutes; matches bumicerts.ts. */
const REVALIDATE_SECONDS = 60 * 15;

/**
 * Last-known total observed during development, used only when the
 * upstream fetch fails. Update on the next planned baseline so the
 * fallback drifts at roughly the same cadence as reality.
 *
 * Observed 2026-05-22: 417,053 records.
 */
const FALLBACK_TOTAL = 417_053;

type OccurrenceCountResponse = {
  data?: {
    appGainforestDwcOccurrence?: {
      totalCount?: number | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

const OCCURRENCE_COUNT_QUERY = `
  query ResearchOccurrenceTotal {
    appGainforestDwcOccurrence(first: 0) {
      totalCount
    }
  }
`;

export type OccurrenceCount = {
  total: number;
  fromFallback: boolean;
};

export async function fetchOccurrenceCount(): Promise<OccurrenceCount> {
  try {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        operationName: "ResearchOccurrenceTotal",
        query: OCCURRENCE_COUNT_QUERY,
      }),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      throw new Error(`indexer ${res.status}`);
    }
    const json = (await res.json()) as OccurrenceCountResponse;
    const total = json.data?.appGainforestDwcOccurrence?.totalCount;
    if (typeof total !== "number" || total <= 0) {
      throw new Error("indexer returned no totalCount");
    }
    return { total, fromFallback: false };
  } catch (err) {
    console.warn(
      "[research] occurrence totalCount fetch failed, using fallback",
      err,
    );
    return { total: FALLBACK_TOTAL, fromFallback: true };
  }
}
