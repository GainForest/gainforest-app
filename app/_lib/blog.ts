export type BlogPost = {
  id: string;
  title: string;
  href: string;
  publishedAt: string;
  summary: string;
};

const SUBSTACK_FEED_URL = "https://gainforest.substack.com/feed";
const REVALIDATE_SECONDS = 60 * 60;

// Fetch the latest GainForest Substack posts server-side and fold them
// into the media carousel. RSS is intentionally parsed at the boundary
// here (rather than in the UI) so the component only receives safe,
// small strings.
export async function fetchSubstackPosts(limit = 3): Promise<BlogPost[]> {
  try {
    const res = await fetch(SUBSTACK_FEED_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { accept: "application/rss+xml, application/xml, text/xml" },
    });
    if (!res.ok) return [];

    const xml = await res.text();
    return parseRssItems(xml).slice(0, limit);
  } catch (err) {
    console.warn("[landing] Substack feed fetch failed", err);
    return [];
  }
}

function parseRssItems(xml: string): BlogPost[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return items
    .map((item) => {
      const title = cleanXmlText(pickTag(item, "title"));
      const href = cleanXmlText(pickTag(item, "link"));
      const publishedAt = cleanXmlText(pickTag(item, "pubDate"));
      const rawSummary = pickTag(item, "description") || pickTag(item, "content:encoded");
      const summary = stripHtml(rawSummary);
      if (!title || !href || !publishedAt) return null;
      return {
        id: href,
        title,
        href,
        publishedAt: new Date(publishedAt).toISOString(),
        summary: summary || "Latest field notes and updates from the GainForest team.",
      } satisfies BlogPost;
    })
    .filter((item): item is BlogPost => item !== null);
}

function pickTag(item: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = item.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match?.[1] ?? "";
}

function stripHtml(value: string): string {
  return cleanXmlText(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function cleanXmlText(value: string): string {
  return decodeXmlEntities(value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/m, "$1"))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}
