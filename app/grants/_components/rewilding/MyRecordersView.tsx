"use client";

import { useId, useState } from "react";
import { AudioLinesIcon, PackageIcon, PlusIcon, TruckIcon, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { ModalTitle } from "@/components/ui/modal/modal";
import { ModalPortal, useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";
import { AddRecorderForm } from "./AddRecorderForm";
import type { NewRecorderInput, Recorder, RecorderOrigin } from "./model";
import { countByOrigin } from "./model";
import { Sparkline } from "./Sparkline";

type OriginFilter = "all" | RecorderOrigin;

/**
 * "My recorders" — one list of every recorder on the grant, each row saying
 * where the device came from (the grantee's own vs shipped by GainForest) and
 * what it is doing now. Adding a recorder is a mutation, so every add
 * affordance is gated by `canAddRecorders` — pass it from the viewer's role,
 * never default it on.
 */
export function MyRecordersView({
  recorders,
  canAddRecorders = false,
  onAddRecorder,
}: {
  recorders: readonly Recorder[];
  /** Whether the viewer may register/request recorders on this grant. */
  canAddRecorders?: boolean;
  onAddRecorder?: (input: NewRecorderInput) => void | Promise<void>;
}) {
  const t = useTranslations("marketplace.grants.rewildingDashboard");
  const [filter, setFilter] = useState<OriginFilter>("all");
  const modal = useModal();
  const modalId = `add-recorder-${useId()}`;
  // Remount the form each time the panel opens so a dismissed draft never leaks.
  const [formGeneration, setFormGeneration] = useState(0);

  const counts = countByOrigin(recorders);
  const visible = filter === "all" ? recorders : recorders.filter((r) => r.origin === filter);
  const showAdd = canAddRecorders && Boolean(onAddRecorder);

  const openAddPanel = () => {
    setFormGeneration((generation) => generation + 1);
    modal.pushModal({ id: modalId, dialogWidth: "max-w-md", fullscreenOnMobile: true }, true);
    void modal.show();
  };
  const closeAddPanel = () => {
    void modal.hide().then(() => modal.clear());
  };
  const handleSave = async (input: NewRecorderInput) => {
    await onAddRecorder?.(input);
    closeAddPanel();
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("recorders.title")}</h2>
        {showAdd ? (
          <button
            type="button"
            onClick={openAddPanel}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <PlusIcon className="size-3.5" aria-hidden />
            {t("recorders.add")}
          </button>
        ) : null}
      </header>

      <div role="group" aria-label={t("recorders.filtersLabel")} className="flex flex-wrap gap-1.5">
        <FilterChip
          label={t("recorders.filters.all", { count: recorders.length })}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterChip
          label={t("recorders.filters.owned", { count: counts.owned })}
          active={filter === "owned"}
          onClick={() => setFilter("owned")}
        />
        <FilterChip
          label={t("recorders.filters.shipped", { count: counts.gainforest })}
          active={filter === "gainforest"}
          onClick={() => setFilter("gainforest")}
        />
      </div>

      <ul className="flex flex-col gap-2.5">
        {visible.map((recorder) => (
          <RecorderRow key={recorder.id} recorder={recorder} />
        ))}
        {visible.length === 0 ? (
          <li className="rounded-2xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
            {t("recorders.emptyFilter")}
          </li>
        ) : null}
      </ul>

      {showAdd ? (
        <button
          type="button"
          onClick={openAddPanel}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[1.5px] border-dashed border-border px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
        >
          <span className="text-sm text-muted-foreground">{t("recorders.unknownPrompt")}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3.5 py-1.5 text-xs font-semibold text-foreground">
            <PlusIcon className="size-3" aria-hidden />
            {t("recorders.addShort")}
          </span>
        </button>
      ) : null}

      {showAdd ? (
        <ModalPortal id={modalId}>
          {/* Plain wrapper (not ModalContent): content renders through the portal in
              the caller's tree, so the built-in DialogClose cannot reach the Radix
              context. We render our own close control instead. */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <ModalTitle>{t("addForm.title")}</ModalTitle>
              <button
                type="button"
                onClick={closeAddPanel}
                aria-label={t("addForm.close")}
                className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-4" aria-hidden />
              </button>
            </div>
            <AddRecorderForm key={formGeneration} onSave={handleSave} />
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function RecorderRow({ recorder }: { recorder: Recorder }) {
  const t = useTranslations("marketplace.grants.rewildingDashboard");
  const format = useFormatter();

  const title = recorder.site ? `${recorder.deviceType} · ${recorder.site}` : recorder.deviceType;
  const pendingShipment = recorder.status === "inTransit" || recorder.status === "requested";
  const Icon = pendingShipment ? (recorder.status === "inTransit" ? TruckIcon : PackageIcon) : AudioLinesIcon;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3",
        recorder.status === "inTransit" && "border-amber-500/30 bg-amber-500/[0.06]",
        recorder.status === "requested" && "opacity-75",
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full border px-2 py-px text-[10px] font-medium",
              recorder.origin === "owned" ? "border-primary/40 text-primary" : "border-border text-muted-foreground",
            )}
          >
            {recorder.origin === "owned" ? t("recorders.origin.owned") : t("recorders.origin.shipped")}
          </span>
        </span>
      </span>
      {recorder.status === "recording" || recorder.status === "idle" ? (
        <Sparkline values={recorder.weeklyMinutes} className="h-6 w-16 shrink-0 max-sm:hidden" />
      ) : null}
      <StatusChip recorder={recorder} formatDate={(iso) => format.dateTime(new Date(iso), { day: "numeric", month: "short" })} />
    </li>
  );
}

function StatusChip({ recorder, formatDate }: { recorder: Recorder; formatDate: (iso: string) => string }) {
  const t = useTranslations("marketplace.grants.rewildingDashboard");
  const label =
    recorder.status === "recording"
      ? t("recorders.status.recording")
      : recorder.status === "idle"
        ? t("recorders.status.idle")
        : recorder.status === "inTransit"
          ? recorder.arrivalEstimate
            ? t("recorders.status.arriving", { date: formatDate(recorder.arrivalEstimate) })
            : t("recorders.status.inTransit")
          : t("recorders.status.requested");
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        recorder.status === "recording"
          ? "border-primary/40 text-primary"
          : recorder.status === "inTransit"
            ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
            : "border-border text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
