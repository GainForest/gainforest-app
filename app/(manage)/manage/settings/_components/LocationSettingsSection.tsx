"use client";

/**
 * Settings-page entry for an organization's declared location — the same
 * control as the profile hero's location chip, surfaced where the ticket
 * expects it. Organizations only: people have no location field yet (the
 * shared profile lexicon has no slot for one — see ECO-878).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, MapPinIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { countryFlag } from "@/app/_lib/format";
import { countryCodeFromLocationLabel, getCountry } from "@/app/_lib/countries";
import {
  displayLocationFromChoice,
  saveOrganizationLocation,
  type OrgLocationChoice,
} from "../../_lib/org-location";
import { LocationEditorModal, LocationEditorModalId } from "../../_modals/LocationEditorModal";
import type { ManageTarget } from "@/lib/links";

function countryName(code: string): string {
  return getCountry(code)?.name ?? code;
}

type SavedLocation = {
  name: string | null;
  country: string | null;
  latitude?: number | null;
  longitude?: number | null;
  approximate?: boolean;
};

export function LocationSettingsSection({
  target,
  initial,
  disabledReason,
}: {
  target: ManageTarget;
  /** The saved location, as the account data reads it. */
  initial: SavedLocation;
  /** Set when the viewer may not edit the account — disables the control. */
  disabledReason: string | null;
}) {
  const t = useTranslations("common.settings.location");
  const modal = useModal();
  const router = useRouter();
  const [current, setCurrent] = useState<SavedLocation>(initial);
  const [isSaving, setIsSaving] = useState(false);

  // A place name like "Zurich, Switzerland" earns its country's flag too.
  const placeFlag = getCountry(countryCodeFromLocationLabel(current.name))?.emoji;
  const label = current.country
    ? `${countryFlag(current.country)} ${countryName(current.country)}`.trim()
    : current.name
      ? `${placeFlag ?? ""} ${current.name}`.trim()
      : null;

  // Errors propagate to the location editor, which stays open on failure —
  // it owns the saving display, so it owns the failure display too.
  const save = async (choice: OrgLocationChoice | null) => {
    setIsSaving(true);
    const writeOptions = target.kind === "group" ? { repo: target.did } : undefined;
    try {
      await saveOrganizationLocation(choice, writeOptions);
      setCurrent(
        choice
          ? {
              ...displayLocationFromChoice(choice),
              latitude: choice.place.latitude,
              longitude: choice.place.longitude,
              approximate: choice.approximate,
            }
          : { name: null, country: null },
      );
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const openEditor = () => {
    modal.pushModal(
      {
        id: LocationEditorModalId,
        content: (
          <LocationEditorModal
            current={
              label
                ? {
                    // The clean record name — the flag stays on the settings row.
                    name: current.country ? countryName(current.country) : current.name,
                    countryCode: current.country,
                    latitude: current.latitude ?? null,
                    longitude: current.longitude ?? null,
                    approximate: current.approximate ?? false,
                  }
                : null
            }
            onConfirm={(choice) => save(choice)}
          />
        ),
      },
      true,
    );
    void modal.show();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPinIcon className="h-4 w-4 text-foreground/70" />
        <h2 className="text-sm font-medium">{t("title")}</h2>
      </div>

      <div className="bg-muted rounded-xl p-1 w-full">
        <div className="flex flex-col gap-1 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={label ? "text-base font-medium text-foreground break-words" : "text-base text-muted-foreground/70"}>
                {label ?? t("notSet")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
              {disabledReason ? <p className="mt-1 text-xs text-muted-foreground">{disabledReason}</p> : null}
            </div>
            <Button size="sm" variant="ghost" onClick={openEditor} disabled={isSaving || Boolean(disabledReason)} className="shrink-0">
              {isSaving ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <PencilIcon className="h-3.5 w-3.5" />}
              {t("edit")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
