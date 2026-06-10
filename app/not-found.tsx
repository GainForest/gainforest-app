import type { Metadata } from "next";
import { GracefulNotFound } from "./_components/GracefulNotFound";

export const metadata: Metadata = {
  title: "Page not found",
  description: "A gentle message for a GainForest page that cannot be found.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <GracefulNotFound
      eyebrow="Page not found"
      title="We couldn’t find that page."
      message="The link may be old, or the page may have moved."
      primaryHref="/bumicerts"
      primaryLabel="Explore Bumicerts"
      secondaryHref="/"
      secondaryLabel="Return home"
    />
  );
}
