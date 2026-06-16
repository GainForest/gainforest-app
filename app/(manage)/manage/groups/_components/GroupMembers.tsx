"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Loader2Icon, LockIcon, RefreshCwIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCgsErrorMessage } from "@/app/_lib/cgs-errors";
import { monogram, resolveDidProfile, type DidProfile } from "@/app/_lib/did-profile";
import {
  addCgsMember,
  listCgsMembers,
  removeCgsMember,
  resolveCgsMemberIdentity,
  setCgsMemberRole,
  type CgsMember,
  type CgsRole,
} from "../../_lib/cgs";

type RoleInput = "member" | "admin";
type Variant = "section" | "panel";

const SECTION_EASE = [0.25, 0.1, 0.25, 1] as const;

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

function memberErrorMessage(error: unknown, fallback: string): string {
  return formatCgsErrorMessage(error, fallback);
}

function MemberAvatar({ did, profile }: { did: string; profile?: DidProfile }) {
  const mono = useMemo(() => monogram(profile?.displayName?.trim() || "Member", did), [profile?.displayName, did]);
  return (
    <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white">
      {profile?.avatar ? (
        <Image src={profile.avatar} alt="" fill className="object-cover" unoptimized />
      ) : (
        <span aria-hidden style={{ backgroundColor: mono.bg }} className="flex size-full items-center justify-center">
          {mono.char}
        </span>
      )}
    </div>
  );
}

function MemberRow({
  member,
  profile,
  canRemove,
  canSetRoles,
  isPending,
  onRoleChange,
  onRemove,
}: {
  member: CgsMember;
  profile?: DidProfile;
  canRemove: boolean;
  canSetRoles: boolean;
  isPending: boolean;
  onRoleChange: (did: string, role: RoleInput) => void;
  onRemove: (did: string) => void;
}) {
  const locked = member.role === "owner";
  const roleEditable = canSetRoles && !locked;
  const removable = canRemove && !locked;
  const name = profile?.displayName?.trim();
  const primary = name || "Team member";
  const joined = formatDate(member.addedAt);
  const secondary = !profile ? "Loading name…" : joined ? `Joined ${joined}` : "Organization member";

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/40">
      <MemberAvatar did={member.did} profile={profile} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{primary}</p>
        <p className="truncate text-xs text-muted-foreground">{secondary}</p>
      </div>

      {roleEditable ? (
        <select
          className="h-8 rounded-full border border-border bg-background px-3 text-xs font-medium capitalize text-foreground outline-none transition-colors focus:border-primary/60"
          value={member.role === "admin" ? "admin" : "member"}
          onChange={(event) => onRoleChange(member.did, event.target.value as RoleInput)}
          disabled={isPending}
          aria-label="Member role"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      ) : (
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium capitalize", roleBadge(member.role))}>
          {member.role}
        </span>
      )}

      {removable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isPending}
          onClick={() => onRemove(member.did)}
          title="Remove member"
          aria-label="Remove member"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon />
        </Button>
      ) : (
        <span className="w-7 shrink-0" aria-hidden />
      )}
    </div>
  );
}

export function GroupMembers({
  groupDid,
  currentRole,
  variant = "panel",
  initialMembers,
  initialError = null,
}: {
  groupDid: string;
  currentRole: CgsRole;
  variant?: Variant;
  initialMembers?: CgsMember[];
  initialError?: string | null;
}) {
  const canAddRemove = currentRole === "owner" || currentRole === "admin";
  const canSetRoles = currentRole === "owner";
  const hasInitialMembers = initialMembers !== undefined;

  const [members, setMembers] = useState<CgsMember[]>(() => initialMembers ?? []);
  const [profiles, setProfiles] = useState<Record<string, DidProfile>>({});
  const [memberIdentifier, setMemberIdentifier] = useState("");
  const [role, setRole] = useState<RoleInput>("member");
  const [error, setError] = useState<string | null>(initialError);
  const [loaded, setLoaded] = useState(hasInitialMembers || Boolean(initialError));
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const result = await listCgsMembers(groupDid);
        setMembers(result.members ?? []);
      } catch (err) {
        setError(memberErrorMessage(err, "Could not load members."));
      } finally {
        setLoaded(true);
      }
    });
  }, [groupDid]);

  useEffect(() => {
    setMembers(initialMembers ?? []);
    setError(initialError);
    setLoaded(hasInitialMembers || Boolean(initialError));
    if (!hasInitialMembers && !initialError) refresh();
  }, [groupDid, hasInitialMembers, initialError, initialMembers, refresh]);

  // Hydrate member identities (name + avatar) from the public AppView.
  useEffect(() => {
    let active = true;
    for (const member of members) {
      if (profiles[member.did]) continue;
      void resolveDidProfile(member.did).then((profile) => {
        if (active) setProfiles((current) => ({ ...current, [member.did]: profile }));
      });
    }
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!canAddRemove) return;
    const identifier = memberIdentifier.trim();
    if (!identifier) return;
    const nextRole = canSetRoles ? role : "member";
    startTransition(async () => {
      setError(null);
      try {
        const identity = await resolveCgsMemberIdentity(identifier);
        await addCgsMember(groupDid, identity.did, nextRole);
        setMemberIdentifier("");
        const result = await listCgsMembers(groupDid);
        setMembers(result.members ?? []);
      } catch (err) {
        setError(memberErrorMessage(err, "Could not add member."));
      }
    });
  };

  const updateRole = (did: string, nextRole: RoleInput) => {
    if (!canSetRoles) return;
    startTransition(async () => {
      setError(null);
      try {
        await setCgsMemberRole(groupDid, did, nextRole);
        setMembers((current) => current.map((member) => (member.did === did ? { ...member, role: nextRole } : member)));
      } catch (err) {
        setError(memberErrorMessage(err, "Could not update role."));
      }
    });
  };

  const remove = (did: string) => {
    if (!canAddRemove) return;
    startTransition(async () => {
      setError(null);
      try {
        await removeCgsMember(groupDid, did);
        setMembers((current) => current.filter((member) => member.did !== did));
      } catch (err) {
        setError(memberErrorMessage(err, "Could not remove member."));
      }
    });
  };

  const sortedMembers = useMemo(() => {
    const rank = { owner: 0, admin: 1, member: 2 } as const;
    return [...members].sort((a, b) => rank[a.role] - rank[b.role]);
  }, [members]);

  const count = members.length;

  const addForm = canAddRemove ? (
    <div className="space-y-2">
      <form onSubmit={handleAdd} className={cn("grid gap-2", canSetRoles ? "sm:grid-cols-[1fr_auto_auto]" : "sm:grid-cols-[1fr_auto]")}>
        <Input
          value={memberIdentifier}
          onChange={(event) => setMemberIdentifier(event.target.value)}
          placeholder="name@example.com or username"
          autoComplete="email"
          disabled={isPending}
          aria-label="Member email or username"
        />
        {canSetRoles ? (
          <select
            className="h-9 rounded-full border border-border bg-background px-4 text-sm capitalize text-foreground outline-none transition-colors focus:border-primary/60"
            value={role}
            onChange={(event) => setRole(event.target.value as RoleInput)}
            disabled={isPending}
            aria-label="Role for new member"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        ) : null}
        <Button type="submit" disabled={isPending || !memberIdentifier.trim()}>
          <UserPlusIcon /> Add
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        {canSetRoles
          ? "Use an email when available. If lookup is not connected for that account yet, use their GainForest username."
          : "Admins can add regular members. Ask an owner to change roles or add another admin."}
      </p>
    </div>
  ) : (
    <p className="flex items-center gap-2 rounded-2xl bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">
      <LockIcon className="size-3.5 shrink-0" /> Only owners and admins can add or remove members.
    </p>
  );

  const errorBanner = error ? (
    <p className="rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>
  ) : null;

  const list = (
    <div className="divide-y divide-border/60">
      {sortedMembers.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          {isPending || !loaded ? (
            <>
              <Loader2Icon className="size-4 animate-spin" /> Loading members…
            </>
          ) : (
            "No members yet."
          )}
        </p>
      ) : (
        sortedMembers.map((member) => (
          <MemberRow
            key={member.did}
            member={member}
            profile={profiles[member.did]}
            canRemove={canAddRemove}
            canSetRoles={canSetRoles}
            isPending={isPending}
            onRoleChange={updateRole}
            onRemove={remove}
          />
        ))
      )}
    </div>
  );

  if (variant === "section") {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: SECTION_EASE }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="font-instrument text-2xl italic leading-none text-foreground">Members</h2>
            {loaded ? <span className="text-sm text-muted-foreground">{count}</span> : null}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={isPending}>
            {isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            Refresh
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {addForm}
          {errorBanner}
          {list}
        </div>
      </motion.section>
    );
  }

  return (
    <section className="rounded-3xl border border-border/60 bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UsersIcon className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium text-foreground">Members</h2>
              {loaded ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{count}</span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {canSetRoles
                ? "Add people and control who can make changes for this organization."
                : canAddRemove
                  ? "Add or remove regular members. Only owners can change roles."
                  : "You can view members but not change them."}
            </p>
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={refresh} disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
          Refresh
        </Button>
      </div>
      <div className="mt-5 space-y-3">
        {addForm}
        {errorBanner}
        {list}
      </div>
    </section>
  );
}
