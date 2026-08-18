"use client";

/**
 * Owner-only actions on the equipment detail page: edit (and delete, inside
 * the editor drawer). After a save the server page is refreshed; after a
 * delete the owner is sent back to their equipment list.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import type { EquipmentItem } from "@/app/_lib/equipment";
import { EquipmentEditor } from "@/app/account/_components/EquipmentEditor";
import { accountEquipmentPath } from "@/app/account/_lib/account-route";

export function EquipmentDetailActions({ item, ownerDid }: { item: EquipmentItem; ownerDid: string }) {
  const t = useTranslations("common.equipment");
  const router = useRouter();
  const modal = useModal();

  /** Edit through the shared modal, so it matches every other dialog's backdrop
   *  and chrome. Saving refreshes the page; delete returns to the list. */
  const openEditor = () => {
    modal.pushModal(
      {
        id: `equipment-editor-${item.rkey}`,
        dialogWidth: "max-w-lg w-[calc(100%-2rem)]",
        fullscreenOnMobile: true,
        content: (
          <EquipmentEditor
            editor={{ mode: "edit", item }}
            onSaved={() => router.refresh()}
            onDeleted={() => {
              router.push(accountEquipmentPath(ownerDid));
              router.refresh();
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  };

  return (
    <Button variant="outline" size="sm" onClick={openEditor} className="shrink-0">
      <PencilIcon />
      {t("edit")}
    </Button>
  );
}
