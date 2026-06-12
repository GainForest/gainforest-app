"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Loader2Icon, LockIcon, ShieldIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addCgsMember,
  listCgsMembers,
  removeCgsMember,
  setCgsMemberRole,
  type CgsMember,
  type CgsRole,
} from "../../_lib/cgs";

type RoleInput = "member" | "admin";

function roleBadge(role: string) {
  return role === "owner"
    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
    : role === "admin"
      ? "bg-primary/10 text-primary"
      : "bg-muted text-muted-foreground";
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function GroupMembersClient({ groupDid, currentRole }: { groupDid: string; currentRole: CgsRole }) {
  const canManage = currentRole === "owner" || currentRole === "admin";

  const [members, setMembers] = useState<CgsMember[]>([]);
  const [memberDid, setMemberDid] = useState("");
  const [role, setRole] = useState<RoleInput>("member");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      setError(null);
      try {
        const result = await listCgsMembers(groupDid);
        setMembers(result.members ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load members.");
      }
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupDid]);

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    const did = memberDid.trim();
    if (!did) return;
    startTransition(async () => {
      setError(null);
      try {
        await addCgsMember(groupDid, did, role);
        setMemberDid("");
        const result = await listCgsMembers(groupDid);
        setMembers(result.members ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add member.");
      }
    });
  };

  const updateRole = (did: string, nextRole: RoleInput) => {
    if (!canManage) return;
    startTransition(async () => {
      setError(null);
      try {
        await setCgsMemberRole(groupDid, did, nextRole);
        setMembers((current) => current.map((member) => (member.did === did ? { ...member, role: nextRole } : member)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update role.");
      }
    });
  };

  const remove = (did: string) => {
    if (!canManage) return;
    startTransition(async () => {
      setError(null);
      try {
        await removeCgsMember(groupDid, did);
        setMembers((current) => current.filter((member) => member.did !== did));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove member.");
      }
    });
  };

  return (
    <section className="rounded-3xl border border-border bg-background/70 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <UsersIcon className="size-4" /> Members
          </h2>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "Add or remove members and control who can make changes for this organization."
              : "Your role can view members but not change them."}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={refresh} disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {!canManage ? (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          <LockIcon className="size-3.5" /> Only owners and admins can manage members.
        </p>
      ) : (
        <form onSubmit={handleAdd} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input
            value={memberDid}
            onChange={(event) => setMemberDid(event.target.value)}
            placeholder="Member username or account ID"
            disabled={isPending}
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={role}
            onChange={(event) => setRole(event.target.value as RoleInput)}
            disabled={isPending}
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <Button type="submit" disabled={isPending || !memberDid.trim()}>
            <UserPlusIcon /> Add
          </Button>
        </form>
      )}

      {error ? <p className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {members.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{isPending ? "Loading members…" : "No members loaded yet."}</p>
        ) : (
          members.map((member) => {
            const locked = member.role === "owner";
            const editable = canManage && !locked;
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
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium capitalize ${roleBadge(member.role)}`}>
                    <ShieldIcon className="size-3" /> {member.role}
                  </span>
                  {editable ? (
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={member.role === "admin" ? "admin" : "member"}
                      onChange={(event) => updateRole(member.did, event.target.value as RoleInput)}
                      disabled={isPending}
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending || !editable}
                  onClick={() => remove(member.did)}
                  title={locked ? "Owners cannot be removed" : !canManage ? "Your role cannot remove members" : "Remove member"}
                >
                  <Trash2Icon /> Remove
                </Button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
