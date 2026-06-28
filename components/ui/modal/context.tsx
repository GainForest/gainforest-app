"use client";
import { createContext, useContext, useState } from "react";
import { debug } from "@/lib/logger";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPlaceholder,
  DialogTitle,
} from "./dialog";
import {
  Drawer,
  DrawerDescription,
  DrawerHeader,
  DrawerPlaceholder,
  DrawerTitle,
} from "./drawer";
import { VisuallyHidden } from "radix-ui";
import { AnimateChangeInHeight } from "./AnimateChangeInHeight";
import useCurrentModalInfo from "./use-current-modal-info";
import ModalWrapper from "./ModalWrapper";
import useMediaQuery from "@/hooks/use-media-query";

const VISIBILITY_TRANSITION_DURATION = 100;
const STACK_UPDATE_TRANSITION_DURATION = 300;
const SMALL_SCREEN_BREAKPOINT = "32rem";

export type ModalVariant = {
  id: string;
  content: React.ReactNode;
  /** Tailwind max-width class for dialog mode (e.g. "max-w-2xl"). Defaults to "max-w-sm". */
  dialogWidth?: string;
  /**
   * Keep this modal as a centered dialog on small screens instead of letting it
   * collapse into the bottom drawer. Opt-in per modal; when any modal in the
   * stack sets it, the whole stack renders as a dialog.
   */
  forceDialog?: boolean;
};

type ModalMode = "dialog" | "drawer";

type ModalContextType = {
  show: () => Promise<void>;
  hide: () => Promise<void>;
  onVisibilityChange: (open: boolean) => void;
  isOpen: boolean;
  mode: ModalMode | null;
  stack: Array<string>;
  pushModal: (variant: ModalVariant, replaceAll?: boolean) => void;
  popModal: () => void;
  clear: () => void;
};

const ModalContext = createContext<ModalContextType | null>(null);
export const ModalModeContext = createContext<ModalMode | null>(null);

const ModalStack = ({
  mode,
  children,
  isOpen,
  onOpenChange,
  dismissible,
  dialogWidth,
}: {
  mode: ModalMode | null;
  children: React.ReactNode;
  dismissible: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dialogWidth: string;
}) => {
  if (mode === "dialog") {
    debug.log("dismissible", dismissible);
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogPlaceholder
          className="overflow-hidden"
          dialogWidth={dialogWidth}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            if (dismissible) {
              onOpenChange(false);
            }
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
            if (dismissible) {
              onOpenChange(false);
            }
          }}
        >
          <AnimateChangeInHeight className="relative">
            {children}
          </AnimateChangeInHeight>
        </DialogPlaceholder>
      </Dialog>
    );
  }
  if (mode === "drawer") {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={onOpenChange}
        dismissible={dismissible}
        repositionInputs={false}
      >
        <DrawerPlaceholder dismissible={dismissible}>
          {children}
        </DrawerPlaceholder>
      </Drawer>
    );
  }
  return null;
};

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
  const [modalIdStack, setModalIdStack] = useState<string[]>([]);
  const [modalStack, setModalStack] = useState<ModalVariant[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const smQueryMatches = useMediaQuery(
    `(min-width: ${SMALL_SCREEN_BREAKPOINT})`
  );
  const forceDialog = modalStack.some((variant) => variant.forceDialog);
  const mode =
    smQueryMatches === null
      ? null
      : smQueryMatches || forceDialog
        ? "dialog"
        : "drawer";

  const modalInfo = useCurrentModalInfo(modalIdStack);
  const activeDialogWidth = modalStack.at(-1)?.dialogWidth ?? "max-w-sm";

  const show = () => {
    setIsOpen(true);
    return new Promise<void>((res) => {
      setTimeout(() => {
        res();
      }, VISIBILITY_TRANSITION_DURATION);
    });
  };

  const hide = () => {
    setIsOpen(false);
    return new Promise<void>((res) => {
      setTimeout(() => {
        res();
      }, VISIBILITY_TRANSITION_DURATION);
    });
  };

  const onVisibilityChange = (open: boolean) => {
    setIsOpen(open);
  };

  const pushModal = (variant: ModalVariant, replaceAll?: boolean) => {
    setModalIdStack((prev) => [...(replaceAll ? [] : prev), variant.id]);
    setModalStack((prev) => [...(replaceAll ? [] : prev), variant]);
  };

  const popModal = () => {
    setModalIdStack((prev) => prev.slice(0, -1));
    setModalStack((prev) => prev.slice(0, -1));
  };

  const clear = () => {
    setModalIdStack([]);
    setModalStack([]);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };
  return (
    <ModalContext.Provider
      value={{
        show,
        hide,
        onVisibilityChange,
        isOpen,
        mode,
        stack: modalIdStack,
        pushModal,
        popModal,
        clear,
      }}
    >
      {children}
      <ModalModeContext.Provider value={mode}>
        <ModalStack
          mode={mode}
          isOpen={isOpen}
          onOpenChange={handleOpenChange}
          dismissible={modalInfo.dismissible}
          dialogWidth={activeDialogWidth}
        >
          <VisuallyHidden.Root>
            {mode === "dialog" ? (
              <DialogHeader>
                <DialogTitle>
                  {typeof modalInfo.title === "string" ? (
                    modalInfo.title
                  ) : (
                    <>{modalInfo.title}</>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {typeof modalInfo.description === "string" ? (
                    modalInfo.description
                  ) : (
                    <>{modalInfo.description}</>
                  )}
                </DialogDescription>
              </DialogHeader>
            ) : mode === "drawer" ? (
              <DrawerHeader>
                <DrawerTitle>
                  {typeof modalInfo.title === "string" ? (
                    modalInfo.title
                  ) : (
                    <>{modalInfo.title}</>
                  )}
                </DrawerTitle>
                <DrawerDescription>
                  {typeof modalInfo.description === "string" ? (
                    modalInfo.description
                  ) : (
                    <>{modalInfo.description}</>
                  )}
                </DrawerDescription>
              </DrawerHeader>
            ) : null}
          </VisuallyHidden.Root>
          {modalStack.map((modal, index) => {
            return (
              <ModalWrapper
                index={index}
                transitionDurationInMs={STACK_UPDATE_TRANSITION_DURATION}
                modal={modal}
                isActive={modalStack.length - 1 === index}
                preventFocusTrap={mode === "drawer"}
                key={modal.id + index}
              />
            );
          })}
        </ModalStack>
      </ModalModeContext.Provider>
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};
