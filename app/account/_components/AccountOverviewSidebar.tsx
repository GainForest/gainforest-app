import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BadgeCheckIcon } from "lucide-react";
import { canEditGroupProfile } from "@/app/(manage)/manage/_lib/cgs-permissions";
import type { CgsRole } from "@/app/(manage)/manage/_lib/cgs";
import { EditableAccountHeader } from "@/app/(manage)/manage/_components/EditableAccountHeader";
import { RichText } from "@/app/_components/RichText";
import { TrustedByBadges } from "@/app/_components/TrustedByBadges";
import { AccountAwards } from "./AccountAwards";
import { AccountMemberships } from "./AccountMemberships";
import { AccountStatList, type AccountStatCounts } from "./AccountStatList";
import { AccountSupportCard } from "./AccountSupportCard";
import type { AccountOrganization } from "./AccountOrganizationsGrid";
import { monogram } from "@/app/_lib/did-profile";
import { fetchAccountMaEarthRounds, fetchProjectImageGalleriesByDid, type ProjectRecord } from "@/app/_lib/indexer";
import { fetchPublicDataCouncilMembers, type PublicDataCouncilMember } from "@/app/_lib/data-council";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { formatCountry } from "@/app/_lib/format";
import { localProjectHref } from "@/app/_lib/urls";
import type { AccountRouteData } from "../_lib/account-route";
import { accountGalleryPath, accountProjectsPath, accountSettingsPath } from "../_lib/account-route";

/** Quiet section wrapper: a small label, then the section's content. */
function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
      {label}
    </Link>
  );
}

/** The account's own words: the short bio, then the long description. */
async function AboutCard({
  account,
  canEditProfile,
  writeRepoDid,
  groupRole,
}: {
  account: AccountRouteData;
  canEditProfile: boolean;
  writeRepoDid?: string;
  groupRole?: CgsRole;
}) {
  const t = await getTranslations("common.accountAbout");
  const bio = account.description?.trim() ?? "";
  const longDescription = account.kind === "organization" ? account.longDescription?.trim() ?? "" : "";
  const richBody = account.kind === "organization" ? null : account.detail?.richBody ?? null;
  const blurb = account.kind === "organization" ? null : account.detail?.blurb?.trim() ?? null;

  // Organizations can edit their long description in place; the shared header
  // editor owns the record write, so the card mounts its "about" variant rather
  // than duplicating the save logic.
  if (account.kind === "organization" && canEditProfile) {
    return (
      <section className="space-y-3">
        {bio ? <p className="text-sm leading-6 text-foreground/80">{bio}</p> : null}
        <EditableAccountHeader
          account={account}
          writeRepoDid={writeRepoDid}
          groupRole={groupRole}
          settingsHref={accountSettingsPath(account.urlIdentifier)}
          viewPublicHref={null}
          variant="about"
        />
      </section>
    );
  }

  if (!bio && !longDescription && !richBody?.length && !blurb) return null;

  return (
    <SidebarSection title={t("title")}>
      {bio ? <p className="text-sm leading-6 text-foreground/80">{bio}</p> : null}
      {longDescription ? (
        <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{longDescription}</p>
      ) : null}
      {richBody?.length ? (
        <div className="text-sm leading-6 text-muted-foreground">
          <RichText blocks={richBody} />
        </div>
      ) : blurb ? (
        <p className="text-sm leading-6 text-muted-foreground">{blurb}</p>
      ) : null}
    </SidebarSection>
  );
}

/** A few of the account's projects, newest first, with a link to the full list. */
async function ProjectsCard({ account, projects }: { account: AccountRouteData; projects: ProjectRecord[] }) {
  const [t, overviewT] = await Promise.all([
    getTranslations("common.accountTabs"),
    getTranslations("common.accountOverview"),
  ]);
  if (projects.length === 0) return null;

  return (
    <SidebarSection
      title={t("projects")}
      action={
        projects.length > 4 ? (
          <SidebarLink href={accountProjectsPath(account.urlIdentifier)} label={overviewT("seeAll")} />
        ) : null
      }
    >
      <ul className="space-y-3">
        {projects.slice(0, 4).map((project) => (
          <li key={project.id}>
            <Link href={localProjectHref(account.urlIdentifier, project.rkey)} className="group flex items-start gap-3">
              <span className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/50">
                {project.imageUrl ? (
                  <Image src={project.imageUrl} alt="" fill unoptimized sizes="44px" className="object-cover" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug text-foreground group-hover:underline">
                  {project.title}
                </span>
                {project.country ? (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {formatCountry(project.country)}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}

/** A peek at the account's photo library, linking to the full gallery. */
async function PhotosCard({ account }: { account: AccountRouteData }) {
  const [t, overviewT, galleries] = await Promise.all([
    getTranslations("common.accountTabs"),
    getTranslations("common.accountOverview"),
    fetchProjectImageGalleriesByDid(account.did).catch(() => []),
  ]);

  const photos = galleries.flatMap((gallery) => gallery.images).filter((image) => Boolean(image.url)).slice(0, 6);
  if (photos.length === 0) return null;

  return (
    <SidebarSection
      title={t("photos")}
      action={<SidebarLink href={accountGalleryPath(account.urlIdentifier)} label={overviewT("seeAll")} />}
    >
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <Link
            key={photo.id}
            href={accountGalleryPath(account.urlIdentifier)}
            className="relative block aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-border/50 transition-opacity hover:opacity-90"
          >
            <Image src={photo.url} alt="" fill unoptimized sizes="96px" className="object-cover" />
          </Link>
        ))}
      </div>
    </SidebarSection>
  );
}

/** The Ma Earth funding rounds this organization took part in. */
async function MaEarthCard({ did }: { did: string }) {
  const [t, rounds] = await Promise.all([
    getTranslations("common.maEarthRounds"),
    fetchAccountMaEarthRounds(did).catch(() => [] as number[]),
  ]);
  if (rounds.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-background ring-1 ring-border/70">
          <Image
            src="/assets/media/images/badges/ma-earth-logo.webp"
            width={28}
            height={28}
            alt=""
            className="size-full object-contain"
          />
        </span>
        <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{t("description")}</p>
      <ul className="flex flex-wrap gap-2">
        {rounds.map((round) => (
          <li
            key={round}
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
          >
            <BadgeCheckIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
            {t("round", { round })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DataCouncilAvatar({ member }: { member: PublicDataCouncilMember }) {
  const mono = monogram(member.displayName?.trim() || "Member", member.did);
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white">
      {member.avatarUrl ? (
        <Image src={member.avatarUrl} alt="" fill className="object-cover" unoptimized />
      ) : (
        <span aria-hidden style={{ backgroundColor: mono.bg }} className="flex size-full items-center justify-center">
          {mono.char}
        </span>
      )}
    </span>
  );
}

/** The people who steward this organization's shared data. */
async function DataCouncilCard({ did }: { did: string }) {
  const [t, members] = await Promise.all([
    getTranslations("common.accountDataCouncil"),
    fetchPublicDataCouncilMembers(did).catch(() => []),
  ]);
  if (members.length === 0) return null;

  return (
    <SidebarSection title={t("title")}>
      <p className="text-sm leading-6 text-muted-foreground">{t("description")}</p>
      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.did} className="flex items-center gap-2.5">
            <DataCouncilAvatar member={member} />
            <span className="min-w-0 truncate text-sm text-foreground">
              {member.displayName?.trim() || t("memberFallback")}
            </span>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}

/**
 * The right-hand column of an account's Overview: how to support it, what it
 * says about itself, its numbers, its projects and photos, and who vouches for
 * it. Each block hides itself when it has nothing to show, so a brand-new
 * profile stays quiet instead of showing a wall of empty cards.
 */
export async function AccountOverviewSidebar({
  account,
  projects,
  counts,
  receivedUsd,
  supporters,
  memberships,
}: {
  account: AccountRouteData;
  projects: ProjectRecord[];
  counts: AccountStatCounts;
  receivedUsd: number;
  supporters: number;
  memberships: AccountOrganization[];
}) {
  const organizationsT = await getTranslations("common.accountOrganizations");

  // Group profile edits are role-gated; personal owners always qualify.
  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  const target = access?.status === "allowed" ? access.target : null;
  const groupRole: CgsRole | undefined = target?.kind === "group"
    ? target.role === "owner" ? "owner" : target.role === "admin" ? "admin" : "member"
    : undefined;
  const canEditProfile = target
    ? target.kind === "group"
      ? canEditGroupProfile({ kind: "group", role: groupRole }).allowed
      : true
    : false;

  return (
    <div data-account-overview-panel className="space-y-7">
      <AccountSupportCard
        did={account.did}
        name={account.displayName}
        image={account.avatarUrl}
        receivedUsd={receivedUsd}
        supporters={supporters}
      />

      <AboutCard
        account={account}
        canEditProfile={canEditProfile}
        writeRepoDid={target?.kind === "group" ? target.did : undefined}
        groupRole={groupRole}
      />

      <AccountStatList did={account.did} identifier={account.urlIdentifier} counts={counts} />

      <ProjectsCard account={account} projects={projects} />

      <PhotosCard account={account} />
      {account.kind === "organization" ? <MaEarthCard did={account.did} /> : null}
      {account.kind === "organization" ? <DataCouncilCard did={account.did} /> : null}

      {/* Recognition rows fetch their own data and render nothing when empty. */}
      <div className="space-y-4">
        <AccountAwards did={account.did} />
        <TrustedByBadges did={account.did} variant="plain" />
        {memberships.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{organizationsT("memberOf")}</h2>
            <AccountMemberships organizations={memberships} hideLabel />
          </div>
        ) : null}
      </div>
    </div>
  );
}
