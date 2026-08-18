"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type RoleId = "visitor" | "member" | "admin" | "owner";
type ActionId = "create" | "editOwn" | "editOther" | "addMember" | "setRole" | "viewAudit";

const ROLES: RoleId[] = ["visitor", "member", "admin", "owner"];
const ACTIONS: ActionId[] = ["create", "editOwn", "editOther", "addMember", "setRole", "viewAudit"];

// Numeric role ranks, mirroring the service's RBAC hierarchy
// (member < admin < owner; a visitor is not on the member list at all).
const RANK: Record<RoleId, number> = { visitor: -1, member: 0, admin: 1, owner: 2 };

// Minimum rank required per action, mirroring the real permission matrix.
const MIN_RANK: Record<ActionId, number> = {
  create: 0,
  editOwn: 0,
  editOther: 1,
  addMember: 1,
  viewAudit: 1,
  setRole: 2,
};

// The wire-level XRPC operation each toy action maps to. These are protocol
// identifiers, not UI copy, so they stay untranslated on purpose.
const WIRE: Record<ActionId, string> = {
  create: "createRecord",
  editOwn: "putRecord",
  editOther: "putRecord",
  addMember: "member.add",
  setRole: "role.set",
  viewAudit: "audit.query",
};

const MAX_LOG = 6;

type Attempt = { id: number; role: RoleId; action: ActionId; ok: boolean };

// The hands-on RBAC demo: pick a role, poke at actions, watch the service
// allow or deny each one, and see every attempt land in a live audit log,
// exactly like the real group service records it.
export function RolePlayground() {
  const t = useTranslations("common.cgs.roles");
  const [role, setRole] = useState<RoleId>("member");
  const [lastTry, setLastTry] = useState<Attempt | null>(null);
  const [log, setLog] = useState<Attempt[]>([]);
  const [nextId, setNextId] = useState(1);

  // Literal keys so the static i18n checker can verify every message exists.
  const roleNames: Record<RoleId, string> = {
    visitor: t("role.visitor.name"),
    member: t("role.member.name"),
    admin: t("role.admin.name"),
    owner: t("role.owner.name"),
  };
  const roleDescs: Record<RoleId, string> = {
    visitor: t("role.visitor.desc"),
    member: t("role.member.desc"),
    admin: t("role.admin.desc"),
    owner: t("role.owner.desc"),
  };
  const actionLabels: Record<ActionId, string> = {
    create: t("action.create"),
    editOwn: t("action.editOwn"),
    editOther: t("action.editOther"),
    addMember: t("action.addMember"),
    setRole: t("action.setRole"),
    viewAudit: t("action.viewAudit"),
  };
  const okTexts: Record<ActionId, string> = {
    create: t("ok.create"),
    editOwn: t("ok.editOwn"),
    editOther: t("ok.editOther"),
    addMember: t("ok.addMember"),
    setRole: t("ok.setRole"),
    viewAudit: t("ok.viewAudit"),
  };
  const noTexts: Partial<Record<ActionId, string>> = {
    editOther: t("no.editOther"),
    addMember: t("no.addMember"),
    setRole: t("no.setRole"),
    viewAudit: t("no.viewAudit"),
  };

  function attempt(action: ActionId) {
    const ok = RANK[role] >= MIN_RANK[action];
    const entry: Attempt = { id: nextId, role, action, ok };
    setNextId((n) => n + 1);
    setLastTry(entry);
    setLog((current) => [entry, ...current].slice(0, MAX_LOG));
  }

  function explain(entry: Attempt): string {
    if (entry.ok) return okTexts[entry.action];
    if (entry.role === "visitor") return t("no.visitor");
    return noTexts[entry.action] ?? t("no.visitor");
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/60">{t("youAre")}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={role === r}
            onClick={() => setRole(r)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              role === r
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 text-muted-foreground hover:text-foreground",
            )}
          >
            {roleNames[r]}
          </button>
        ))}
      </div>
      <p className="mt-2 min-h-[1.25rem] text-[12.5px] leading-relaxed text-muted-foreground">{roleDescs[role]}</p>

      <div className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
        {t("tryAction")}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => attempt(action)}
            className="rounded-xl border border-border/60 px-3 py-2.5 text-left text-[12.5px] leading-snug text-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 active:scale-[0.98]"
          >
            {actionLabels[action]}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-[6.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          {lastTry && (
            <motion.div
              key={lastTry.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className={cn(
                "rounded-xl border px-4 py-3.5",
                lastTry.ok
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-red-500/40 bg-red-500/5",
              )}
            >
              <div className="flex items-center gap-2">
                {lastTry.ok ? (
                  <CheckCircle2Icon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircleIcon className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                )}
                <span
                  className={cn(
                    "text-[13.5px] font-semibold",
                    lastTry.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400",
                  )}
                >
                  {lastTry.ok ? t("allowed") : t("denied")}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground/70">{WIRE[lastTry.action]}</span>
              </div>
              <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{explain(lastTry)}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/70">
            {t("auditTitle")}
          </span>
          {log.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setLog([]);
                setLastTry(null);
              }}
              className="text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("clearLog")}
            </button>
          )}
        </div>

        {log.length === 0 && (
          <p className="m-0 py-3 text-center text-[12.5px] text-muted-foreground/70">{t("auditEmpty")}</p>
        )}
        <ul className="m-0 list-none space-y-1 p-0">
          <AnimatePresence initial={false}>
            {log.map((entry) => (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-baseline gap-2 font-mono text-[11px] text-muted-foreground"
              >
                <span className="text-foreground/80">{roleNames[entry.role]}</span>
                <span className="text-muted-foreground/50">·</span>
                <span>{WIRE[entry.action]}</span>
                <span className="text-muted-foreground/50">·</span>
                <span className={entry.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                  {entry.ok ? t("auditPermitted") : t("auditDenied")}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
