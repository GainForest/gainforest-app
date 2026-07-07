"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_STATUSES,
  STATUS_TONES,
  categoryIcon,
  equipmentDetailPath,
  listEquipmentAcross,
  type EquipmentCategory,
  type EquipmentItem,
  type EquipmentStatus,
  type EquipmentStatusTone,
} from "@/app/_lib/equipment";
import { EquipmentEditor, NativeSelect, type EquipmentEditorState } from "./EquipmentEditor";
import { monogram, resolveDidProfile, type DidProfile } from "@/app/_lib/did-profile";
import { formatRelative, shortDid } from "@/app/_lib/format";
import { accountEquipmentPath } from "../_lib/account-route";

const TONE_BADGE: Record<EquipmentStatusTone, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  down: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export type EquipmentSectionProps = {
  /** Repos to read equipment from (one for a personal profile, the whole team for an organization). */
  repos: string[];
  /** Signed-in viewer's DID; rows in their repo become editable. */
  viewerDid: string | null;
  /** Whether the viewer may add new units (writes to their own repo). */
  canAdd: boolean;
  variant: "personal" | "organization";
  /** Organization tab only: the team list could not be fully resolved. */
  membersUnavailable?: boolean;
};

export function EquipmentSection({
  repos,
  viewerDid,
  canAdd,
  variant,
  membersUnavailable = false,
}: EquipmentSectionProps) {
  const t = useTranslations("common.equipment");
  const isOrg = variant === "organization";

  const [items, setItems] = useState<EquipmentItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editor, setEditor] = useState<EquipmentEditorState | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<EquipmentCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "all">("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");

  const reposKey = [...new Set(repos)].sort().join(",");
  const profiles = useDidProfiles(items, isOrg);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoadError(false);
    try {
      const list = await listEquipmentAcross(reposKey ? reposKey.split(",") : [], {
        signal,
        onProgress: (running) => {
          if (!signal?.aborted) setItems(running);
        },
      });
      if (!signal?.aborted) setItems(list);
    } catch (err) {
      if (signal?.aborted || (err as Error).name === "AbortError") return;
      setItems([]);
      setLoadError(true);
    }
  }, [reposKey]);

  useEffect(() => {
    const ctrl = new AbortController();
    setItems(null);
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  // Distinct repo owners (team members), for the member filter on org tabs.
  const owners = useMemo(() => {
    if (!isOrg) return [];
    const counts = new Map<string, number>();
    for (const it of items ?? []) counts.set(it.did, (counts.get(it.did) ?? 0) + 1);
    return [...counts.entries()]
      .map(([did, count]) => ({ did, count, label: ownerLabel(did, profiles[did]) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items, profiles, isOrg]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (categoryFilter !== "all" && it.category !== categoryFilter) return false;
      if (statusFilter !== "all" && it.status !== statusFilter) return false;
      if (memberFilter !== "all" && it.did !== memberFilter) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.assetId.toLowerCase().includes(q) ||
        (it.currentOwner ?? "").toLowerCase().includes(q) ||
        (it.projectSite ?? "").toLowerCase().includes(q) ||
        (isOrg && ownerLabel(it.did, profiles[it.did]).toLowerCase().includes(q))
      );
    });
  }, [items, query, categoryFilter, statusFilter, memberFilter, profiles, isOrg]);

  const hasItems = (items?.length ?? 0) > 0;

  return (
    <section className="mt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-prose text-sm text-muted-foreground">
          {isOrg ? t("orgIntro") : t("personalIntro")}
        </p>
        {canAdd ? (
          <Button size="sm" onClick={() => setEditor({ mode: "new" })} className="shrink-0">
            <PlusIcon />
            {t("addEquipment")}
          </Button>
        ) : null}
      </div>

      {membersUnavailable ? (
        <p className="mt-3 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          {t("membersUnavailable")}
        </p>
      ) : null}

      {hasItems ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="sm:max-w-[240px]"
          />
          <div className="flex flex-wrap gap-2">
            {isOrg && owners.length > 1 ? (
              <FilterSelect
                value={memberFilter}
                onChange={setMemberFilter}
                ariaLabel={t("table.member")}
                options={[
                  { value: "all", label: t("allMembers") },
                  ...owners.map((o) => ({ value: o.did, label: `${o.label} (${o.count})` })),
                ]}
              />
            ) : null}
            <FilterSelect
              value={categoryFilter}
              onChange={(v) => setCategoryFilter(v as EquipmentCategory | "all")}
              ariaLabel={t("table.type")}
              options={[
                { value: "all", label: t("allTypes") },
                ...EQUIPMENT_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) })),
              ]}
            />
            <FilterSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as EquipmentStatus | "all")}
              ariaLabel={t("table.status")}
              options={[
                { value: "all", label: t("anyStatus") },
                ...EQUIPMENT_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) })),
              ]}
            />
          </div>
        </div>
      ) : null}

      {items === null ? (
        <LoadingRows />
      ) : loadError ? (
        <Notice title={t("loadErrorTitle")} body={t("loadError")} />
      ) : items.length === 0 ? (
        canAdd ? (
          <Notice title={t("emptyTitleOwner")} body={t("emptyBodyOwner")} />
        ) : (
          <Notice title={t("emptyTitle")} body={isOrg ? t("emptyBodyOrg") : t("emptyBodyPersonal")} />
        )
      ) : filtered.length === 0 ? (
        <Notice title={t("emptyTitle")} body={t("noMatches")} />
      ) : (
        <>
          <EquipmentTable
            rows={filtered}
            profiles={profiles}
            viewerDid={viewerDid}
            showMember={isOrg}
            onEdit={(item) => setEditor({ mode: "edit", item })}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {filtered.length === items.length
              ? t("unitCount", { count: items.length })
              : t("showingFiltered", { shown: filtered.length, total: items.length })}
          </p>
        </>
      )}

      {editor ? (
        <EquipmentEditor
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await reload();
          }}
        />
      ) : null}
    </section>
  );
}

// ── Owner profile resolution (org tab) ──────────────────────────────────────

function useDidProfiles(items: EquipmentItem[] | null, enabled: boolean): Record<string, DidProfile> {
  const [profiles, setProfiles] = useState<Record<string, DidProfile>>({});
  const key = enabled && items ? [...new Set(items.map((it) => it.did))].sort().join(",") : "";
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    for (const did of key.split(",")) {
      resolveDidProfile(did)
        .then((p) => {
          if (!cancelled) setProfiles((prev) => (prev[did] ? prev : { ...prev, [did]: p }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [key]);
  return profiles;
}

function ownerLabel(did: string, profile?: DidProfile): string {
  return profile?.displayName || profile?.handle || shortDid(did);
}

// ── Table ────────────────────────────────────────────────────────────────────

function EquipmentTable({
  rows,
  profiles,
  viewerDid,
  showMember,
  onEdit,
}: {
  rows: EquipmentItem[];
  profiles: Record<string, DidProfile>;
  viewerDid: string | null;
  showMember: boolean;
  onEdit: (item: EquipmentItem) => void;
}) {
  const t = useTranslations("common.equipment");
  const anyEditable = viewerDid !== null && rows.some((it) => it.did === viewerDid);

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-background">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5">{t("table.equipment")}</th>
            <th className="px-3 py-2.5">{t("table.type")}</th>
            <th className="px-3 py-2.5">{t("table.status")}</th>
            <th className="px-3 py-2.5">{t("table.holder")}</th>
            <th className="px-3 py-2.5">{t("table.site")}</th>
            {showMember ? <th className="px-3 py-2.5">{t("table.member")}</th> : null}
            <th className="px-3 py-2.5 text-right">{t("table.updated")}</th>
            {anyEditable ? <th className="w-[1%] px-3 py-2.5" aria-label={t("edit")} /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((it) => {
            const mine = viewerDid !== null && it.did === viewerDid;
            return (
              <tr key={it.uri} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                <td className="px-3 py-3">
                  <Link
                    href={equipmentDetailPath(it.did, it.rkey)}
                    className="group flex min-w-0 items-center gap-2.5"
                  >
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-base">
                      {categoryIcon(it.category)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground group-hover:underline">{it.name}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {it.assetId || t("table.noId")}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-sm text-foreground/80">
                  {t(`categories.${it.category}`)}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      TONE_BADGE[STATUS_TONES[it.status]],
                    )}
                  >
                    {t(`statuses.${it.status}`)}
                  </span>
                </td>
                <td className="max-w-[160px] truncate px-3 py-3 text-sm text-foreground/80">
                  {it.currentOwner ?? "—"}
                </td>
                <td className="max-w-[180px] truncate px-3 py-3 text-sm text-foreground/80">
                  {it.projectSite ?? "—"}
                </td>
                {showMember ? (
                  <td className="px-3 py-3">
                    <MemberBadge did={it.did} profile={profiles[it.did]} mine={mine} youLabel={t("you")} />
                  </td>
                ) : null}
                <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-muted-foreground">
                  {formatRelative(it.updatedAt)}
                </td>
                {anyEditable ? (
                  <td className="px-3 py-3 text-right">
                    {mine ? (
                      <Button variant="outline" size="xs" onClick={() => onEdit(it)}>
                        {t("edit")}
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MemberBadge({
  did,
  profile,
  mine,
  youLabel,
}: {
  did: string;
  profile?: DidProfile;
  mine: boolean;
  youLabel: string;
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const m = monogram(profile?.handle ?? null, did);
  const avatar = (!avatarFailed && profile?.avatar) || null;
  return (
    <Link href={accountEquipmentPath(did)} className="group inline-flex max-w-[180px] items-center gap-2">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary PDS/CDN hosts
        <img
          src={avatar}
          alt=""
          onError={() => setAvatarFailed(true)}
          className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-border"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold text-white/95"
          style={{ backgroundColor: m.bg }}
        >
          {m.char}
        </span>
      )}
      <span className="truncate text-xs text-foreground/80 group-hover:underline">
        {ownerLabel(did, profile)}
      </span>
      {mine ? (
        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
          {youLabel}
        </span>
      ) : null}
    </Link>
  );
}


function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <NativeSelect
      value={value}
      onChange={onChange}
      options={options}
      ariaLabel={ariaLabel}
      className="w-auto max-w-[200px]"
    />
  );
}

function LoadingRows() {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 last:border-0">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-[420px] text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
