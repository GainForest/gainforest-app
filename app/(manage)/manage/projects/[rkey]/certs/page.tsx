import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { ProjectCertsSection } from "../../../_sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.manageProjectCerts.metadata");
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

type PageProps = {
  params: Promise<{ rkey: string }>;
};

export default async function ManageProjectCertsPage({ params }: PageProps) {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  const { rkey } = await params;
  if (!rkey) notFound();
  return <ProjectCertsSection target={target} projectRkey={decodeURIComponent(rkey)} />;
}
