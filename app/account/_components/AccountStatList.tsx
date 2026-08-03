"use client";

/**
 * A compact account footprint for the Overview rail. Published work, support,
 * and profile details share one responsive grid; audience counts stay beside
 * Follow in the hero, where they describe the account rather than its work.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  AtSignIcon,
  BinocularsIcon,
  CalendarIcon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  Link2Icon,
  PencilIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { SocialGlyph } from "@/app/_components/SocialIcon";
import { formatCompact } from "@/app/_lib/format";
import {
  accountDonationsPath,
  accountObservationsPath,
  accountProjectsPath,
  type AccountRouteData,
} from "../_lib/account-route";
import {
  classifySocialUrl,
  externalHref,
  formatWebsiteLabel,
  heroDateLabel,
  splitAccountLinks,
} from "./AccountProfileHero";
import { AccountSectionHeading } from "./AccountSectionHeading";

export type AccountStatCounts = {
  projects: number;
  observations: number;
  /** Donations made by a person or received by an organization. */
  donations: number;
  /** Distinct people who have financially supported this account. */
  supporters: number;
};

type AccountStatKind = "organization" | "user";
export type AccountStatTileId = "observations" | "projects" | "donations" | "supporters";

type AccountStatTile = {
  id: AccountStatTileId;
  count: number;
  href: string | null;
};

export type AccountOverviewEditActions = {
  onEditBio?: () => void;
  onEditStartDate?: () => void;
  onEditSocials?: () => void;
  onEditVisibility?: () => void;
};

/** In the two-column desktop rail, fill a final first-column orphan. */
export function shouldSpanLastTileOnDesktop(tileCount: number): boolean {
  return tileCount % 2 === 1;
}

/** Published work and personal giving that have useful public destinations. */
export function accountStatTiles(
  identifier: string,
  accountKind: AccountStatKind,
  counts: AccountStatCounts,
): AccountStatTile[] {
  const workTiles: AccountStatTile[] = [
    { id: "observations", count: counts.observations, href: accountObservationsPath(identifier) },
    { id: "projects", count: counts.projects, href: accountProjectsPath(identifier) },
  ];

  // Received donations already have their own support tile. Personal donation
  // history stays useful because it describes what the person has given.
  if (accountKind === "user") {
    workTiles.push({ id: "donations", count: counts.donations, href: accountDonationsPath(identifier) });
  }

  return [...workTiles, { id: "supporters", count: counts.supporters, href: null }];
}

const STAT_ICONS: Record<AccountStatTileId, LucideIcon> = {
  observations: BinocularsIcon,
  projects: FolderKanbanIcon,
  donations: HeartHandshakeIcon,
  supporters: UsersIcon,
};

// Watermarks settle into the clipped bottom-left corner. Their quiet presence
// anchors the tiles without competing with the information in opposing corners.
const WATERMARK_CLASS = "pointer-events-none absolute -bottom-3 -left-3 z-0 size-16 text-primary opacity-10";
const TILE_CLASS = "relative min-h-20 min-w-0 overflow-hidden rounded-2xl bg-muted p-3";
const CONTENT_TILE_CLASS = `${TILE_CLASS} flex flex-col justify-between`;

function TileWatermark({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden className={WATERMARK_CLASS} />;
}

function EditDetailButton({ label, onClick }: { label: string; onClick: () => void }) {
  const overviewT = useTranslations("common.accountOverview");
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-2 top-2 z-20 grid size-6 place-items-center rounded-full text-foreground opacity-55 transition-opacity hover:bg-background hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={overviewT("editDetail", { detail: label })}
    >
      <PencilIcon className="size-3.5" aria-hidden />
    </button>
  );
}

function StatTile({ stat, label }: { stat: AccountStatTile; label: string }) {
  const Icon = STAT_ICONS[stat.id];
  const content = (
    <>
      <TileWatermark icon={Icon} />
      <span className="relative z-10 block text-left text-xs text-muted-foreground">{label}</span>
      <span className="relative z-10 block text-right font-instrument text-2xl font-light italic leading-none tabular-nums text-foreground">
        {formatCompact(stat.count)}
      </span>
    </>
  );

  if (stat.href) {
    return (
      <Link
        href={stat.href}
        data-account-stat-tile={stat.id}
        className={`${CONTENT_TILE_CLASS} transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div data-account-stat-tile={stat.id} className={CONTENT_TILE_CLASS}>
      {content}
    </div>
  );
}

function DetailTile({
  id,
  label,
  value,
  icon,
  href,
  onEdit,
}: {
  id: string;
  label: string;
  value: string;
  icon: LucideIcon;
  href?: string;
  onEdit?: () => void;
}) {
  const overviewT = useTranslations("common.accountOverview");
  const Icon = icon;
  const content = (
    <>
      <span className="relative z-10 block text-left text-xs text-muted-foreground">{label}</span>
      <span className="relative z-10 block truncate text-right text-sm font-medium text-foreground">{value}</span>
    </>
  );

  if (href) {
    return (
      <div data-account-overview-tile={id} className={CONTENT_TILE_CLASS}>
        <TileWatermark icon={Icon} />
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-10 flex min-w-0 flex-col justify-between p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {content}
        </Link>
        {onEdit ? <EditDetailButton label={label} onClick={onEdit} /> : null}
      </div>
    );
  }

  if (onEdit) {
    return (
      <button
        type="button"
        data-account-overview-tile={id}
        onClick={onEdit}
        className={`${CONTENT_TILE_CLASS} transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
        aria-label={overviewT("editDetail", { detail: label })}
      >
        <TileWatermark icon={Icon} />
        {content}
      </button>
    );
  }

  return (
    <div data-account-overview-tile={id} className={CONTENT_TILE_CLASS}>
      <TileWatermark icon={Icon} />
      {content}
    </div>
  );
}

function SocialLinksTile({
  links,
  onEdit,
}: {
  links: string[];
  onEdit?: () => void;
}) {
  const overviewT = useTranslations("common.accountOverview");
  const label = overviewT("socialLinks");

  return (
    <div data-account-overview-tile="social-links" className={TILE_CLASS}>
      <TileWatermark icon={AtSignIcon} />
      {links.length > 0 ? (
        <span className="relative z-10 grid w-fit grid-cols-3 justify-items-start gap-1.5">
          {links.map((url) => {
            const linkLabel = formatWebsiteLabel(url);
            return (
              <Link
                key={url}
                href={externalHref(url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={linkLabel}
                title={linkLabel}
                className="grid size-6 place-items-center rounded-full text-primary opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <SocialGlyph platform={classifySocialUrl(url)} />
              </Link>
            );
          })}
        </span>
      ) : null}
      {onEdit ? <EditDetailButton label={label} onClick={onEdit} /> : null}
    </div>
  );
}

function Bio({
  value,
  editor,
  onEdit,
}: {
  value: string;
  editor?: ReactNode;
  onEdit?: () => void;
}) {
  const overviewT = useTranslations("common.accountOverview");
  if (!value) return null;

  return (
    <div data-account-overview-bio className="relative mt-3 max-w-3xl pr-8 text-base leading-7 text-foreground md:text-lg md:leading-8">
      {editor ?? <p>{value}</p>}
      {onEdit && !editor ? <EditDetailButton label={overviewT("shortDescription")} onClick={onEdit} /> : null}
    </div>
  );
}

export function AccountStatList({
  account,
  counts,
  editActions,
  bioEditor,
  support,
}: {
  account: AccountRouteData;
  counts: AccountStatCounts;
  editActions?: AccountOverviewEditActions;
  /** Rendered only by the owner editor while changing an existing short bio. */
  bioEditor?: ReactNode;
  /** The account's wallet action and contribution summary, grouped with its overview. */
  support?: ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("common.accountTabs");
  const overviewT = useTranslations("common.accountOverview");
  const links = splitAccountLinks(account.website, account.socialLinks);
  const socialLinks = links.socialLinks;
  const isOrganization = account.kind === "organization";
  const date = isOrganization
    ? heroDateLabel(account.foundedDate ?? account.createdAt, locale, true)
    : heroDateLabel(account.createdAt, locale, false);
  const bio = account.description?.trim() ?? "";
  const labels: Record<AccountStatTileId, string> = {
    observations: t("observations"),
    projects: t("projects"),
    donations: isOrganization ? overviewT("donationsReceived") : t("donations"),
    supporters: overviewT("supportersLabel"),
  };
  const showDate = Boolean(date) || Boolean(isOrganization && editActions?.onEditStartDate);
  const showSocialLinks = socialLinks.length > 0 || Boolean(isOrganization && editActions?.onEditSocials);
  const showVisibility = isOrganization && Boolean(editActions?.onEditVisibility);
  const tileCount = accountStatTiles(account.urlIdentifier, account.kind, counts).length
    + Number(showDate)
    + Number(showSocialLinks)
    + Number(showVisibility);

  return (
    <section data-account-stat-tiles>
      <AccountSectionHeading>{overviewT("atAGlance")}</AccountSectionHeading>
      <Bio value={bio} editor={bioEditor} onEdit={editActions?.onEditBio} />
      <nav
        aria-label={overviewT("atAGlance")}
        className={`mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2${shouldSpanLastTileOnDesktop(tileCount) ? " xl:[&>*:last-child]:col-span-2" : ""}`}
      >
        {support}
        {accountStatTiles(account.urlIdentifier, account.kind, counts).map((stat) => (
          <StatTile key={stat.id} stat={stat} label={labels[stat.id]} />
        ))}
        {showDate ? (
          <DetailTile
            id="account-date"
            label={isOrganization ? overviewT("started") : overviewT("joined")}
            value={date ?? overviewT("addStartDate")}
            icon={CalendarIcon}
            onEdit={isOrganization ? editActions?.onEditStartDate : undefined}
          />
        ) : null}
        {showSocialLinks ? <SocialLinksTile links={socialLinks} onEdit={editActions?.onEditSocials} /> : null}
        {showVisibility ? (
          <DetailTile
            id="visibility"
            label={overviewT("visibility")}
            value={account.visibility === "Unlisted" ? overviewT("unlisted") : overviewT("public")}
            icon={Link2Icon}
            onEdit={editActions?.onEditVisibility}
          />
        ) : null}
      </nav>
    </section>
  );
}
