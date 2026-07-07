"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  /**
   * Inline modal content. NOTE: inline content renders inside <ModalHost>
   * (mounted in the root layout under the app-level providers), NOT at the
   * component that pushed it — so it must not rely on page-level React
   * contexts. Omit `content` and render a <ModalPortal id=…> at the call
   * site instead when the content needs the caller's context.
   */
  content?: React.ReactNode;
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

// Internal plumbing between ModalProvider (state, mounted at the root),
// ModalHost (the dialog/drawer chrome, mounted under the app providers) and
// ModalPortal (call-site content). Not exported.
type ModalInternals = {
  isOpen: boolean;
  mode: ModalMode | null;
  modalStack: ModalVariant[];
  activeDialogWidth: string;
  handleOpenChange: (open: boolean) => void;
  portalContainers: Record<string, HTMLElement | null>;
  registerPortalContainer: (id: string, element: HTMLElement | null) => void;
};

const ModalInternalsContext = createContext<ModalInternals | null>(null);

function useModalInternals(component: string): ModalInternals {
  const internals = useContext(ModalInternalsContext);
  if (!internals) {
    throw new Error(`${component} must be used within a ModalProvider`);
  }
  return internals;
}

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
  const mode: ModalMode | null =
    smQueryMatches === null
      ? null
      : smQueryMatches || forceDialog
        ? "dialog"
        : "drawer";

  const activeDialogWidth = modalStack.at(-1)?.dialogWidth ?? "max-w-sm";

  // Registry of DOM containers for call-site rendered modals (<ModalPortal>).
  // ModalWrapper mounts an empty target div for stack entries without inline
  // content; the pushing component portals its children into that div, which
  // keeps the children's React context exactly where they were declared.
  const [portalContainers, setPortalContainers] = useState<Record<string, HTMLElement | null>>({});
  const registerPortalContainer = useCallback((id: string, element: HTMLElement | null) => {
    setPortalContainers((prev) => (prev[id] === element ? prev : { ...prev, [id]: element }));
  }, []);

  // All actions are stable callbacks and the context value is memoized: the
  // provider wraps the entire app, so an unstable value would re-render every
  // useModal consumer (and re-fire their `modal`-dependent effects) on any
  // modal state change.
  const show = useCallback(() => {
    setIsOpen(true);
    return new Promise<void>((res) => {
      setTimeout(() => {
        res();
      }, VISIBILITY_TRANSITION_DURATION);
    });
  }, []);

  const hide = useCallback(() => {
    setIsOpen(false);
    return new Promise<void>((res) => {
      setTimeout(() => {
        res();
      }, VISIBILITY_TRANSITION_DURATION);
    });
  }, []);

  const onVisibilityChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const pushModal = useCallback((variant: ModalVariant, replaceAll?: boolean) => {
    setModalIdStack((prev) => [...(replaceAll ? [] : prev), variant.id]);
    setModalStack((prev) => [...(replaceAll ? [] : prev), variant]);
  }, []);

  const popModal = useCallback(() => {
    setModalIdStack((prev) => prev.slice(0, -1));
    setModalStack((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setModalIdStack([]);
    setModalStack([]);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const contextValue = useMemo(
    () => ({
      show,
      hide,
      onVisibilityChange,
      isOpen,
      mode,
      stack: modalIdStack,
      pushModal,
      popModal,
      clear,
    }),
    [show, hide, onVisibilityChange, isOpen, mode, modalIdStack, pushModal, popModal, clear],
  );

  const internals = useMemo<ModalInternals>(
    () => ({
      isOpen,
      mode,
      modalStack,
      activeDialogWidth,
      handleOpenChange,
      portalContainers,
      registerPortalContainer,
    }),
    [isOpen, mode, modalStack, activeDialogWidth, handleOpenChange, portalContainers, registerPortalContainer],
  );

  // ModalModeContext wraps the app children too (not just the host) so
  // ModalContent/ModalFooter/useIsDrawer keep working inside call-site
  // rendered (<ModalPortal>) content, whose React tree lives at the caller.
  return (
    <ModalContext.Provider value={contextValue}>
      <ModalInternalsContext.Provider value={internals}>
        <ModalModeContext.Provider value={mode}>{children}</ModalModeContext.Provider>
      </ModalInternalsContext.Provider>
    </ModalContext.Provider>
  );
};

/**
 * Renders the actual dialog/drawer chrome for the modal stack. Mounted ONCE
 * from the root layout, purposely at the bottom of the app-level provider
 * tree (inside AccountDrawerProvider etc.) so that inline `content` pushed
 * via pushModal has access to those contexts. Previously the stack rendered
 * directly inside ModalProvider — above every other provider — which made
 * any pushed content that relied on a lower context crash the whole app.
 */
export const ModalHost = () => {
  const internals = useModalInternals("ModalHost");
  const { isOpen, mode, modalStack, activeDialogWidth, handleOpenChange } = internals;
  const modalInfo = useCurrentModalInfo(modalStack);

  return (
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
          // Entries pushed without inline content get an empty target div that
          // the call site's <ModalPortal> renders into.
          const resolved =
            modal.content !== undefined ? modal : { ...modal, content: <ModalPortalTarget id={modal.id} /> };
          return (
            <ModalWrapper
              index={index}
              transitionDurationInMs={STACK_UPDATE_TRANSITION_DURATION}
              modal={resolved}
              isActive={modalStack.length - 1 === index}
              preventFocusTrap={mode === "drawer"}
              key={modal.id + index}
            />
          );
        })}
      </ModalStack>
    </ModalModeContext.Provider>
  );
};

/**
 * Mount target inside ModalWrapper for stack entries pushed without inline
 * `content`. Registers its DOM node so the matching <ModalPortal> at the
 * call site can portal children into it.
 */
const ModalPortalTarget = ({ id }: { id: string }) => {
  const { registerPortalContainer } = useModalInternals("ModalPortalTarget");
  // The ref callback MUST have a stable identity across re-renders. An inline
  // arrow here gets a new function every render, so React detaches (fires
  // the old ref with `null`) and reattaches (fires the new ref with the
  // element) on EVERY re-render — and since both calls update state via
  // registerPortalContainer, that's an infinite detach/attach/render loop
  // (React error #185, "Maximum update depth exceeded"), reproduced live in
  // production the moment a call-site modal (e.g. add-observations) opened.
  const setRef = useCallback(
    (element: HTMLElement | null) => registerPortalContainer(id, element),
    [id, registerPortalContainer],
  );
  return <div ref={setRef} />;
};

/**
 * Call-site modal content. Push the stack entry WITHOUT `content`
 * (`modal.pushModal({ id: "my-modal", … })`) and render
 * `<ModalPortal id="my-modal">…</ModalPortal>` in the same component.
 * The children render into the modal chrome via a React portal, so they keep
 * the caller's React context (page providers included) — unlike inline
 * `content`, which renders under the root-level ModalHost.
 *
 * Children are only mounted while the id is present in the modal stack, so
 * heavy lazy content is not loaded up front.
 */
export const ModalPortal = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const { portalContainers } = useModalInternals("ModalPortal");
  const container = portalContainers[id] ?? null;
  if (!container) return null;
  return createPortal(children, container);
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};

/**
 * True when the modal renders as a bottom drawer (small screens, no forceDialog).
 * Modals use this to drop their own inner viewport-height scrollers in drawer
 * mode so the drawer's single scroll body owns the gesture — a nested
 * `overflow-y-auto` region otherwise traps touch scrolling and can leave the
 * footer unreachable.
 */
export const useIsDrawer = () => useContext(ModalModeContext) === "drawer";
