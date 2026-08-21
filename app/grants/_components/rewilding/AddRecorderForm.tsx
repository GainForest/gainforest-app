"use client";

import { useId, useState } from "react";
import { MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { NewRecorderInput, RecorderCondition } from "./model";
import { RECORDER_CONDITIONS, RECORDER_DEVICE_TYPES } from "./model";

const OTHER_DEVICE = "__other__";

/**
 * The add-a-recorder panel: register a device the grantee already owns, or
 * request one from GainForest. Pure form — persistence happens in `onSave`,
 * supplied by the caller (mock in the `/_test` registry, a real write later).
 */
export function AddRecorderForm({ onSave }: { onSave: (input: NewRecorderInput) => void | Promise<void> }) {
  const t = useTranslations("marketplace.grants.rewildingDashboard.addForm");
  const [source, setSource] = useState<NewRecorderInput["source"]>("owned");
  const [deviceChoice, setDeviceChoice] = useState<string>(RECORDER_DEVICE_TYPES[0]);
  const [otherDevice, setOtherDevice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<RecorderCondition>("fieldWorking");
  const [site, setSite] = useState("");
  const [saving, setSaving] = useState(false);
  const otherDeviceInputId = useId();
  const quantityInputId = useId();
  const siteInputId = useId();

  const deviceType = deviceChoice === OTHER_DEVICE ? otherDevice.trim() : deviceChoice;
  const valid = deviceType.length > 0 && Number.isInteger(quantity) && quantity >= 1 && quantity <= 20;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave({ source, deviceType, quantity, condition, site: site.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {t("originLegend")}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <OriginOption
            title={t("originOwned")}
            hint={t("originOwnedHint")}
            selected={source === "owned"}
            onSelect={() => setSource("owned")}
          />
          <OriginOption
            title={t("originRequest")}
            hint={t("originRequestHint")}
            selected={source === "request"}
            onSelect={() => setSource("request")}
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {t("deviceType")}
        </span>
        <div role="radiogroup" aria-label={t("deviceType")} className="flex flex-wrap gap-1.5">
          {[...RECORDER_DEVICE_TYPES, OTHER_DEVICE].map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={deviceChoice === choice}
              onClick={() => setDeviceChoice(choice)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                deviceChoice === choice
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {choice === OTHER_DEVICE ? t("deviceOther") : choice}
            </button>
          ))}
        </div>
        {deviceChoice === OTHER_DEVICE ? (
          <div>
            <label htmlFor={otherDeviceInputId} className="sr-only">
              {t("deviceOtherLabel")}
            </label>
            <Input
              id={otherDeviceInputId}
              value={otherDevice}
              onChange={(event) => setOtherDevice(event.target.value)}
              placeholder={t("deviceOtherPlaceholder")}
              autoFocus
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <div className="flex flex-col gap-2">
          <label
            htmlFor={quantityInputId}
            className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground"
          >
            {t("quantity")}
          </label>
          <Input
            id={quantityInputId}
            type="number"
            min={1}
            max={20}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </div>
        {source === "owned" ? (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              {t("condition")}
            </span>
            <div role="radiogroup" aria-label={t("condition")} className="flex flex-wrap gap-1.5">
              {RECORDER_CONDITIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={condition === option}
                  onClick={() => setCondition(option)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    condition === option
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t(`conditionOptions.${option}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="self-end pb-1 text-xs leading-5 text-muted-foreground">{t("requestNote")}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={siteInputId}
          className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground"
        >
          {t("location")}
        </label>
        <Input
          id={siteInputId}
          value={site}
          onChange={(event) => setSite(event.target.value)}
          placeholder={t("locationPlaceholder")}
        />
        <div className="flex h-16 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground">
          <MapPinIcon className="size-3.5" aria-hidden />
          {t("mapComingSoon")}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!valid || saving}
          className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {source === "owned" ? t("save") : t("saveRequest")}
        </button>
        <span className="text-xs text-muted-foreground">{t("milestoneNote")}</span>
      </div>
    </form>
  );
}

function OriginOption({
  title,
  hint,
  selected,
  onSelect,
}: {
  title: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-3 text-start transition-colors",
        selected ? "border-primary/60 bg-primary/[0.06]" : "border-border hover:bg-muted",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "size-3 shrink-0 rounded-full border",
            selected ? "border-primary bg-primary" : "border-border bg-background",
          )}
        />
        <span className="text-sm font-medium text-foreground">{title}</span>
      </span>
      <span className="text-xs leading-4 text-muted-foreground">{hint}</span>
    </button>
  );
}
