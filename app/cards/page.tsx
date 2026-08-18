import { redirect } from "next/navigation";

/**
 * Legacy alias for the Bumicerts collection. The route moved to /bumicerts to
 * match the "My Bumicerts" naming used across the app; this stub keeps old
 * links (and the receipt query from checkout) working without a regression.
 */
export default async function LegacyCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (typeof value === "string") {
      query.append(key, value);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/bumicerts${suffix}`);
}
