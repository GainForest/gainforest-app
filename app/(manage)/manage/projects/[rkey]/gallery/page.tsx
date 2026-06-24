import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { ProjectGallerySection } from "../../../_sections";

export const metadata: Metadata = {
  title: "Manage Project Gallery — GainForest",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ rkey: string }>;
};

export default async function ManageProjectGalleryPage({ params }: PageProps) {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  const { rkey } = await params;
  if (!rkey) notFound();
  return <ProjectGallerySection target={target} projectRkey={decodeURIComponent(rkey)} />;
}
