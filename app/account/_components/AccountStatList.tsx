"use client";

/**
 * The compact account footprint for the Overview rail. One actionable tile —
 * "Support this account" — leads, and everything else reads as a quiet list of
 * key/value facts (published work, giving, profile details) separated by
 * hairlines, so the rail stays scannable without competing with the story in
 * the main column.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { PencilIcon } from "lucide-react";
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

function EditDetailButton({ label, onClick }: { label: string; onClick: () => void }) {
  const overviewT = useTranslations("common.accountOverview");
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded-full text-foreground opacity-55 transition-opacity hover:bg-muted hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={overviewT("editDetail", { detail: label })}
    >
      <PencilIcon className="size-3.5" aria-hidden />
    </button>
  );
}

/** The editable value of a detail row: the value itself, with an edit pencil. */
function EditableValue({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const overviewT = useTranslations("common.accountOverview");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={overviewT("editDetail", { detail: label })}
      className="flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
      <PencilIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/**
 * One row of the key/value list: label on the left, value on the right. When a
 * detail is editable the value wraps in a button that opens its editor.
 */
function StatRow({
  dataId,
  label,
  value,
  href,
  onEdit,
}: {
  dataId: string;
  label: string;
  value: ReactNode;
  href?: string;
  onEdit?: () => void;
}) {
  let valueNode: ReactNode;
  if (onEdit) {
    valueNode = <EditableValue label={label} onClick={onEdit}>{value}</EditableValue>;
  } else if (href) {
    valueNode = (
      <Link href={href} className="text-right text-sm font-medium text-foreground hover:underline">
        {value}
      </Link>
    );
  } else {
    valueNode = <span className="text-right text-sm font-medium text-foreground">{value}</span>;
  }

  return (
    <li data-account-overview-row={dataId} className="flex items-center justify-between gap-3 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {valueNode}
    </li>
  );
}

function SocialLinksRow({
  links,
  onEdit,
}: {
  links: string[];
  onEdit?: () => void;
}) {
  const overviewT = useTranslations("common.accountOverview");
  const value = links.length > 0 ? (
    <span className="inline-flex items-center gap-1.5 pr-1">
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
  ) : (
    <span className="text-sm font-medium text-muted-foreground">{overviewT("addSocialLinks")}</span>
  );

  return <StatRow dataId="social-links" label={overviewT("socialLinks")} value={value} onEdit={onEdit} />;
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
    <div data-account-overview-bio className="relative pr-8 text-base leading-7 text-foreground md:text-lg md:leading-8">
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
  const bio = isOrganization ? account.description?.trim() ?? "" : "";
  const labels: Record<AccountStatTileId, string> = {
    observations: t("observations"),
    projects: t("projects"),
    donations: isOrganization ? overviewT("donationsReceived") : t("donations"),
    supporters: overviewT("supportersLabel"),
  };
  const showDate = Boolean(date) || Boolean(isOrganization && editActions?.onEditStartDate);
  const showSocialLinks = socialLinks.length > 0 || Boolean(isOrganization && editActions?.onEditSocials);
  const showVisibility = isOrganization && Boolean(editActions?.onEditVisibility);

  return (
    <section data-account-stat-tiles>
      <Bio value={bio} editor={bioEditor} onEdit={editActions?.onEditBio} />

      {support ? <div className="mt-4">{support}</div> : null}

      <ul
        data-account-overview-rows
        className="mt-4 divide-y divide-border/60 border-t border-border/60"
      >
        {accountStatTiles(account.urlIdentifier, account.kind, counts).map((stat) => (
          <StatRow
            key={stat.id}
            dataId={stat.id}
            label={labels[stat.id]}
            value={formatCompact(stat.count)}
            href={stat.href ?? undefined}
          />
        ))}
        {showDate ? (
          <StatRow
            dataId="account-date"
            label={isOrganization ? overviewT("started") : overviewT("joined")}
            value={date ?? overviewT("addStartDate")}
            onEdit={isOrganization ? editActions?.onEditStartDate : undefined}
          />
        ) : null}
        {showSocialLinks ? <SocialLinksRow links={socialLinks} onEdit={editActions?.onEditSocials} /> : null}
        {showVisibility ? (
          <StatRow
            dataId="visibility"
            label={overviewT("visibility")}
            value={account.visibility === "Unlisted" ? overviewT("unlisted") : overviewT("public")}
            onEdit={editActions?.onEditVisibility}
          />
        ) : null}
      </ul>
    </section>
  );
}
