import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsExploreClient } from "./ProjectsExploreClient";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Explore Projects — Verified Regenerative Impact Work",
  description:
    "Browse project collections from communities and organizations, each grouping the Certs that document their regenerative impact.",
  alternates: { canonical: "/projects" },
};

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsExploreClient />
    </Suspense>
  );
}
