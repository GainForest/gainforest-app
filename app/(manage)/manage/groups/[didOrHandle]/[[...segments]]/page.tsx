import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveGroupManageTarget } from "@/app/_lib/manage-server";
import {
  AudioSection,
  BumicertsSection,
  ManageHomeSection,
  NewBumicertSection,
  ObservationsSection,
  ProjectsSection,
  SettingsSection,
  SitesSection,
  TreesSection,
} from "../../../_sections";

export const metadata: Metadata = {
  title: "Manage Group — GainForest",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ didOrHandle: string; segments?: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function safeDecode(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

export default async function ManageGroupScopedPage({ params, searchParams }: PageProps) {
  const { didOrHandle, segments = [] } = await params;
  const target = await resolveGroupManageTarget(safeDecode(didOrHandle));
  if (!target) notFound();

  const [first, second, ...rest] = segments;
  if (rest.length > 0) notFound();

  if (!first) return <ManageHomeSection target={target} />;
  if (first === "projects" && !second) return <ProjectsSection target={target} />;
  if (first === "sites" && !second) return <SitesSection target={target} />;
  if (first === "trees" && !second) return <TreesSection target={target} />;
  if (first === "audio" && !second) return <AudioSection target={target} />;
  if (first === "bumicerts" && !second) return <BumicertsSection target={target} />;
  if (first === "bumicerts" && second === "new") return <NewBumicertSection target={target} searchParams={await searchParams} />;
  if (first === "observations" && !second) return <ObservationsSection target={target} />;
  if (first === "settings" && !second) return <SettingsSection target={target} />;

  notFound();
}
