"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, ArrowUpRightIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { useAccountList } from "@/app/_lib/account-switcher";
import type { CgsGroupMembership } from "../../_lib/cgs";

function roleBadge(role: string) {
  return role === "owner"
    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
    : role === "admin"
      ? "bg-primary/10 text-primary"
      : "bg-muted text-muted-foreground";
}

function groupName(group: CgsGroupMembership, fallback: string): string {
  return group.displayName?.trim() || fallback;
}

function groupDescription(group: CgsGroupMembership, fallback: string): string {
  return group.description?.trim() || fallback;
}

function groupHref(group: CgsGroupMembership): string {
  return `/manage/groups/${encodeURIComponent(group.handle?.trim() || group.groupDid)}`;
}

function groupInitial(group: CgsGroupMembership, fallback: string): string {
  return groupName(group, fallback).charAt(0).toUpperCase();
}

const EMPTY_COVER =
  "radial-gradient(circle at 20% 30%, oklch(0.5 0.07 157 / 0.20) 0%, transparent 55%), radial-gradient(circle at 85% 20%, oklch(0.5 0.07 157 / 0.12) 0%, transparent 50%)";

function OrgCard({ group }: { group: CgsGroupMembership }) {
  const t = useTranslations("upload.dashboardClient.organizations");
  const fallbackName = t("fallbackName");
  const name = groupName(group, fallbackName);
  const roleLabel = group.role === "owner"
    ? t("roles.owner")
    : group.role === "admin"
      ? t("roles.admin")
      : group.role === "member"
        ? t("roles.member")
        : group.role;

  return (
    <Link
      href={groupHref(group)}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_44px_-18px_oklch(0_0_0/0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="relative h-20 overflow-hidden">
        {group.avatarUrl ? (
          <Image
            src={group.avatarUrl}
            alt=""
            fill
            unoptimized
            className="scale-110 object-cover blur-xl saturate-150"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" style={{ backgroundImage: EMPTY_COVER }} />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-card via-card/40 to-transparent" />
        <span
          className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium capitalize shadow-sm backdrop-blur-sm ${roleBadge(group.role)}`}
        >
          {roleLabel}
        </span>
      </div>

      <div className="relative flex flex-1 flex-col px-5 pb-5">
        <div className="relative -mt-9 mb-3 flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xl font-semibold text-muted-foreground ring-4 ring-card">
          {group.avatarUrl ? (
            <Image src={group.avatarUrl} alt={name} fill className="object-cover" unoptimized />
          ) : (
            groupInitial(group, fallbackName)
          )}
        </div>

        <div className="min-w-0">
          <p className="truncate text-base font-medium text-foreground transition-colors group-hover:text-primary">
            {name}
          </p>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{groupDescription(group, t("fallbackDescription"))}</p>
        </div>

        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
          {t("open")}
          <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function CreateOrgCard() {
  const t = useTranslations("upload.dashboardClient.organizations");
  return (
    <Link
      href="/manage?mode=onboard-org"
      className="group flex min-h-[220px] flex-col items-center justify-center gap-2.5 rounded-3xl border border-dashed border-border/70 bg-card/40 p-5 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <PlusIcon className="size-6" />
      </span>
      <span className="text-sm font-medium text-foreground">{t("createCard.title")}</span>
      <span className="text-xs text-muted-foreground">{t("createCard.description")}</span>
    </Link>
  );
}

function EmptyChoiceCard({
  href,
  label,
  title,
  emphasis,
  description,
  cta,
  image,
  alt,
  highlighted = false,
}: {
  href: string;
  label: string;
  title: string;
  emphasis: string;
  description: string;
  cta: string;
  image: string;
  alt: string;
  highlighted?: boolean;
}) {
  return (
    <Link href={href} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <article className="relative h-[320px] overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-foreground/5 transition-all duration-500 hover:-translate-y-1 hover:border-primary/20 hover:shadow-xl sm:h-[360px]">
        <Image
          src={image}
          alt={alt}
          fill
          sizes="(min-width: 640px) 50vw, calc(100vw - 3rem)"
          className="object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/88 to-card/0" />
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
          <span
            className={highlighted
              ? "inline-flex rounded-full bg-primary px-4 py-1.5 text-xs font-bold tracking-[0.12em] text-primary-foreground uppercase shadow-lg shadow-primary/25 ring-1 ring-primary/30 backdrop-blur"
              : "inline-flex rounded-full bg-background/75 px-3 py-1 text-xs font-bold tracking-[0.12em] text-foreground/70 uppercase shadow-sm backdrop-blur"}
          >
            {label}
          </span>
          <h2 className="font-garamond mt-4 text-4xl leading-[1.05] font-light tracking-[-0.015em] text-foreground">
            {title}
            <br />
            <span className="font-instrument text-primary italic">{emphasis}</span>
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground dark:text-foreground/75">{description}</p>
          <span className="mt-5 flex items-center gap-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            {cta}
            <ArrowUpRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </article>
    </Link>
  );
}

function EmptyOrganizationChoices() {
  const t = useTranslations("upload.dashboardClient.organizations.empty");

  return (
    <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <EmptyChoiceCard
        href="/certs"
        highlighted
        image="/assets/media/images/landing/supporter-river.jpg"
        label={t("funders.label")}
        title={t("funders.title")}
        emphasis={t("funders.emphasis")}
        description={t("funders.description")}
        cta={t("funders.cta")}
        alt={t("funders.alt")}
      />
      <EmptyChoiceCard
        href="/manage?mode=onboard-org"
        image="/assets/media/images/landing/steward-waterfall.jpg"
        label={t("organizations.label")}
        title={t("organizations.title")}
        emphasis={t("organizations.emphasis")}
        description={t("organizations.description")}
        cta={t("organizations.cta")}
        alt={t("organizations.alt")}
      />
    </section>
  );
}

export function ManageGroupsClient({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("upload.dashboardClient.organizations");
  const { groups, status, error, reload } = useAccountList(sessionDid);
  const isInitialLoading = Boolean(sessionDid) && (status === "idle" || (status === "loading" && groups.length === 0));
  const showErrorOnly = status === "error" && groups.length === 0;

  if (showErrorOnly) {
    return (
      <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error ?? t("loadError")} {sessionDid ? (
          <button type="button" onClick={() => void reload()} className="font-medium underline underline-offset-2">
            {t("retry")}
          </button>
        ) : null}
      </p>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> {t("loading")}
      </div>
    );
  }

  if (groups.length === 0) {
    return <EmptyOrganizationChoices />;
  }

  return (
    <div className="space-y-4">
      {status === "error" ? (
        <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ?? t("loadError")} {sessionDid ? (
            <button type="button" onClick={() => void reload()} className="font-medium underline underline-offset-2">
              {t("retry")}
            </button>
          ) : null}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <OrgCard key={group.groupDid} group={group} />
        ))}
        <CreateOrgCard />
      </div>
    </div>
  );
}
