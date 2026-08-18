"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import {
  TREE_UPLOAD_EVENTS,
  type TreeUploadEventPayload,
} from "@/lib/analytics/events";
import { trackTreeUploadEvent } from "@/lib/analytics/hotjar";
import { links } from "@/lib/links";

type TreeUploadFeedbackModalProps = {
  analyticsPayload: TreeUploadEventPayload;
};

export function TreeUploadFeedbackModal({
  analyticsPayload,
}: TreeUploadFeedbackModalProps) {
  const { popModal } = useModal();

  const handleClose = () => {
    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.FEEDBACK_FORM_CLOSED, analyticsPayload);
    popModal();
  };

  return (
    <ModalContent
      dismissible={false}
      className="flex max-h-[85vh] flex-col space-y-5 overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))] group-data-[vaul-drawer-direction=bottom]/drawer-content:max-h-[calc(80vh-3rem)]"
    >
      <ModalHeader backAction={handleClose}>
        <div>
          <ModalTitle>Share tree upload feedback</ModalTitle>
          <ModalDescription>
            This short form helps us improve tree uploads and fix anything that
            was confusing.
          </ModalDescription>
        </div>
      </ModalHeader>

      <div className="rounded-2xl border border-border bg-muted/20 p-5">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            The feedback form opens in a new tab and should take less than two
            minutes. You can come back to this upload summary when you are done.
          </p>
          <p>
            Please tell us what was easy, what was confusing, and what would
            make tree uploads better for your team.
          </p>
        </div>
      </div>

      <ModalFooter className="gap-2">
        <Button asChild>
          <a
            href={links.external.treeUploadFeedbackForm}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink />
            Open feedback form
          </a>
        </Button>
        <Button variant="ghost" onClick={handleClose}>
          Back to upload summary
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
