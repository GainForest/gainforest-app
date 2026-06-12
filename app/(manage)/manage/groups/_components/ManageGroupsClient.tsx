"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ArrowRightIcon, Building2Icon, Loader2Icon, PlusIcon } from "lucide-react";
import { fetchCgsGroups, type CgsGroupMembership } from "../../_lib/cgs";

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

function groupHref(group: CgsGroupMembership): string {
  return `/manage/groups/${encodeURIComponent(group.handle?.trim() || group.groupDid)}`;
}

function groupInitial(group: CgsGroupMembership): string {
  return groupName(group).charAt(0).toUpperCase();
}

function OrgCard({ group }: { group: CgsGroupMembership }) {
  return (
    <Link
      href={groupHref(group)}
      className="group relative flex flex-col gap-4 rounded-3xl border border-border bg-background/70 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted text-lg font-semibold text-muted-foreground">
          {group.avatarUrl ? (
            <Image src={group.avatarUrl} alt={groupName(group)} fill className="object-cover" unoptimized />
          ) : (
            groupInitial(group)
          )}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${roleBadge(group.role)}`}>
          {group.role}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-base font-medium text-foreground">{groupName(group)}</p>
        {group.handle ? (
          <p className="truncate text-sm text-muted-foreground">@{group.handle}</p>
        ) : (
          <p className="truncate text-sm text-muted-foreground">Organization account</p>
        )}
      </div>

      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
        Open
        <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function CreateOrgCard() {
  return (
    <Link
      href="/manage?mode=onboard-org"
      className="group flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-background/40 p-5 text-center transition-all hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <PlusIcon className="size-5" />
      </span>
      <span className="text-sm font-medium text-foreground">Create an organization</span>
      <span className="text-xs text-muted-foreground">Start a new shared account</span>
    </Link>
  );
}

export function ManageGroupsClient() {
  const [groups, setGroups] = useState<CgsGroupMembership[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const result = await fetchCgsGroups();
        setGroups(result.groups ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load organizations.");
      } finally {
        setLoaded(true);
      }
    });
  }, []);

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Building2Icon className="size-5 text-primary" />
          <h1 className="text-2xl font-medium">My Organizations</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Select an organization to manage it, or create a new one.
        </p>
      </div>

      {error ? (
        <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {isPending && !loaded ? (
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
