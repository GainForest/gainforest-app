"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { CheckIcon, Loader2Icon, LockIcon, MailIcon, RefreshCwIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCgsErrorMessage } from "@/app/_lib/cgs-errors";
import { monogram, resolveDidProfile, type DidProfile } from "@/app/_lib/did-profile";
import {
  addCgsMember,
  inviteCgsMember,
  removeCgsMember,
  resolveCgsMemberIdentity,
  setCgsMemberRole,
  type CgsMember,
  type CgsRole,
} from "../../_lib/cgs";

type RoleInput = "member" | "admin";
type Variant = "section" | "panel";

type DataCouncilResponse = {
  members: CgsMember[];
  awardedDids: string[];
  canWriteBadges: boolean;
};

type GroupSettingsResponse = {
  members: CgsMember[];
  profiles?: DidProfile[];
  dataCouncil?: DataCouncilResponse | null;
  dataCouncilError?: string | null;
};

type DataCouncilRowState = {
  checked: boolean;
  disabled: boolean;
  pending: boolean;
  label: string;
  addLabel: string;
  addAria: string;
  removeAria: string;
  onToggle: (did: string, selected: boolean) => void;
};

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

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function profilesByDid(profiles?: DidProfile[]): Record<string, DidProfile> {
  if (!profiles?.length) return {};
  return Object.fromEntries(profiles.map((profile) => [profile.did, profile]));
}

async function parseJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!response.ok || data.error) throw new Error(data.message ?? data.error ?? fallback);
  return data;
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
  dataCouncil,
  onRoleChange,
  onRemove,
}: {
  member: CgsMember;
  profile?: DidProfile;
  canRemove: boolean;
  canSetRoles: boolean;
  isPending: boolean;
  dataCouncil?: DataCouncilRowState;
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

      {dataCouncil ? (
        <Button
          type="button"
          variant={dataCouncil.checked ? "secondary" : "ghost"}
          size="sm"
          disabled={dataCouncil.disabled}
          onClick={() => dataCouncil.onToggle(member.did, !dataCouncil.checked)}
          aria-label={dataCouncil.checked ? dataCouncil.removeAria : dataCouncil.addAria}
          className={cn("h-8 shrink-0 rounded-full px-3 text-xs", !dataCouncil.checked && "text-muted-foreground")}
        >
          {dataCouncil.pending ? <Loader2Icon className="animate-spin" /> : dataCouncil.checked ? <CheckIcon /> : null}
          {dataCouncil.checked ? dataCouncil.label : dataCouncil.addLabel}
        </Button>
      ) : null}

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
  currentUserDid = null,
  variant = "panel",
  initialMembers,
  initialError = null,
  showDataCouncil = false,
}: {
  groupDid: string;
  currentRole: CgsRole;
  currentUserDid?: string | null;
  variant?: Variant;
  initialMembers?: CgsMember[];
  initialError?: string | null;
  showDataCouncil?: boolean;
}) {
  const dataCouncilT = useTranslations("upload.settings.dataCouncil");
  const invitationsT = useTranslations("common.groupInvitations.members");
  const dataCouncilLoadError = dataCouncilT("errors.load");
  const dataCouncilSaveError = dataCouncilT("errors.save");
  const canAddRemove = currentRole === "owner" || currentRole === "admin";
  const canSetRoles = currentRole === "owner";
  const canUseDataCouncil = showDataCouncil && canAddRemove;
  const hasInitialMembers = initialMembers !== undefined;

  const [members, setMembers] = useState<CgsMember[]>(() => initialMembers ?? []);
  const [profiles, setProfiles] = useState<Record<string, DidProfile>>({});
  const [memberIdentifier, setMemberIdentifier] = useState("");
  const [role, setRole] = useState<RoleInput>("member");
  const [error, setError] = useState<string | null>(initialError);
  const [success, setSuccess] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(hasInitialMembers || Boolean(initialError));
  const [pendingCount, setPendingCount] = useState(0);
  const [dataCouncilLoaded, setDataCouncilLoaded] = useState(!canUseDataCouncil);
  const [dataCouncilSelected, setDataCouncilSelected] = useState<Set<string>>(() => new Set());
  const [dataCouncilCanWrite, setDataCouncilCanWrite] = useState(false);
  const [dataCouncilSavingDid, setDataCouncilSavingDid] = useState<string | null>(null);
  const isPending = pendingCount > 0;

  const runPending = useCallback((task: () => Promise<void>) => {
    setPendingCount((count) => count + 1);
    void task().finally(() => setPendingCount((count) => Math.max(0, count - 1)));
  }, []);

  const applyDataCouncilState = useCallback((data: DataCouncilResponse) => {
    setMembers(data.members ?? []);
    setDataCouncilSelected(new Set(data.awardedDids ?? []));
    setDataCouncilCanWrite(data.canWriteBadges);
    setDataCouncilLoaded(true);
  }, []);

  const loadGroupSettings = useCallback(async () => {
    const params = new URLSearchParams({ repo: groupDid });
    if (canUseDataCouncil) params.set("dataCouncil", "1");
    const response = await fetch(`/api/manage/group-settings?${params.toString()}`, { cache: "no-store" });
    const data = await parseJsonResponse<GroupSettingsResponse>(response, "Could not load members.");
    setMembers(data.members ?? []);
    setProfiles((current) => ({ ...current, ...profilesByDid(data.profiles) }));
    if (canUseDataCouncil) {
      if (data.dataCouncil) applyDataCouncilState(data.dataCouncil);
      else {
        setDataCouncilSelected(new Set());
        setDataCouncilCanWrite(false);
        setDataCouncilLoaded(true);
      }
      if (data.dataCouncilError) setError(memberErrorMessage(data.dataCouncilError, dataCouncilLoadError));
    }
  }, [applyDataCouncilState, canUseDataCouncil, dataCouncilLoadError, groupDid]);

  const refresh = useCallback(() => {
    runPending(async () => {
      setError(null);
      try {
        await loadGroupSettings();
      } catch (err) {
        setError(memberErrorMessage(err, "Could not load members."));
        if (canUseDataCouncil) setDataCouncilLoaded(true);
      } finally {
        setLoaded(true);
      }
    });
  }, [canUseDataCouncil, loadGroupSettings, runPending]);

  useEffect(() => {
    setMembers(initialMembers ?? []);
    setError(initialError);
    setLoaded(hasInitialMembers || Boolean(initialError));
    setDataCouncilLoaded(!canUseDataCouncil);
    setDataCouncilSelected(new Set());
    setDataCouncilCanWrite(false);
    if (!hasInitialMembers && !initialError) refresh();
  }, [canUseDataCouncil, groupDid, hasInitialMembers, initialError, initialMembers, refresh]);

  useEffect(() => {
    if (!canUseDataCouncil) {
      setDataCouncilLoaded(true);
      setDataCouncilSelected(new Set());
      setDataCouncilCanWrite(false);
    }
  }, [canUseDataCouncil]);

  // Hydrate member identities (name + avatar) from the app's account-card endpoint.
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
    runPending(async () => {
      setError(null);
      setSuccess(null);
      const previousMembers = members;
      try {
        if (isLikelyEmail(identifier)) {
          await inviteCgsMember(groupDid, identifier, nextRole);
          setMemberIdentifier("");
          setSuccess(invitationsT("sent", { email: identifier }));
          return;
        }

        const identity = await resolveCgsMemberIdentity(identifier);
        const optimisticMember: CgsMember = {
          did: identity.did,
          role: nextRole,
          addedBy: currentUserDid,
          addedAt: new Date().toISOString(),
        };
        setProfiles((current) => ({
          ...current,
          [identity.did]: {
            did: identity.did,
            handle: identity.handle ?? null,
            displayName: identity.displayName ?? null,
            avatar: identity.avatarUrl ?? null,
          },
        }));
        setMembers((current) => current.some((member) => member.did === identity.did)
          ? current.map((member) => (member.did === identity.did ? { ...member, role: nextRole } : member))
          : [...current, optimisticMember]);
        setMemberIdentifier("");
        await addCgsMember(groupDid, identity.did, nextRole);
      } catch (err) {
        setMembers(previousMembers);
        setError(memberErrorMessage(err, isLikelyEmail(identifier) ? invitationsT("sendError") : invitationsT("addError")));
      }
    });
  };

  const updateRole = (did: string, nextRole: RoleInput) => {
    if (!canSetRoles) return;
    runPending(async () => {
      setError(null);
      const previousRole = members.find((member) => member.did === did)?.role ?? null;
      setMembers((current) => current.map((member) => (member.did === did ? { ...member, role: nextRole } : member)));
      try {
        await setCgsMemberRole(groupDid, did, nextRole);
      } catch (err) {
        if (previousRole) {
          setMembers((current) => current.map((member) => (member.did === did ? { ...member, role: previousRole } : member)));
        }
        setError(memberErrorMessage(err, "Could not update role."));
      }
    });
  };

  const remove = (did: string) => {
    const isSelf = Boolean(currentUserDid && currentUserDid === did);
    if (!canAddRemove && !isSelf) return;
    runPending(async () => {
      setError(null);
      const previousMembers = members;
      const previousCouncil = dataCouncilSelected;
      setMembers((current) => current.filter((member) => member.did !== did));
      setDataCouncilSelected((current) => {
        const next = new Set(current);
        next.delete(did);
        return next;
      });
      try {
        await removeCgsMember(groupDid, did);
      } catch (err) {
        setMembers(previousMembers);
        setDataCouncilSelected(previousCouncil);
        setError(memberErrorMessage(err, "Could not remove member."));
      }
    });
  };

  const toggleDataCouncil = (did: string, selected: boolean) => {
    if (!canUseDataCouncil || !dataCouncilCanWrite || dataCouncilSavingDid) return;
    setDataCouncilSavingDid(did);
    const previousCouncil = dataCouncilSelected;
    setDataCouncilSelected((current) => {
      const next = new Set(current);
      if (selected) next.add(did);
      else next.delete(did);
      return next;
    });
    runPending(async () => {
      setError(null);
      try {
        const response = await fetch("/api/manage/data-council", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo: groupDid, memberDid: did, selected }),
        });
        const data = await parseJsonResponse<DataCouncilResponse>(response, dataCouncilSaveError);
        setDataCouncilSelected(new Set(data.awardedDids ?? []));
        setDataCouncilCanWrite(data.canWriteBadges);
      } catch (err) {
        setDataCouncilSelected(previousCouncil);
        setError(memberErrorMessage(err, dataCouncilSaveError));
      } finally {
        setDataCouncilSavingDid(null);
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
          placeholder={invitationsT("inputPlaceholder")}
          autoComplete="email username"
          disabled={isPending}
          aria-label={invitationsT("inputAria")}
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
          {isLikelyEmail(memberIdentifier) ? <MailIcon /> : <UserPlusIcon />} {isLikelyEmail(memberIdentifier) ? invitationsT("invite") : invitationsT("add")}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        {canSetRoles
          ? invitationsT("ownerHelp")
          : invitationsT("adminHelp")}
      </p>
    </div>
  ) : (
    <p className="flex items-center gap-2 rounded-2xl bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">
      <LockIcon className="size-3.5 shrink-0" /> {invitationsT("locked")}
    </p>
  );

  const errorBanner = error ? (
    <p className="rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>
  ) : null;

  const successBanner = success ? (
    <p className="rounded-2xl bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">{success}</p>
  ) : null;

  const dataCouncilNotice = canUseDataCouncil && dataCouncilLoaded && !dataCouncilCanWrite ? (
    <p className="flex items-center gap-2 rounded-2xl bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">
      <LockIcon className="size-3.5 shrink-0" /> {dataCouncilT("lockedRole")}
    </p>
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
        sortedMembers.map((member) => {
          const profile = profiles[member.did];
          const displayName = profile?.displayName?.trim() || "Team member";
          const councilChecked = dataCouncilSelected.has(member.did);
          return (
            <MemberRow
              key={member.did}
              member={member}
              profile={profile}
              canRemove={canAddRemove || Boolean(currentUserDid && member.did === currentUserDid)}
              canSetRoles={canSetRoles}
              isPending={isPending}
              dataCouncil={canUseDataCouncil ? {
                checked: councilChecked,
                disabled: isPending || !dataCouncilLoaded || !dataCouncilCanWrite,
                pending: dataCouncilSavingDid === member.did,
                label: dataCouncilT("title"),
                addLabel: dataCouncilT("addLabel"),
                addAria: dataCouncilT("addAria", { name: displayName }),
                removeAria: dataCouncilT("removeAria", { name: displayName }),
                onToggle: toggleDataCouncil,
              } : undefined}
              onRoleChange={updateRole}
              onRemove={remove}
            />
          );
        })
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
          {dataCouncilNotice}
          {successBanner}
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
        {dataCouncilNotice}
        {successBanner}
        {errorBanner}
        {list}
      </div>
    </section>
  );
}
