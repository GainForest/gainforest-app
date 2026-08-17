"use client";

import React, { useContext } from "react";
import { DialogFooter } from "./dialog";
import { DrawerFooter } from "./drawer";
import { ModalModeContext, useModal } from "./context";
import { ChevronLeftIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../button";

type ModalDivProps = React.ComponentProps<"div">;

export const ModalHeader = ({
  backAction,
  ...props
}: ModalDivProps & {
  backAction?: () => void;
}) => {
  return (
    <div
      {...(backAction ? {} : props)}
      className={cn(
        "mb-2",
        backAction ? "flex items-center gap-3" : "",
        backAction ? props.className : "",
      )}
    >
      {backAction ? (
        <>
          <Button
            variant={"secondary"}
            size={"icon"}
            className="size-10 p-0"
            type="button"
            aria-label="Go back"
            onClick={() => {
              backAction();
            }}
          >
            <ChevronLeftIcon />
          </Button>
          <div {...props} />
        </>
      ) : (
        props.children
      )}
    </div>
  );
};

export const ModalTitle = ({ ...props }: ModalDivProps) => {
  return (
    <h1
      {...props}
      className={cn("font-instrument italic text-2xl", props.className)}
      data-modal-title
    />
  );
};

export const ModalDescription = ({ ...props }: ModalDivProps) => {
  return (
    <p
      {...props}
      className={cn("text-sm text-muted-foreground", props.className)}
      data-modal-description
    />
  );
};

export const ModalFooter = ({ ...props }: ModalDivProps) => {
  const mode = useContext(ModalModeContext);
  if (mode === "dialog") {
    return <DialogFooter {...props} />;
  }
  return <DrawerFooter {...props} />;
};

export const ModalContent = ({
  dismissible = true,
  showCloseButton = true,
  ...props
}: ModalDivProps & {
  dismissible?: boolean;
  /** Hide the shared desktop close button when the content supplies its own. */
  showCloseButton?: boolean;
}) => {
  const mode = useContext(ModalModeContext);
  const { dismiss } = useModal();
  if (mode === "drawer") {
    return (
      <div data-modal-dismissible={dismissible ? "true" : "false"} {...props} />
    );
  }
  return (
    <>
      {dismissible && showCloseButton ? (
        <button
          type="button"
          onClick={() => dismiss()}
          className="ring-offset-background focus:ring-ring bg-secondary absolute top-0 right-0 grid size-10 place-items-center rounded-full opacity-100 transition-all hover:brightness-95 dark:hover:brightness-105 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </button>
      ) : null}
      <div data-modal-dismissible={dismissible ? "true" : "false"} {...props} />
    </>
  );
};
