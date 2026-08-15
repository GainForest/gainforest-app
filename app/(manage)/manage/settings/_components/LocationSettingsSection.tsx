"use client";

/**
 * Settings-page entry for an account's declared location — the same control
 * as the profile hero's location chip, surfaced where the ticket expects it.
 * Works for organizations (location on the org record) and personal accounts
 * (location on `app.gainforest.actor.location/self`) alike.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, MapPinIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { countryFlag } from "@/app/_lib/format";
import { getCountry } from "@/app/_lib/countries";
import {
  displayLocationFromChoice,
  saveOrganizationLocation,
  savePersonalLocation,
  type OrgLocationChoice,
} from "../../_lib/org-location";
import { LocationEditorModal, LocationEditorModalId } from "../../_modals/LocationEditorModal";
import type { ManageTarget } from "@/lib/links";

function countryName(code: string): string {
  return getCountry(code)?.name ?? code;
}

export function LocationSettingsSection({
  target,
  accountKind,
  initial,
  disabledReason,
}: {
  target: ManageTarget;
  accountKind: "organization" | "user";
  /** The saved location, as the account data reads it. */
  initial: { name: string | null; country: string | null };
  /** Set when the viewer may not edit the account — disables the control. */
  disabledReason: string | null;
}) {
  const t = useTranslations("common.settings.location");
  const modal = useModal();
  const router = useRouter();
  const [current, setCurrent] = useState<{ name: string | null; country: string | null }>(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = current.country
    ? `${countryFlag(current.country)} ${countryName(current.country)}`.trim()
    : current.name;

  const save = async (choice: OrgLocationChoice | null) => {
    setIsSaving(true);
    setError(null);
    const writeOptions = target.kind === "group" ? { repo: target.did } : undefined;
    try {
      if (accountKind === "organization") {
        await saveOrganizationLocation(target.did, choice, writeOptions);
      } else {
        await savePersonalLocation(choice, writeOptions);
      }
      setCurrent(choice ? displayLocationFromChoice(choice) : { name: null, country: null });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
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
            accountKind={accountKind === "organization" ? "organization" : "user"}
            current={label ? { name: label, countryCode: current.country } : null}
            onConfirm={(choice) => void save(choice)}
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
              {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
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
