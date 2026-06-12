import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveGroupManageAccess } from "@/app/_lib/manage-server";
import Container from "@/components/ui/container";
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
  title: "Manage Organization — GainForest",
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

function GroupNotMemberMessage({
  group,
}: {
  group: { displayName: string; handle: string | null; identifier: string };
}) {
  const name = group.displayName?.trim() || group.handle || group.identifier;

  return (
    <Container className="flex min-h-[50vh] items-center justify-center py-12">
      <section className="max-w-xl rounded-3xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Organization access</p>
        <h1 className="mt-3 font-instrument text-3xl font-light italic tracking-[-0.02em] text-foreground">
          You’re not a member of {name}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This manage page is only available to members of the organization. Ask an owner or admin to add you, or switch to another organization you belong to.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/manage/organizations" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            View my organizations
          </Link>
          <Link href="/manage" className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60">
            Back to manage home
          </Link>
        </div>
      </section>
    </Container>
  );
}

export default async function ManageGroupScopedPage({ params, searchParams }: PageProps) {
  const { didOrHandle, segments = [] } = await params;
  const access = await resolveGroupManageAccess(safeDecode(didOrHandle));
  if (access.status === "not-member") return <GroupNotMemberMessage group={access.group} />;
  if (access.status !== "allowed") notFound();
  const target = access.target;

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
