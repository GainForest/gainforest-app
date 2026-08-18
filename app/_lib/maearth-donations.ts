import "server-only";
import { maEarthDonationUrlForDid } from "./maearth-donation-data";

/** The organization's live donation (campaign) page on maearth.com, or null
 *  when Ma Earth has no fundraising campaign for it. */
export function maEarthDonationUrl(did: string): string | null {
  return maEarthDonationUrlForDid(did);
}

export type MaEarthDonationSummary = {
  /** Total donated so far, in USD. */
  totalUsd: number;
  donorCount: number;
};

const SUMMARY_REVALIDATE_SECONDS = 1800;

/** Live donation totals for a maearth.com campaign page.
 *
 *  Ma Earth has no public JSON API, but every campaign page server-renders a
 *  `donationSummary` object (amounts in US cents) into its payload — the same
 *  numbers the page's own donation widget shows. We fetch the page (cached via
 *  Next's data cache) and extract that object. Returns null when the page or
 *  the summary can't be read, so callers can render the donate link without
 *  totals rather than fail.
 */
export async function fetchMaEarthDonationSummary(
  donateUrl: string,
  signal?: AbortSignal,
): Promise<MaEarthDonationSummary | null> {
  try {
    const res = await fetch(donateUrl, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; bhumi-stats)" },
      next: { revalidate: SUMMARY_REVALIDATE_SECONDS },
      signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    // The flight payload escapes quotes (`donationSummary\":{\"totalAmount\":…`);
    // tolerate both escaped and plain JSON just in case the encoding changes.
    const match = html.match(
      /donationSummary\\?":\{\\?"totalAmount\\?":(\d+),\\?"donorCount\\?":(\d+)/,
    );
    if (!match) return null;
    const totalCents = Number(match[1]);
    const donorCount = Number(match[2]);
    if (!Number.isFinite(totalCents) || !Number.isFinite(donorCount)) return null;
    return { totalUsd: totalCents / 100, donorCount };
  } catch {
    return null;
  }
}
