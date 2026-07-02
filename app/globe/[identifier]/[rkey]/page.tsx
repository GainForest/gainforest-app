import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchRecordByUri } from "../../../_lib/indexer";
import { localProjectHref } from "../../../_lib/urls";
import { getAccountRouteData, readAccountRouteParams } from "../../../account/_lib/account-route";
import { GlobeExplorer } from "../../_components/GlobeExplorer";

export const revalidate = 300;

type GlobeProjectParams = Promise<{ identifier: string; rkey: string }>;

const PROJECT_COLLECTION = "org.hypercerts.collection";

function asAccountParams(params: GlobeProjectParams): Promise<{ did: string }> {
  return params.then(({ identifier }) => ({ did: identifier }));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function loadProjectGlobeData(params: GlobeProjectParams) {
  const [{ rkey: encodedRkey }, { did, urlIdentifier }] = await Promise.all([
    params,
    readAccountRouteParams(asAccountParams(params)),
  ]);
  const rkey = safeDecode(encodedRkey);
  const project = await fetchRecordByUri(`at://${did}/${PROJECT_COLLECTION}/${rkey}`).catch(() => null);
  if (!project || project.kind !== "project") notFound();

  // A project owns exactly one Cert; the Cert carries the mapped site
  // boundaries (certified-location AT-URIs).
  const certUri = project.bumicertUris[0] ?? null;
  const cert = certUri ? await fetchRecordByUri(certUri).catch(() => null) : null;
  const locationUris = cert && cert.kind === "bumicert" ? cert.locationUris : [];

  return { did, urlIdentifier, rkey, title: project.title, locationUris };
}

export async function generateMetadata({ params }: { params: GlobeProjectParams }): Promise<Metadata> {
  const [data, t] = await Promise.all([
    loadProjectGlobeData(params),
    getTranslations("marketplace.globe.metadata"),
  ]);
  return {
    title: t("projectTitle", { name: data.title }),
    description: t("projectDescription", { name: data.title }),
    alternates: {
      canonical: `/globe/${encodeURIComponent(data.urlIdentifier)}/${encodeURIComponent(data.rkey)}`,
    },
  };
}

export default async function ProjectGlobePage({ params }: { params: GlobeProjectParams }) {
  const data = await loadProjectGlobeData(params);
  const account = await getAccountRouteData(data.did, data.urlIdentifier).catch(() => null);
  const identifier = account?.urlIdentifier ?? data.urlIdentifier;

  return (
    <Suspense fallback={null}>
      <GlobeExplorer
        orgDid={data.did}
        orgName={account?.displayName ?? null}
        orgIdentifier={identifier}
        project={{
          title: data.title,
          href: localProjectHref(identifier, data.rkey),
          locationUris: data.locationUris,
        }}
      />
    </Suspense>
  );
}
