"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { monogram } from "@/app/_lib/did-profile";
import type { CgsGroupMembership } from "@/app/(manage)/manage/_lib/cgs";

const ACTIVE_CONTEXT_KEY = "gainforest-active-account-context";
const REDIRECT_DELAY_MS = 1300;

type AuthCompleteSession = { did: string; handle: string } | null;
type AuthCompleteAccount = {
  did: string;
  displayName: string;
  avatarUrl: string | null;
  kind: "user" | "organization";
} | null;

type ProfileCard = { displayName: string | null; avatarUrl: string | null; handle?: string | null };
type GroupOption = CgsGroupMembership & ProfileCard;

type ActiveContext =
  | { type: "personal"; did: string; selectedAt: string }
  | { type: "group"; did: string; role: CgsGroupMembership["role"]; selectedAt: string };

function sanitizeRedirect(value: string): string {
  if (!value) return "/manage";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/manage";
    return `${url.pathname}${url.search}${url.hash}` || "/manage";
  } catch {
    return value.startsWith("/") && !value.startsWith("//") ? value : "/manage";
  }
}

function rememberContext(context: ActiveContext) {
  try {
    window.localStorage.setItem(ACTIVE_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Non-critical: private windows or blocked storage should not stop sign-in.
  }
}

function roleLabel(role: CgsGroupMembership["role"]): string {
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";
}

function normalizeDid(value: string): string {
  let current = value.trim();
  for (let i = 0; i < 3; i++) {
    if (current.startsWith("did:")) return current;
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function accountSegment(didOrHandle: string): string {
  return encodeURIComponent(didOrHandle);
}

function groupManageHref(group: GroupOption): string {
  const identifier = group.handle?.trim() || normalizeDid(group.groupDid);
  return `/manage/groups/${accountSegment(identifier)}`;
}

function bestGroupName(group: GroupOption): string {
  return group.displayName?.trim() || "Group account";
}

function redirectGroupIdentifier(redirectTo: string): string | null {
  try {
    const url = new URL(redirectTo, window.location.origin);
    const match = url.pathname.match(/^\/manage\/groups\/([^/]+)\/?$/);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : null;
  } catch {
    return null;
  }
}

function groupMatchesIdentifier(group: GroupOption, identifier: string): boolean {
  const normalizedIdentifier = normalizeDid(identifier);
  if (normalizedIdentifier.startsWith("did:")) {
    return normalizeDid(group.groupDid) === normalizedIdentifier;
  }
  return Boolean(group.handle && group.handle.toLowerCase() === normalizedIdentifier.toLowerCase());
}

function AppMark({ showAnimations = false }: { showAnimations?: boolean }) {
  return (
    <motion.div
      className="relative h-20 w-20"
      layoutId="gainforest-icon"
      transition={{ duration: 0.75, type: "spring" }}
      {...(showAnimations
        ? {
            initial: { scale: 0.2, filter: "blur(20px)", opacity: 0 },
            animate: { scale: 1, filter: "blur(0px)", opacity: 1 },
          }
        : {})}
    >
      <Image className="drop-shadow-2xl" src="/assets/media/images/app-icon.png" fill alt="GainForest" />
    </motion.div>
  );
}

function OptionAvatar({ name, avatarUrl, did }: { name: string | null; avatarUrl: string | null; did: string }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="size-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  const { char, bg } = monogram(name, did);
  return (
    <span
      style={{ backgroundColor: bg }}
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
    >
      {char}
    </span>
  );
}

// Options are a fixed 64px tall (h-16), so the outer pill radius is exactly
// half the height (32px). Inner corners keep the standard radius rather than
// squaring off, so the section reads as one grouped stack with pill ends.
function cornerClass(index: number, total: number): string {
  if (total === 1) return "rounded-[32px]";
  if (index === 0) return "rounded-t-[32px] rounded-b-xl";
  if (index === total - 1) return "rounded-b-[32px] rounded-t-xl";
  return "rounded-xl";
}

function OptionCard({
  did,
  name,
  avatarUrl,
  sublabel,
  onClick,
  rounded,
}: {
  did: string;
  name: string;
  avatarUrl: string | null;
  sublabel: string;
  onClick: () => void;
  rounded: string;
}) {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      className={cn(
        "group relative flex h-16 w-full items-center justify-start gap-3 px-4 shadow-none hover:bg-primary/10",
        rounded,
      )}
    >
      <OptionAvatar name={name} avatarUrl={avatarUrl} did={did} />
      <span className="flex min-w-0 flex-col items-start">
        <span
          className="truncate text-xl italic leading-tight"
          style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
        >
          {name}
        </span>
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      </span>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 -translate-x-2 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100">
        <ChevronRight className="size-5" />
      </span>
    </Button>
  );
}

function SigningInView({ redirectTo }: { redirectTo: string }) {
  return (
    <div className="flex flex-col items-center">
      <AppMark showAnimations />
      <motion.div
        initial={{ scale: 0.2, filter: "blur(20px)", opacity: 0.5 }}
        animate={{ scale: 1, filter: "blur(0px)", opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-12 flex flex-col items-center gap-1 font-medium"
      >
        <Loader2Icon className="size-6 animate-spin text-primary" />
        Signing you in...
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 10, duration: 0.25 }}
          className="mt-2"
        >
          <Button size="sm" variant="link" asChild>
            <Link href={redirectTo}>Taking too long? Click here to redirect.</Link>
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}

function GroupChoiceView({
  account,
  session,
  groups,
  redirectTo,
}: {
  account: AuthCompleteAccount;
  session: NonNullable<AuthCompleteSession>;
  groups: GroupOption[];
  redirectTo: string;
}) {
  const personalName = account?.displayName?.trim() || "Personal Account";

  const continuePersonal = () => {
    rememberContext({ type: "personal", did: session.did, selectedAt: new Date().toISOString() });
    window.location.assign(redirectTo);
  };

  const continueGroup = (group: GroupOption) => {
    const groupDid = normalizeDid(group.groupDid);
    rememberContext({ type: "group", did: groupDid, role: group.role, selectedAt: new Date().toISOString() });
    window.location.assign(groupManageHref(group));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex w-full flex-col items-center pt-8"
    >
      <AppMark showAnimations />
      <h1 className="mt-4 text-center text-xl font-medium">Continue as</h1>
      <p className="text-center text-sm text-muted-foreground">Choose an account for this session.</p>

      <div className="mt-6 w-full space-y-5">
        <section>
          <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">Your account</p>
          <div className="flex flex-col gap-1.5">
            <OptionCard
              did={session.did}
              name={personalName}
              avatarUrl={account?.avatarUrl ?? null}
              sublabel="Personal Account"
              onClick={continuePersonal}
              rounded={cornerClass(0, 1)}
            />
          </div>
        </section>

        {groups.length > 0 ? (
          <section>
            <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">Your groups</p>
            <div className="flex flex-col gap-1.5">
              {groups.map((group, index) => (
                <OptionCard
                  key={group.groupDid}
                  did={normalizeDid(group.groupDid)}
                  name={bestGroupName(group)}
                  avatarUrl={group.avatarUrl}
                  sublabel={`as ${roleLabel(group.role)}`}
                  onClick={() => continueGroup(group)}
                  rounded={cornerClass(index, groups.length)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </motion.div>
  );
}

function ErrorView({ redirectTo }: { redirectTo: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <AppMark showAnimations />
      <h1 className="mt-6 text-xl font-medium">That didn’t work</h1>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        We couldn’t finish signing you in. Try again and we’ll bring you back here.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button asChild variant="secondary" size="sm"><Link href={redirectTo}>Go back</Link></Button>
        <Button asChild size="sm"><Link href="/manage">Try again</Link></Button>
      </div>
    </div>
  );
}

function GroupLookupErrorView({
  message,
  redirectTo,
  onRetry,
}: {
  message: string | null;
  redirectTo: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <AppMark showAnimations />
      <h1 className="mt-6 text-xl font-medium">Signed in, but groups didn’t load</h1>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {message || "We couldn’t load your groups. You can retry or continue with your personal account."}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
        <Button type="button" size="sm" onClick={() => window.location.assign(redirectTo)}>Continue</Button>
      </div>
    </div>
  );
}

export function AuthCompleteClient({
  session,
  account,
  redirectTo,
}: {
  session: AuthCompleteSession;
  account: AuthCompleteAccount;
  redirectTo: string;
}) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [choiceRedirect, setChoiceRedirect] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [status, setStatus] = useState<"loading" | "success" | "choices" | "error" | "group-error">(session ? "loading" : "error");
  const safeRedirect = useMemo(() => sanitizeRedirect(redirectTo), [redirectTo]);

  useEffect(() => {
    if (!session) return;
    const activeSession = session;
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    async function resolveProfiles(memberships: CgsGroupMembership[]): Promise<GroupOption[]> {
      return Promise.all(
        memberships.map(async (rawGroup) => {
          const group = { ...rawGroup, groupDid: normalizeDid(rawGroup.groupDid) };
          const existingName = group.displayName?.trim() || null;
          const existingAvatar = group.avatarUrl ?? null;
          try {
            const res = await fetch(`/api/account/card?did=${encodeURIComponent(group.groupDid)}`, {
              cache: "no-store",
            });
            const card: Partial<ProfileCard> = res.ok ? (await res.json().catch(() => ({}))) as Partial<ProfileCard> : {};
            return {
              ...group,
              displayName: card.displayName?.trim() || existingName,
              avatarUrl: card.avatarUrl ?? existingAvatar,
              handle: card.handle?.trim() || group.handle || null,
            };
          } catch {
            return { ...group, displayName: existingName, avatarUrl: existingAvatar, handle: group.handle ?? null };
          }
        }),
      );
    }

    async function loadGroups() {
      setStatus("loading");
      setGroupError(null);
      setChoiceRedirect(null);
      try {
        const response = await fetch("/api/cgs/groups", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { groups?: CgsGroupMembership[]; error?: string; message?: string };
        if (!response.ok) {
          throw new Error(data.message ?? data.error ?? `Group lookup failed (${response.status}).`);
        }
        if (!Array.isArray(data.groups)) {
          throw new Error("We couldn’t load your groups.");
        }
        const loadedGroups = data.groups;
        const targetIdentifier = redirectGroupIdentifier(safeRedirect);

        if (loadedGroups.length === 0) {
          if (cancelled) return;
          if (targetIdentifier) {
            setGroups([]);
            setChoiceRedirect("/manage");
            setStatus("choices");
            return;
          }
          rememberContext({ type: "personal", did: activeSession.did, selectedAt: new Date().toISOString() });
          setStatus("success");
          redirectTimer = setTimeout(() => {
            window.location.assign(safeRedirect);
          }, REDIRECT_DELAY_MS);
          return;
        }

        const enriched = await resolveProfiles(loadedGroups);
        if (cancelled) return;

        const targetGroup = targetIdentifier
          ? enriched.find((group) => groupMatchesIdentifier(group, targetIdentifier)) ?? null
          : null;
        if (targetGroup) {
          const groupDid = normalizeDid(targetGroup.groupDid);
          rememberContext({ type: "group", did: groupDid, role: targetGroup.role, selectedAt: new Date().toISOString() });
          setStatus("success");
          redirectTimer = setTimeout(() => {
            window.location.assign(groupManageHref(targetGroup));
          }, 250);
          return;
        }

        if (targetIdentifier) setChoiceRedirect("/manage");
        setGroups(enriched);
        setStatus("choices");
      } catch (err) {
        if (cancelled) return;
        setGroupError(err instanceof Error ? err.message : "We couldn’t load your groups.");
        setStatus("group-error");
      }
    }

    void loadGroups();
    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [retryNonce, safeRedirect, session]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12">
      {status === "loading" || status === "success" ? <SigningInView redirectTo={safeRedirect} /> : null}
      {status === "choices" && session ? (
        <GroupChoiceView account={account} session={session} groups={groups} redirectTo={choiceRedirect ?? safeRedirect} />
      ) : null}
      {status === "error" ? <ErrorView redirectTo={safeRedirect} /> : null}
      {status === "group-error" ? (
        <GroupLookupErrorView message={groupError} redirectTo={safeRedirect} onRetry={() => setRetryNonce((value) => value + 1)} />
      ) : null}
    </main>
  );
}
