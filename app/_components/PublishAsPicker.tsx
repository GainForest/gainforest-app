"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2Icon, CheckIcon, ChevronsUpDownIcon, UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { groupManageTarget, personalManageTarget, type ManageTarget } from "@/lib/links";
import {
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
  type AccountCard,
  type SwitcherGroup,
} from "../_lib/account-switcher";

// The one shared answer to "who am I uploading this as?". A pill that always
// spells out whether new records go to the signed-in person or to an
// organization's shared account — and, when the host passes `onChangeTarget`,
// doubles as a switcher so the choice can be corrected right where it matters
// (inside the upload/create flows) instead of hunting for the avatar menu.
//
// Two modes:
// - Interactive (sessionDid + onChangeTarget): lists the personal account and
//   every organization the user belongs to; selecting one updates both the
//   host's target and the app-wide active account context.
// - Static (no onChangeTarget): a read-only chip for account-scoped pages
//   (e.g. /account/<org>/manage/...) where the destination is fixed by the
//   route and switching would contradict the page around it.
export function PublishAsPicker({
  target,
  sessionDid,
  onChangeTarget,
  disabled = false,
  className,
}: {
  target: ManageTarget;
  sessionDid?: string | null;
  onChangeTarget?: (target: ManageTarget) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("common.publishAs");
  const { personal, groups } = useAccountList(sessionDid ?? null);
  const [, setActiveContext] = useActiveAccountContext(sessionDid ?? "");

  const isGroup = target.kind === "group";
  const matchedGroup = isGroup ? groups.find((group) => group.groupDid === target.did) ?? null : null;

  // Best-known name/avatar for the current destination. Targets built from the
  // stored context often carry no displayName, so fall back to the account
  // card endpoint rather than showing a bare fallback (or worse, a DID).
  const [fetchedCard, setFetchedCard] = useState<AccountCard | null>(null);
  const knownName = isGroup
    ? matchedGroup?.displayName?.trim() || target.displayName?.trim() || matchedGroup?.handle?.trim() || null
    : personal?.displayName?.trim() || target.displayName?.trim() || personal?.handle?.trim() || null;

  useEffect(() => {
    setFetchedCard(null);
    if (knownName) return;
    const controller = new AbortController();
    fetch(`/api/account/card?did=${encodeURIComponent(target.did)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((card: AccountCard | null) => {
        if (card) setFetchedCard(card);
      })
      .catch(() => {});
    return () => controller.abort();
    // Refetch only when the destination account changes (or a name appears).
  }, [target.did, knownName]);

  const name =
    knownName ||
    fetchedCard?.displayName?.trim() ||
    fetchedCard?.handle?.trim() ||
    (isGroup ? t("organizationFallback") : t("personalFallback"));
  const avatarUrl = isGroup
    ? matchedGroup?.avatarUrl ?? target.avatarUrl ?? fetchedCard?.avatarUrl ?? null
    : personal?.avatarUrl ?? target.avatarUrl ?? fetchedCard?.avatarUrl ?? null;

  const interactive = Boolean(sessionDid && onChangeTarget) && !disabled;
  // With no organizations there is nothing to switch to; render the read-only
  // chip so the control never opens an empty menu.
  const canSwitch = interactive && groups.length > 0;

  const selectPersonal = () => {
    if (!sessionDid || !onChangeTarget) return;
    setActiveContext({ type: "personal", did: sessionDid });
    onChangeTarget(
      personalManageTarget({
        did: sessionDid,
        accountKind: "user",
        identifier: sessionDid,
        displayName: personal?.displayName ?? null,
        avatarUrl: personal?.avatarUrl ?? null,
      }),
    );
  };

  const selectGroup = (group: SwitcherGroup) => {
    if (!sessionDid || !onChangeTarget) return;
    const identifier = switcherGroupIdentifier(group);
    setActiveContext({ type: "group", did: group.groupDid, identifier, role: group.role });
    onChangeTarget(
      groupManageTarget({
        did: group.groupDid,
        accountKind: "organization",
        identifier,
        role: group.role,
        displayName: group.displayName,
        avatarUrl: group.avatarUrl,
        currentUserDid: sessionDid,
      }),
    );
  };

  const chip = (
    <PublishAsChip
      name={name}
      avatarUrl={avatarUrl}
      isGroup={isGroup}
      canSwitch={canSwitch}
      disabled={disabled}
      className={className}
      t={t}
    />
  );

  if (!canSwitch) return chip;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{chip}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("menuTitle")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={selectPersonal} className="items-center gap-2.5">
          <AccountAvatar avatarUrl={personal?.avatarUrl ?? null} isGroup={false} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {personal?.displayName?.trim() || personal?.handle?.trim() || t("personalFallback")}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{t("menuPersonalSubtitle")}</span>
          </span>
          {!isGroup ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("organizationsLabel")}
        </DropdownMenuLabel>
        {groups.map((group) => (
          <DropdownMenuItem key={group.groupDid} onClick={() => selectGroup(group)} className="items-center gap-2.5">
            <AccountAvatar avatarUrl={group.avatarUrl} isGroup />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {group.displayName?.trim() || group.handle?.trim() || t("organizationFallback")}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{t("menuOrganizationSubtitle")}</span>
            </span>
            {isGroup && target.did === group.groupDid ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Personal and organization destinations get deliberately different accent
// colors (green vs sky blue) so a glance at the chip answers "user or org?"
// before reading a single word.
function PublishAsChip({
  name,
  avatarUrl,
  isGroup,
  canSwitch,
  disabled,
  className,
  t,
  ...props
}: {
  name: string;
  avatarUrl: string | null;
  isGroup: boolean;
  canSwitch: boolean;
  disabled: boolean;
  className?: string;
  t: ReturnType<typeof useTranslations<"common.publishAs">>;
} & React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      // Static chips are informational, not clickable.
      tabIndex={canSwitch ? undefined : -1}
      aria-disabled={!canSwitch}
      aria-label={`${t("label")}: ${name}`}
      title={canSwitch ? t("switchHint") : undefined}
      {...props}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition-colors",
        isGroup ? "border-sky-500/30 bg-sky-500/5" : "border-primary/30 bg-primary/5",
        canSwitch
          ? isGroup
            ? "cursor-pointer hover:border-sky-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            : "cursor-pointer hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          : "cursor-default focus-visible:outline-none",
        disabled && "opacity-70",
        className,
      )}
    >
      <AccountAvatar avatarUrl={avatarUrl} isGroup={isGroup} />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t("label")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              isGroup ? "bg-sky-500/15 text-sky-600 dark:text-sky-400" : "bg-primary/15 text-primary",
            )}
          >
            {isGroup ? <Building2Icon className="size-3" /> : <UserIcon className="size-3" />}
            {isGroup ? t("badgeOrganization") : t("badgePersonal")}
          </span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {isGroup ? t("organizationDescription") : t("personalDescription")}
        </span>
      </span>
      {canSwitch ? <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" /> : null}
    </button>
  );
}

function AccountAvatar({ avatarUrl, isGroup }: { avatarUrl: string | null; isGroup: boolean }) {
  return (
    <span
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full",
        isGroup ? "bg-sky-500/10 text-sky-600 dark:text-sky-400" : "bg-primary/10 text-primary",
      )}
    >
      {avatarUrl ? (
        <Image src={avatarUrl} alt="" fill unoptimized sizes="36px" className="object-cover" />
      ) : isGroup ? (
        <Building2Icon className="size-4" />
      ) : (
        <UserIcon className="size-4" />
      )}
    </span>
  );
}
