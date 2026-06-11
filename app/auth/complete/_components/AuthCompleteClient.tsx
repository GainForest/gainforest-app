"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Loader2Icon, UserIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shortDid } from "@/app/_lib/format";
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

function OptionCard({
  Icon,
  title,
  description,
  onClick,
}: {
  Icon: LucideIcon;
  title: ReactNode;
  description: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      className="group relative h-auto w-full flex-col items-start justify-between gap-1 rounded-xl py-3.5 shadow-none hover:bg-primary/10"
    >
      <span
        className="flex items-center gap-1.5 text-2xl italic"
        style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
      >
        <Icon className="size-5 text-primary opacity-50" />
        {title}
      </span>
      <span className="text-left text-sm text-muted-foreground text-pretty">{description}</span>
      <span className="absolute right-3 top-3 -translate-x-2 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100">
        <ChevronRight className="size-5" />
      </span>
    </Button>
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
  groups: CgsGroupMembership[];
  redirectTo: string;
}) {
  const personalLabel = account?.displayName || session.handle || shortDid(session.did);

  const continuePersonal = () => {
    rememberContext({ type: "personal", did: session.did, selectedAt: new Date().toISOString() });
    window.location.assign(redirectTo);
  };

  const continueGroup = (group: CgsGroupMembership) => {
    rememberContext({ type: "group", did: group.groupDid, role: group.role, selectedAt: new Date().toISOString() });
    window.location.assign(`/manage/groups/${encodeURIComponent(group.groupDid)}`);
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
      <div className="mt-5 grid w-full gap-2">
        <OptionCard Icon={UserIcon} title={personalLabel} description="Your personal account" onClick={continuePersonal} />
        {groups.map((group) => (
          <OptionCard
            key={group.groupDid}
            Icon={UsersIcon}
            title={<span className="font-mono text-base not-italic">{shortDid(group.groupDid)}</span>}
            description={`${roleLabel(group.role)} · Certified Group`}
            onClick={() => continueGroup(group)}
          />
        ))}
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

export function AuthCompleteClient({
  session,
  account,
  redirectTo,
}: {
  session: AuthCompleteSession;
  account: AuthCompleteAccount;
  redirectTo: string;
}) {
  const [groups, setGroups] = useState<CgsGroupMembership[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "choices" | "error">(session ? "loading" : "error");
  const safeRedirect = useMemo(() => sanitizeRedirect(redirectTo), [redirectTo]);

  useEffect(() => {
    if (!session) return;
    const activeSession = session;
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadGroups() {
      setStatus("loading");
      try {
        const response = await fetch("/api/cgs/groups", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { groups?: CgsGroupMembership[] };
        const loadedGroups = response.ok && Array.isArray(data.groups) ? data.groups : [];
        if (cancelled) return;
        setGroups(loadedGroups);

        if (loadedGroups.length === 0) {
          rememberContext({ type: "personal", did: activeSession.did, selectedAt: new Date().toISOString() });
          setStatus("success");
          redirectTimer = setTimeout(() => {
            window.location.assign(safeRedirect);
          }, REDIRECT_DELAY_MS);
        } else {
          setStatus("choices");
        }
      } catch {
        if (cancelled) return;
        rememberContext({ type: "personal", did: activeSession.did, selectedAt: new Date().toISOString() });
        setStatus("success");
        redirectTimer = setTimeout(() => {
          window.location.assign(safeRedirect);
        }, REDIRECT_DELAY_MS);
      }
    }

    void loadGroups();
    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [safeRedirect, session]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12">
      {status === "loading" || status === "success" ? <SigningInView redirectTo={safeRedirect} /> : null}
      {status === "choices" && session ? (
        <GroupChoiceView account={account} session={session} groups={groups} redirectTo={safeRedirect} />
      ) : null}
      {status === "error" ? <ErrorView redirectTo={safeRedirect} /> : null}
    </main>
  );
}
