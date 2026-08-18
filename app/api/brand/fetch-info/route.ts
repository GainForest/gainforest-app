/**
 * POST /api/brand/fetch-info
 *
 * Fetches brand information from the BrandFetch API for the account setup flow.
 * Mirrors the response shape consumed by the onboarding "Prefill" button.
 *
 * Usage:
 *   POST /api/brand/fetch-info
 *   Body: { domain: "example.com" }
 *
 * Requires the BRANDFETCH_API_KEY environment variable. When it is not set the
 * endpoint responds with `{ found: false }` so the UI degrades gracefully.
 */
import type { NextRequest } from "next/server";

type BrandFetchLogoFormat = {
  src?: string;
  format?: string;
};

type BrandFetchLogo = {
  type?: string;
  formats?: BrandFetchLogoFormat[];
};

type BrandFetchResponse = {
  name?: string;
  domain?: string;
  description?: string;
  longDescription?: string;
  logos?: BrandFetchLogo[];
  company?: {
    foundedYear?: number;
    location?: {
      country?: string;
      countryCode?: string;
    };
  };
};

function normalizeDomain(value: string): string {
  try {
    const url = value.startsWith("http") ? value : `https://${value}`;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^www\./, "");
  }
}

function trimDescription(text: string | undefined, maxLength = 1000): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const substring = trimmed.substring(0, maxLength);
  const lastSentenceEnd = substring.lastIndexOf(". ");
  if (lastSentenceEnd > 0) return trimmed.substring(0, lastSentenceEnd + 1);
  return trimmed.substring(0, maxLength);
}

function findBestLogo(logos?: BrandFetchLogo[]): string | undefined {
  if (!logos || logos.length === 0) return undefined;

  const typeOrder = ["icon", "logo", "symbol"];
  const sorted = [...logos].sort((a, b) => {
    const aIndex = typeOrder.indexOf(a.type ?? "");
    const bIndex = typeOrder.indexOf(b.type ?? "");
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  for (const logo of sorted) {
    if (!logo.formats || logo.formats.length === 0) continue;
    const png = logo.formats.find((f) => f.format === "png");
    const svg = logo.formats.find((f) => f.format === "svg");
    const selected = png ?? svg ?? logo.formats[0];
    if (selected?.src) return selected.src;
  }

  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { domain?: unknown } | null;
    const rawDomain = typeof body?.domain === "string" ? body.domain.trim() : "";
    if (!rawDomain) {
      return Response.json({ error: "BadRequest", message: "Invalid request body" }, { status: 400 });
    }

    const domain = normalizeDomain(rawDomain);

    const apiKey = process.env.BRANDFETCH_API_KEY;
    if (!apiKey) {
      console.warn("BRANDFETCH_API_KEY not configured");
      return Response.json({ found: false }, { status: 200 });
    }

    const response = await fetch(`https://api.brandfetch.io/v2/brands/${domain}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      if (response.status !== 404) {
        console.error("BrandFetch API error:", response.status);
      }
      return Response.json({ found: false }, { status: 200 });
    }

    const brandData = (await response.json()) as BrandFetchResponse;
    const logoUrl = findBestLogo(brandData.logos);
    const description = trimDescription(brandData.longDescription || brandData.description, 1000);

    return Response.json({
      found: true,
      name: brandData.name,
      description,
      logoUrl,
      domain: brandData.domain || domain,
      countryCode: brandData.company?.location?.countryCode,
      country: brandData.company?.location?.country,
      foundedYear: brandData.company?.foundedYear,
    });
  } catch (err) {
    console.error("Error fetching brand info:", err);
    return Response.json(
      {
        error: "InternalServerError",
        message: "Unable to fetch website information right now. Please try again.",
      },
      { status: 500 },
    );
  }
}
