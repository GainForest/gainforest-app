import type { Metadata } from "next";
import { SignInPrompt } from "../_components/AuthFlow";
import { fetchAuthSession } from "../_lib/auth-server";

export const metadata: Metadata = {
  title: "Manage — GainForest",
  robots: { index: false, follow: false },
};

/**
 * (MANAGE) layout
 *
 * Mirrors the GainForest app's former upload route group, but this app exposes
 * those routes under /manage instead of /upload. For now these are placeholders
 * while the upload/manage workflows are ported.
 */
export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const session = await fetchAuthSession();

  if (!session.isLoggedIn) {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-sm items-center px-3 py-12">
        <SignInPrompt />
      </section>
    );
  }

  return children;
}
