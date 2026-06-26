"use client";

import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  PlusIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { groupManageBasePath } from "@/lib/links";
import { cn } from "@/lib/utils";
import {
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
  useManagePathContextSync,
  type ActiveAccountContext,
  type SwitcherGroup,
} from "../_lib/account-switcher";

function roleLabel(role: SwitcherGroup["role"]): string {
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";
}

function groupName(group: SwitcherGroup): string {
  return group.displayName?.trim() || "Organization account";
}

/** Renders children into document.body so the flyout escapes the sidebar's
 *  `overflow-hidden`, which otherwise clips it when the sidebar is collapsed. */
function FlyoutPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function AccountAvatar({ avatarUrl, label, icon }: { avatarUrl?: string | null; label: string; icon: React.ReactNode }) {
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
      {avatarUrl ? <Image src={avatarUrl} alt={label} fill unoptimized sizes="32px" className="object-cover" /> : icon}
    </span>
  );
}

export function ManageContextSwitcher({
  sessionDid,
  profileName,
  collapsed = false,
}: {
  sessionDid: string;
  profileName?: string | null;
  collapsed?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const { personal, groups, status, reload } = useAccountList(sessionDid);
  const [activeContext, setActiveContext] = useActiveAccountContext(sessionDid);

  useManagePathContextSync({ pathname, sessionDid, groups, activeContext, setActiveContext });

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Keep the portaled flyout anchored to the trigger across scroll/resize.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 6, left: rect.left, width: collapsed ? 256 : rect.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, collapsed]);

  const activeGroup =
    activeContext.type === "group" ? groups.find((group) => group.groupDid === activeContext.did) ?? null : null;
  const personalName = personal?.displayName?.trim() || profileName?.trim() || "Personal account";

  const triggerLabel = activeContext.type === "group" ? activeGroup ? groupName(activeGroup) : "Organization" : personalName;
  const triggerSubtitle = activeContext.type === "group" ? (activeGroup ? roleLabel(activeGroup.role) : "Organization") : "Personal account";
  const triggerAvatar = activeContext.type === "group" ? activeGroup?.avatarUrl : personal?.avatarUrl;
  const triggerIcon = activeContext.type === "group" ? <UsersIcon className="size-4" /> : <UserIcon className="size-4" />;

  const select = (next: ActiveAccountContext, href: string) => {
    setActiveContext(next);
    setOpen(false);
    router.push(href);
  };

  const isPersonalActive = activeContext.type === "personal";

  return (
    <div ref={containerRef} className={cn("relative", collapsed && "flex justify-center")}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={collapsed ? triggerLabel : undefined}
        title={collapsed ? triggerLabel : undefined}
        className={cn(
          "flex items-center rounded-xl border border-border bg-background/70 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          collapsed ? "justify-center p-1.5" : "w-full gap-2.5 px-2.5 py-2 text-left",
        )}
      >
        <AccountAvatar avatarUrl={triggerAvatar} label={triggerLabel} icon={triggerIcon} />
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{triggerLabel}</span>
              <span className="block truncate text-xs text-muted-foreground">{triggerSubtitle}</span>
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && menuPosition ? (
          <FlyoutPortal key="manage-context-switcher-flyout">
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.14, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
            className="z-50 overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl shadow-black/10 backdrop-blur-sm"
          >
            <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-1.5">
              <button
                type="button"
                onClick={() => select({ type: "personal", did: sessionDid }, "/manage")}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <AccountAvatar avatarUrl={personal?.avatarUrl} label={personalName} icon={<UserIcon className="size-4" />} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{personalName}</span>
                  <span className="block truncate text-xs text-muted-foreground">Personal account</span>
                </span>
                {isPersonalActive ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
              </button>

              {groups.length > 0 ? <div className="my-1 h-px bg-border/60" /> : null}

              {groups.map((group) => {
                const active = activeContext.type === "group" && activeContext.did === group.groupDid;
                return (
                  <button
                    key={group.groupDid}
                    type="button"
                    onClick={() =>
                      select(
                        { type: "group", did: group.groupDid, identifier: switcherGroupIdentifier(group), role: group.role },
                        groupManageBasePath(switcherGroupIdentifier(group)),
                      )
                    }
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <AccountAvatar avatarUrl={group.avatarUrl} label={groupName(group)} icon={<UsersIcon className="size-4" />} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{groupName(group)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{roleLabel(group.role)}</span>
                    </span>
                    {active ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}

              {status === "loading" && groups.length === 0 ? (
                <div className="flex items-center gap-2 px-2 py-2.5 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin text-primary" /> Loading…
                </div>
              ) : null}

              {status === "error" ? (
                <button
                  type="button"
                  onClick={() => void reload()}
                  className="w-full rounded-lg px-2 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
                >
                  Couldn’t load organizations. Try again
                </button>
              ) : null}

              <div className="my-1 h-px bg-border/60" />

              <Link
                href="/manage/organizations"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <Building2Icon className="size-4 shrink-0 text-muted-foreground" />
                My Organizations
              </Link>
              <Link
                href="/manage?mode=onboard-org"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <PlusIcon className="size-4 shrink-0 text-muted-foreground" />
                Create an organization
              </Link>
            </div>
          </motion.div>
          </FlyoutPortal>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
