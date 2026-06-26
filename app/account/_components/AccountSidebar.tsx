import Link from "next/link";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  AwardIcon,
  BadgeCheckIcon,
  HandHeartIcon,
  LeafIcon,
  SproutIcon,
} from "lucide-react";
import BumicertIcon from "@/icons/BumicertIcon";
import { cn } from "@/lib/utils";
import { formatCompact, formatNumber } from "../../_lib/format";
import type { AccountRouteData } from "../_lib/account-route";
import { accountBumicertsPath, accountPath } from "../_lib/account-route";
import { ShareProfileButton } from "./ShareProfileButton";

type AccountContentColumnsProps = {
  children: ReactNode;
  sidebar: ReactNode;
};

type SidebarStat = {
  label: string;
  value: string;
  icon: "bumicert" | "donation";
};

type Achievement = {
  label: string;
  description: string;
  icon: "profile" | "bumicert" | "donation";
};

type SidebarData = {
  accountKind: "user" | "organization";
  displayName: string;
  achievementsHref: string;
  stats: SidebarStat[];
  achievements: Achievement[];
};

type ShareCardData = {
  title: string;
  description: string;
  profilePath: string;
  buttonLabel: string;
  copiedLabel: string;
};

type AchievementIconName = Achievement["icon"];

const achievementIcons: Record<AchievementIconName, typeof BadgeCheckIcon> = {
  profile: BadgeCheckIcon,
  bumicert: SproutIcon,
  donation: HandHeartIcon,
};

export function AccountContentColumns({
  children,
  sidebar,
}: AccountContentColumnsProps) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">{children}</div>
      <aside className="py-6 lg:sticky lg:top-4 lg:w-80 lg:shrink-0 lg:self-start xl:w-[22rem]">
        {sidebar}
      </aside>
    </div>
  );
}

function SidebarCard({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

function StatIcon({ stat }: { stat: SidebarStat }) {
  const className = "size-4 text-primary";

  if (stat.icon === "bumicert") {
    return <BumicertIcon className={className} />;
  }

  return <HandHeartIcon className={className} />;
}

function StatsCard({ stats }: { stats: SidebarStat[] }) {
  return (
    <SidebarCard className="overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-border/70">
        {stats.map((stat) => (
          <div key={stat.label} className="p-4 sm:p-5">
            <div className="mb-3 flex size-8 items-center justify-center rounded-2xl border border-primary/15 bg-primary/[0.08] shadow-inner sm:size-9">
              <StatIcon stat={stat} />
            </div>
            <p className="text-xs font-medium text-foreground sm:text-sm">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </SidebarCard>
  );
}

function AchievementsCard({
  achievements,
  achievementsHref,
}: {
  achievements: Achievement[];
  achievementsHref: string;
}) {
  return (
    <SidebarCard id="account-achievements" className="p-5">
      <div className="mb-5 flex items-center gap-3">
        <AwardIcon className="size-5 text-foreground/70" />
        <h2 className="text-lg font-semibold text-foreground">Achievements</h2>
      </div>

      <div className="space-y-4">
        {achievements.map((achievement) => {
          const Icon = achievementIcons[achievement.icon];

          return (
            <div key={achievement.label} className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/10 bg-primary/10 shadow-inner">
                <Icon className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {achievement.label}
                </p>
                <p className="text-sm leading-snug text-muted-foreground">
                  {achievement.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href={achievementsHref}
        className="mt-6 block text-center text-sm font-medium text-primary transition-colors hover:text-primary/80"
      >
        View all achievements
      </Link>
    </SidebarCard>
  );
}

function DecorativeLeafCluster() {
  const leafClass = "absolute rounded-full bg-primary/[0.12] shadow-sm";

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-40 overflow-hidden" aria-hidden="true">
      <div className="absolute -right-10 bottom-0 size-40 rounded-full bg-primary/[0.08] blur-2xl" />
      <div className="absolute bottom-0 right-12 h-32 w-px -rotate-12 bg-primary/20" />
      <span className={cn(leafClass, "bottom-16 right-12 h-12 w-6 -rotate-45")} />
      <span className={cn(leafClass, "bottom-10 right-4 h-16 w-7 rotate-12")} />
      <span className={cn(leafClass, "bottom-24 right-2 h-11 w-5 rotate-45")} />
      <span className={cn(leafClass, "bottom-2 right-24 h-10 w-5 -rotate-12")} />
    </div>
  );
}

function ShareCard({ data }: { data: ShareCardData }) {
  return (
    <SidebarCard className="relative overflow-hidden p-5">
      <DecorativeLeafCluster />
      <div className="relative z-10 max-w-[13rem] space-y-5">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <LeafIcon className="size-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              {data.title}
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {data.description}
          </p>
        </div>

        <ShareProfileButton
          profilePath={data.profilePath}
          label={data.buttonLabel}
          copiedLabel={data.copiedLabel}
        />
      </div>
    </SidebarCard>
  );
}

function buildSidebarData(account: AccountRouteData, bumicertCount: number, donationCount: number): SidebarData {
  const displayName = account.displayName;
  return {
    accountKind: account.kind,
    displayName,
    achievementsHref: `${accountBumicertsPath(account.urlIdentifier)}#account-achievements`,
    stats: [
      {
        label: "Total Certs",
        value: formatCompact(bumicertCount),
        icon: "bumicert",
      },
      {
        label: account.kind === "organization" ? "Donations received" : "Donations",
        value: formatCompact(donationCount),
        icon: "donation",
      },
    ],
    achievements: [
      {
        label: "Profile Ready",
        description: account.description ? "Completed public profile details" : "Set up public profile",
        icon: "profile",
      },
      {
        label: account.kind === "organization" ? "Cert Steward" : "Creator Seed",
        description: bumicertCount > 0 ? `Published ${formatNumber(bumicertCount)} Certs` : "No Certs published",
        icon: "bumicert",
      },
      {
        label: account.kind === "organization" ? "Community Backed" : "Impact Supporter",
        description: donationCount > 0 ? `${formatNumber(donationCount)} public donations` : "No public donations yet",
        icon: "donation",
      },
    ],
  };
}

export async function AccountSidebar({ account, bumicertCount, donationCount }: { account: AccountRouteData; bumicertCount: number; donationCount: number }) {
  const data = buildSidebarData(account, bumicertCount, donationCount);
  const [t, locale] = await Promise.all([
    getTranslations("marketplace.account.sidebar"),
    getLocale(),
  ]);
  const isOrganization = account.kind === "organization";
  const shareData: ShareCardData = {
    title: isOrganization ? t("shareProfileTitleOrganization") : t("shareProfileTitle"),
    description: isOrganization ? t("shareProfileBodyOrganization") : t("shareProfileBody"),
    profilePath: `/${locale}${accountPath(account.urlIdentifier)}`,
    buttonLabel: t("copyProfileLink"),
    copiedLabel: t("profileLinkCopied"),
  };
  return (
    <div className="space-y-5">
      <StatsCard stats={data.stats} />
      <AchievementsCard
        achievements={data.achievements}
        achievementsHref={data.achievementsHref}
      />
      <ShareCard data={shareData} />
    </div>
  );
}
