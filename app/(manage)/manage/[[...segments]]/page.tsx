import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { accountManageBasePath } from "@/lib/links";
import { SignInPrompt } from "@/app/_components/AuthFlow";

export const metadata: Metadata = {
  title: "Manage — GainForest",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * Compatibility shim for the retired /manage routes. Management now lives under
 * each account's profile at /account/<identifier>/manage. This forwards:
 *   /manage[/section]            → /account/<you>/manage[/section]
 *   /manage/groups/<org>[/...]   → /account/<org>/manage[/...]
 *   /manage/groups               → /account/<you>/manage/organizations
 * preserving the query string. Inbound links, bookmarks, and the welcome email
 * keep working without exposing the legacy URL shape.
 */
export default async function LegacyManageRedirect({ params, searchParams }: PageProps) {
  const [{ segments = [] }, sp] = await Promise.all([params, searchParams]);

  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-sm items-center px-3 py-12">
        <SignInPrompt />
      </section>
    );
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw === "string" && raw.length > 0) query.set(key, raw);
  }
  const queryString = query.toString();
  const withQuery = (path: string) => (queryString ? `${path}?${queryString}` : path);

  const personal = await resolvePersonalManageTarget();
  const meIdentifier = personal?.identifier ?? session.did;

  let destinationBase: string;
  let restSegments: string[];

  if (segments[0] === "groups") {
    const orgIdentifier = segments[1];
    if (!orgIdentifier) {
      redirect(withQuery(`${accountManageBasePath(meIdentifier)}/organizations`));
    }
    destinationBase = accountManageBasePath(orgIdentifier);
    restSegments = segments.slice(2);
  } else {
    destinationBase = accountManageBasePath(meIdentifier);
    restSegments = segments;
  }

  const path = restSegments.length
    ? `${destinationBase}/${restSegments.map((segment) => encodeURIComponent(segment)).join("/")}`
    : destinationBase;

  redirect(withQuery(path));
}
