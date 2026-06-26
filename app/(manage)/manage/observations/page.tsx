import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { ObservationsSection } from "../_sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("upload.observations.metadata");
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

export default async function ManageObservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  const params = await searchParams;
  return <ObservationsSection target={target} forProject={firstParam(params.forProject)} />;
}
