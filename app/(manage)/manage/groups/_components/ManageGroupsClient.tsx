"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { ArrowRightIcon, Loader2Icon, PlusIcon, ShieldIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addCgsMember,
  fetchCgsGroups,
  listCgsMembers,
  removeCgsMember,
  setCgsMemberRole,
  type CgsGroupMembership,
  type CgsMember,
} from "../../_lib/cgs";

type RoleInput = "member" | "admin";

function roleBadge(role: string) {
  return role === "owner" ? "bg-amber-500/10 text-amber-700" : role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function groupName(group: CgsGroupMembership): string {
  return group.displayName?.trim() || "Organization account";
}

function groupHref(group: CgsGroupMembership): string {
  return `/manage/groups/${encodeURIComponent(group.handle?.trim() || group.groupDid)}`;
}

function MemberPanel({ group }: { group: CgsGroupMembership }) {
  const [members, setMembers] = useState<CgsMember[]>([]);
  const [memberDid, setMemberDid] = useState("");
  const [role, setRole] = useState<RoleInput>("member");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      setError(null);
      try {
        const result = await listCgsMembers(group.groupDid);
        setMembers(result.members ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load members.");
      }
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.groupDid]);

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const did = memberDid.trim();
    if (!did) return;
    startTransition(async () => {
      setError(null);
      try {
        await addCgsMember(group.groupDid, did, role);
        setMemberDid("");
        const result = await listCgsMembers(group.groupDid);
        setMembers(result.members ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add member.");
      }
    });
  };

  const updateRole = (did: string, nextRole: RoleInput) => {
    startTransition(async () => {
      setError(null);
      try {
        await setCgsMemberRole(group.groupDid, did, nextRole);
        setMembers((current) => current.map((member) => member.did === did ? { ...member, role: nextRole } : member));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update role.");
      }
    });
  };

  const remove = (did: string) => {
    startTransition(async () => {
      setError(null);
      try {
        await removeCgsMember(group.groupDid, did);
        setMembers((current) => current.filter((member) => member.did !== did));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove member.");
      }
    });
  };

  return (
    <section className="mt-3 rounded-3xl border border-border bg-background/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium"><UsersIcon className="size-4" /> Members</h2>
          <p className="text-sm text-muted-foreground">Roles control who can make changes for this organization.</p>
        </div>
        <Button type="button" variant="secondary" onClick={refresh} disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      <form onSubmit={handleAdd} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input value={memberDid} onChange={(event) => setMemberDid(event.target.value)} placeholder="Member username or account ID" disabled={isPending} />
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value as RoleInput)} disabled={isPending}>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <Button type="submit" disabled={isPending || !memberDid.trim()}><UserPlusIcon /> Add</Button>
      </form>

      {error ? <p className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {members.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No members loaded yet.</p>
        ) : members.map((member) => {
          const locked = member.role === "owner";
          return (
            <div key={member.did} className="grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">Member account</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(member.addedAt) ? `Joined ${formatDate(member.addedAt)}` : "Member"}
                  {member.addedBy ? " · added by another member" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${roleBadge(member.role)}`}><ShieldIcon className="size-3" /> {member.role}</span>
                {!locked ? (
                  <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={member.role === "admin" ? "admin" : "member"} onChange={(event) => updateRole(member.did, event.target.value as RoleInput)} disabled={isPending}>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                ) : null}
              </div>
              <Button type="button" variant="ghost" disabled={isPending || locked} onClick={() => remove(member.did)} title={locked ? "Owners cannot be removed" : "Remove member"}>
                <Trash2Icon /> Remove
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ManageGroupsClient() {
  const [groups, setGroups] = useState<CgsGroupMembership[]>([]);
  const [selectedDid, setSelectedDid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const result = await fetchCgsGroups();
        setGroups(result.groups ?? []);
        setSelectedDid((result.groups ?? [])[0]?.groupDid ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load organizations.");
      }
    });
  }, []);

  const selected = useMemo(
    () => groups.find((group) => group.groupDid === selectedDid) ?? null,
    [groups, selectedDid],
  );

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium">Manage Organizations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organizations are listed from the CGS accounts you can access.</p>
        </div>
        <Button asChild>
          <Link href="/manage?mode=onboard-org"><PlusIcon /> Create an Organization</Link>
        </Button>
      </div>

      {isPending && groups.length === 0 ? <p className="text-sm text-muted-foreground">Loading organizations…</p> : null}
      {error ? <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      {groups.length === 0 && !isPending ? (
        <div className="rounded-3xl border border-border bg-muted/40 p-5">
          <p className="font-medium">No organizations found.</p>
          <p className="mt-1 text-sm text-muted-foreground">Create an organization or ask an owner/admin to add your account, then refresh this page.</p>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <div className="space-y-2">
          {groups.map((group) => (
            <div
              key={group.groupDid}
              className={`rounded-3xl border p-4 transition-colors ${selectedDid === group.groupDid ? "border-primary bg-primary/5" : "border-border bg-background/70 hover:bg-muted/50"}`}
            >
              <button type="button" onClick={() => setSelectedDid(group.groupDid)} className="w-full text-left">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium">{groupName(group)}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${roleBadge(group.role)}`}>{group.role}</span>
                </div>
              </button>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>{formatDate(group.joinedAt) ? `Joined ${formatDate(group.joinedAt)}` : "Organization account"}</span>
                <Link className="inline-flex items-center gap-1 text-primary hover:underline" href={groupHref(group)}>
                  Open <ArrowRightIcon className="size-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
        {selected ? <MemberPanel group={selected} /> : null}
      </div>
    </div>
  );
}
