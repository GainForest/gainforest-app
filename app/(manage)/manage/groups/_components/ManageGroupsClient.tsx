"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { useAccountList } from "@/app/_lib/account-switcher";
import type { CgsGroupMembership } from "../../_lib/cgs";

function roleBadge(role: string) {
  return role === "owner"
    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
    : role === "admin"
      ? "bg-primary/10 text-primary"
      : "bg-muted text-muted-foreground";
}

function groupName(group: CgsGroupMembership): string {
  return group.displayName?.trim() || "Organization account";
}

function groupDescription(group: CgsGroupMembership): string {
  return group.description?.trim() || "No description yet";
}

function groupHref(group: CgsGroupMembership): string {
  return `/manage/groups/${encodeURIComponent(group.handle?.trim() || group.groupDid)}`;
}

function groupInitial(group: CgsGroupMembership): string {
  return groupName(group).charAt(0).toUpperCase();
}

const EMPTY_COVER =
  "radial-gradient(circle at 20% 30%, oklch(0.5 0.07 157 / 0.20) 0%, transparent 55%), radial-gradient(circle at 85% 20%, oklch(0.5 0.07 157 / 0.12) 0%, transparent 50%)";

function OrgCard({ group }: { group: CgsGroupMembership }) {
  return (
    <Link
      href={groupHref(group)}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_44px_-18px_oklch(0_0_0/0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {/* Cover band — the org's avatar blurred, or a soft brand gradient */}
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
          {group.role}
        </span>
      </div>

      {/* Body */}
      <div className="relative flex flex-1 flex-col px-5 pb-5">
        <div className="relative -mt-9 mb-3 flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xl font-semibold text-muted-foreground ring-4 ring-card">
          {group.avatarUrl ? (
            <Image src={group.avatarUrl} alt={groupName(group)} fill className="object-cover" unoptimized />
          ) : (
            groupInitial(group)
          )}
        </div>

        <div className="min-w-0">
          <p className="truncate text-base font-medium text-foreground transition-colors group-hover:text-primary">
            {groupName(group)}
          </p>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{groupDescription(group)}</p>
        </div>

        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
          Open
          <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function CreateOrgCard() {
  return (
    <Link
      href="/manage?mode=onboard-org"
      className="group flex min-h-[220px] flex-col items-center justify-center gap-2.5 rounded-3xl border border-dashed border-border/70 bg-card/40 p-5 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <PlusIcon className="size-6" />
      </span>
      <span className="text-sm font-medium text-foreground">Create an organization</span>
      <span className="text-xs text-muted-foreground">Start a new shared account</span>
    </Link>
  );
}

export function ManageGroupsClient({ sessionDid }: { sessionDid: string | null }) {
  const { groups, status, error, reload } = useAccountList(sessionDid);
  const isInitialLoading = Boolean(sessionDid) && (status === "idle" || (status === "loading" && groups.length === 0));

  return (
    <div className="space-y-4">
      {status === "error" ? (
        <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ?? "Could not load organizations."}{" "}
          {sessionDid ? (
            <button type="button" onClick={() => void reload()} className="font-medium underline underline-offset-2">
              Try again
            </button>
          ) : null}
        </p>
      ) : null}

      {isInitialLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> Loading organizations…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <OrgCard key={group.groupDid} group={group} />
          ))}
          <CreateOrgCard />
        </div>
      )}
    </div>
  );
}
