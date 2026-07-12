"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { ModalPortal, useModal } from "@/components/ui/modal/context";
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

export type UseAddObservationsResult = {
  /** Launches the add-observations modal over the current page. */
  open: () => void;
  /**
   * Render this next to the trigger. The modal content mounts at the call
   * site (via ModalPortal), so it keeps the caller's React context instead of
   * being teleported to the root modal host.
   */
  modal: React.ReactNode;
};

/**
 * The quick add-observations flow, honoring the active account context (the
 * org's repo for a group context, the signed-in user otherwise) so new
 * observations land in the right place. Shared by the sidebar card, the feed
 * header action, and the feed composer's image button.
 */
export function useAddObservations(sessionDid: string): UseAddObservationsResult {
  const router = useRouter();
  const modal = useModal();
  const { groups } = useAccountList(sessionDid);
  const [activeContext, setActiveContext] = useActiveAccountContext(sessionDid);
  // Unique per caller so several triggers (sidebar, feed header, composer)
  // never portal into each other's modal container.
  const modalId = `add-observations-${useId()}`;
  const [state, setState] = useState<{ target: ManageTarget; observationsHref: string } | null>(null);

  const open = () => {
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

    setState({
      target,
      observationsHref: manageHref({ basePath: groupManageBasePath(target.identifier) }, "observations"),
    });
    // Fullscreen on phones: the quick-add flow has photo cards, species
    // pickers and a date picker — a floating card at calc(100%-2rem) was too
    // cramped. On >=32rem it stays a centered max-w-2xl dialog.
    modal.pushModal(
      { id: modalId, dialogWidth: "max-w-2xl w-[calc(100%-2rem)]", fullscreenOnMobile: true },
      true,
    );
    void modal.show();
  };

  const closeModal = () => {
    void modal.hide().then(() => modal.clear());
  };

  const modalNode = (
    <ModalPortal id={modalId}>
      {state ? (
        <AddObservationsModalLazy
          target={state.target}
          onClose={closeModal}
          onViewObservations={() => {
            closeModal();
            router.push(state.observationsHref);
          }}
        />
      ) : null}
    </ModalPortal>
  );

  return { open, modal: modalNode };
}
