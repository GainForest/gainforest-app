import type { Metadata } from "next";
import { GracefulNotFound } from "../_components/GracefulNotFound";

export const metadata: Metadata = {
  title: "Profile not found",
  description: "A gentle message for a public profile GainForest cannot find.",
  robots: { index: false, follow: false },
};

export default function AccountNotFound() {
  return (
    <GracefulNotFound
      eyebrow="Profile not found"
      title="We couldn’t find that profile."
      message="Check the profile name, or browse public profiles already listed on GainForest."
      primaryHref="/organizations"
      primaryLabel="Browse organizations"
      secondaryHref="/certs"
      secondaryLabel="Explore Certs"
    />
  );
}
