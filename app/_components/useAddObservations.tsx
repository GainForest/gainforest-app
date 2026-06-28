"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { useModal } from "@/components/ui/modal/context";
import { ModalContent } from "@/components/ui/modal/modal";
import {
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
} from "../_lib/account-switcher";
import {
  groupManageBasePath,
  groupManageTarget,
  manageHref,
  personalManageTarget,
  type ManageTarget,
} from "@/lib/links";

// The quick "Add observations" modal (iNaturalist-style drop zone + editable
// cards). Code-split so its image/EXIF/leaflet deps load only when opened.
const AddObservationsModalLazy = dynamic(
  () =>
    import("@/app/(manage)/manage/observations/_components/AddObservationsModal").then((mod) => ({
      default: mod.AddObservationsModal,
    })),
  {
    ssr: false,
    loading: () => (
      <ModalContent dismissible={false} className="w-full">
        <div className="flex h-48 items-center justify-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      </ModalContent>
    ),
  },
);

/**
 * Returns an `open()` that launches the quick add-observations modal over the
 * current page, honoring the active account context (the org's repo for a group
 * context, the signed-in user otherwise) so new observations land in the right
 * place. Shared by the sidebar card, the feed header action, and the feed
 * composer's image button.
 */
export function useAddObservations(sessionDid: string): () => void {
  const router = useRouter();
  const modal = useModal();
  const { groups } = useAccountList(sessionDid);
  const [activeContext, setActiveContext] = useActiveAccountContext(sessionDid);

  return () => {
    let target: ManageTarget;
    if (activeContext.type === "group") {
      const activeGroup = groups.find((group) => group.groupDid === activeContext.did) ?? null;
      const identifier = activeGroup
        ? switcherGroupIdentifier(activeGroup)
        : activeContext.identifier?.trim() || activeContext.did;
      if (activeGroup) {
        setActiveContext({ type: "group", did: activeGroup.groupDid, identifier, role: activeGroup.role });
      }
      target = groupManageTarget({
        did: activeContext.did,
        accountKind: "organization",
        identifier,
        role: activeGroup?.role ?? null,
        currentUserDid: sessionDid,
      });
    } else {
      target = personalManageTarget({ did: sessionDid, accountKind: "user", identifier: sessionDid });
    }

    const observationsHref = manageHref({ basePath: groupManageBasePath(target.identifier) }, "observations");
    const closeModal = () => {
      void modal.hide().then(() => modal.clear());
    };
    modal.pushModal(
      {
        id: "add-observations",
        dialogWidth: "max-w-2xl w-[calc(100%-2rem)]",
        forceDialog: true,
        content: (
          <AddObservationsModalLazy
            target={target}
            onClose={closeModal}
            onViewObservations={() => {
              closeModal();
              router.push(observationsHref);
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  };
}
