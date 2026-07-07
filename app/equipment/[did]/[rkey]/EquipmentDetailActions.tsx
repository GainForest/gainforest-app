"use client";

/**
 * Owner-only actions on the equipment detail page: edit (and delete, inside
 * the editor drawer). After a save the server page is refreshed; after a
 * delete the owner is sent back to their equipment list.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EquipmentItem } from "@/app/_lib/equipment";
import { EquipmentEditor } from "@/app/account/_components/EquipmentEditor";
import { accountEquipmentPath } from "@/app/account/_lib/account-route";

export function EquipmentDetailActions({ item, ownerDid }: { item: EquipmentItem; ownerDid: string }) {
  const t = useTranslations("common.equipment");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="shrink-0">
        <PencilIcon />
        {t("edit")}
      </Button>
      {open ? (
        <EquipmentEditor
          editor={{ mode: "edit", item }}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
          onDeleted={() => {
            setOpen(false);
            router.push(accountEquipmentPath(ownerDid));
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
