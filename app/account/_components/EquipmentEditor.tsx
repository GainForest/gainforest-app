"use client";

/**
 * The equipment add/edit drawer, shared between the profile Equipment tab
 * and the equipment detail page. Writes to the signed-in user's own repo
 * through the manage proxy.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_STATUSES,
  categoryIcon,
  createEquipment,
  deleteEquipment,
  updateEquipment,
  type EquipmentCategory,
  type EquipmentDraft,
  type EquipmentItem,
  type EquipmentStatus,
} from "@/app/_lib/equipment";

export type EquipmentEditorState = { mode: "new" } | { mode: "edit"; item: EquipmentItem };

function blankDraft(): EquipmentDraft {
  return {
    assetId: "",
    name: "",
    category: "audiomoth",
    status: "storage",
    currentOwner: "",
    projectSite: "",
    acquiredAt: "",
    notes: "",
  };
}

function itemToDraft(item: EquipmentItem): EquipmentDraft {
  return {
    assetId: item.assetId,
    name: item.name,
    category: item.category,
    status: item.status,
    currentOwner: item.currentOwner ?? "",
    projectSite: item.projectSite ?? "",
    acquiredAt: item.acquiredAt ?? "",
    notes: item.notes ?? "",
    geo: item.geo ?? null,
  };
}

export function EquipmentEditor({
  editor,
  onClose,
  onSaved,
  onDeleted,
}: {
  editor: EquipmentEditorState;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  /** Called after a successful delete; defaults to `onSaved`. */
  onDeleted?: () => void | Promise<void>;
}) {
  const t = useTranslations("common.equipment");
  const isEdit = editor.mode === "edit";
  const [draft, setDraft] = useState<EquipmentDraft>(isEdit ? itemToDraft(editor.item) : blankDraft());
  const [lat, setLat] = useState(isEdit && editor.item.geo ? String(editor.item.geo.lat) : "");
  const [lon, setLon] = useState(isEdit && editor.item.geo ? String(editor.item.geo.lon) : "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving || deleting;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [onClose, busy]);

  const patch = (p: Partial<EquipmentDraft>) => setDraft((d) => ({ ...d, ...p }));

  function buildGeo(): EquipmentDraft["geo"] {
    const la = lat.trim();
    const lo = lon.trim();
    if (!la && !lo) return null;
    const latN = Number(la);
    const lonN = Number(lo);
    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) {
      throw new Error(t("errors.invalidCoordinates"));
    }
    if (latN < -90 || latN > 90 || lonN < -180 || lonN > 180) {
      throw new Error(t("errors.coordinatesRange"));
    }
    return { lat: latN, lon: lonN };
  }

  async function save() {
    setError(null);
    if (!draft.assetId.trim() && !draft.name.trim()) {
      setError(t("errors.needIdOrName"));
      return;
    }
    let geo: EquipmentDraft["geo"];
    try {
      geo = buildGeo();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.invalidCoordinates"));
      return;
    }
    setSaving(true);
    try {
      const payload: EquipmentDraft = { ...draft, geo };
      if (isEdit) await updateEquipment(editor.item, payload);
      else await createEquipment(payload);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("errors.saveFailed"));
      setSaving(false);
    }
  }

  async function remove() {
    if (!isEdit) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteEquipment(editor.item);
      await (onDeleted ?? onSaved)();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("errors.deleteFailed"));
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" onClick={() => !busy && onClose()} />
      <div className="relative flex h-full w-full max-w-[460px] flex-col overflow-y-auto bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? t("editEquipment") : t("addEquipment")}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => !busy && onClose()}
            aria-label={t("form.close")}
          >
            <XIcon />
          </Button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-6">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("form.name")}>
              <Input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder={t("form.namePlaceholder")}
              />
            </Field>
            <Field label={t("form.assetId")}>
              <Input
                value={draft.assetId}
                onChange={(e) => patch({ assetId: e.target.value })}
                className="font-mono"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("form.type")}>
              <NativeSelect
                value={draft.category}
                onChange={(v) => patch({ category: v as EquipmentCategory })}
                options={EQUIPMENT_CATEGORIES.map((c) => ({
                  value: c,
                  label: `${categoryIcon(c)} ${t(`categories.${c}`)}`,
                }))}
              />
            </Field>
            <Field label={t("form.status")}>
              <NativeSelect
                value={draft.status}
                onChange={(v) => patch({ status: v as EquipmentStatus })}
                options={EQUIPMENT_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))}
              />
            </Field>
          </div>

          <Field label={t("form.holder")}>
            <Input
              value={draft.currentOwner ?? ""}
              onChange={(e) => patch({ currentOwner: e.target.value })}
              placeholder={t("form.holderPlaceholder")}
            />
          </Field>
          <Field label={t("form.site")}>
            <Input
              value={draft.projectSite ?? ""}
              onChange={(e) => patch({ projectSite: e.target.value })}
              placeholder={t("form.sitePlaceholder")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("form.latitude")}>
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-1.234" className="font-mono" />
            </Field>
            <Field label={t("form.longitude")}>
              <Input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-77.891" className="font-mono" />
            </Field>
          </div>

          <Field label={t("form.acquired")}>
            <Input type="date" value={draft.acquiredAt ?? ""} onChange={(e) => patch({ acquiredAt: e.target.value })} />
          </Field>

          <Field label={t("form.notes")}>
            <textarea
              value={draft.notes ?? ""}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={3}
              placeholder={t("form.notesPlaceholder")}
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
          </Field>

          {error ? (
            <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-border bg-background/95 px-5 py-4 backdrop-blur-xl">
          {isEdit ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
                  {deleting ? <Loader2Icon className="animate-spin" /> : null}
                  {deleting ? t("form.deleting") : t("form.confirmDelete")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  {t("form.cancel")}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                {t("form.delete")}
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => !busy && onClose()} disabled={busy}>
              {t("form.cancel")}
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {saving ? <Loader2Icon className="animate-spin" /> : null}
              {saving ? t("form.saving") : isEdit ? t("form.save") : t("form.add")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small building blocks ───────────────────────────────────────────────────

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function NativeSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={cn(
        "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] dark:bg-input/30",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
