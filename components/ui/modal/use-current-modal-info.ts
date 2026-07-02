import { useEffect, useState } from "react";

type ModalInfo = {
  dismissible: boolean;
  title: Element | string;
  description: Element | string;
};

const DEFAULT_MODAL_INFO: ModalInfo = {
  dismissible: true,
  title: "Untitled Modal",
  description: "No description found for this modal.",
};

const readCurrentModalInfo = (): ModalInfo => {
  const currentModal = document.querySelector("[data-current-modal]");

  if (!currentModal) {
    return DEFAULT_MODAL_INFO;
  }

  const title = currentModal.querySelector("[data-modal-title]");
  const description = currentModal.querySelector("[data-modal-description]");
  const dismissible = currentModal.querySelector("[data-modal-dismissible]");

  return {
    dismissible: dismissible?.getAttribute("data-modal-dismissible") !== "false",
    title: title?.textContent ?? DEFAULT_MODAL_INFO.title,
    description: description?.textContent ?? DEFAULT_MODAL_INFO.description,
  };
};

const areModalInfosEqual = (left: ModalInfo, right: ModalInfo) => {
  return (
    left.dismissible === right.dismissible &&
    left.title === right.title &&
    left.description === right.description
  );
};

const useCurrentModalInfo = (modalStackDependency: readonly unknown[]) => {
  const [modalInfo, setModalInfo] = useState<ModalInfo>(DEFAULT_MODAL_INFO);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const syncModalInfo = () => {
      const nextModalInfo = readCurrentModalInfo();

      setModalInfo((currentModalInfo) => {
        return areModalInfosEqual(currentModalInfo, nextModalInfo)
          ? currentModalInfo
          : nextModalInfo;
      });
    };

    syncModalInfo();
    timeoutId = setTimeout(syncModalInfo, 100);

    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalStackDependency]);

  return modalInfo;
};

export default useCurrentModalInfo;
