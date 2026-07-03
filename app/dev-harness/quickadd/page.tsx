"use client";

// TEMPORARY dev-only harness to visually verify the AddObservationsModal UI.
// Not linked anywhere; delete before committing.

import { useEffect } from "react";
import { ModalProvider, ModalHost, ModalPortal, useModal } from "@/components/ui/modal/context";
import { AddObservationsModal } from "@/app/(manage)/manage/observations/_components/AddObservationsModal";
import type { ManageTarget } from "@/lib/links";

const target: ManageTarget = {
  kind: "personal",
  did: "did:plc:devharness",
  accountKind: "user",
  identifier: "did:plc:devharness",
} as unknown as ManageTarget;

function Harness() {
  const modal = useModal();
  useEffect(() => {
    modal.pushModal({ id: "harness", dialogWidth: "max-w-2xl w-[calc(100%-2rem)]", forceDialog: true }, true);
    void modal.show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ModalPortal id="harness">
      <AddObservationsModal
        target={target}
        onViewObservations={() => {}}
        onClose={() => {}}
      />
    </ModalPortal>
  );
}

export default function Page() {
  return (
    <ModalProvider>
      <Harness />
      <ModalHost />
    </ModalProvider>
  );
}
