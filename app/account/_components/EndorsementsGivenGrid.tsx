"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { EndorsedOrganization } from "../../_lib/endorsements-given";
import { accountPath } from "../_lib/account-route";

export function EndorsementsGivenGrid({
  organizations,
  loadError = false,
}: {
  organizations: EndorsedOrganization[];
  loadError?: boolean;
}) {
  const t = useTranslations("common.accountEndorsementsGiven");
  const router = useRouter();

  if (loadError) {
    return (
      <div role="alert" className="mt-5 flex flex-col items-start gap-3 rounded-2xl bg-muted px-5 py-6">
        <p className="text-sm text-muted-foreground">{t("loadError")}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => router.refresh()}>
          <RotateCwIcon aria-hidden />
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (organizations.length === 0) {
    return <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
      {organizations.map((organization) => (
        <EndorsedCard key={organization.did} organization={organization} fallbackName={t("fallbackName")} />
      ))}
    </div>
  );
}

function EndorsedCard({
  organization,
  fallbackName,
}: {
  organization: EndorsedOrganization;
  fallbackName: string;
}) {
  const [imgError, setImgError] = useState(false);
  const name = organization.displayName?.trim() || fallbackName;
  const hasImage = Boolean(organization.avatarUrl) && !imgError;
  const initial = name.charAt(0).toUpperCase() || "?";

  return (
    <Link
      href={accountPath(organization.did)}
      className="group flex min-h-20 items-center gap-3.5 rounded-2xl bg-muted/65 p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      <span className="relative size-12 shrink-0 overflow-hidden rounded-full bg-background">
        {hasImage ? (
          <Image src={organization.avatarUrl!} alt="" fill unoptimized onError={() => setImgError(true)} className="object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-base font-bold text-muted-foreground">{initial}</span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground group-hover:underline">{name}</span>
    </Link>
  );
}
