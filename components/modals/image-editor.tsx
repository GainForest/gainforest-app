import FileInput from "@/components/ui/FileInput";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";

/**
 * Fetch a remote image URL and return it as a File object.
 * Used when `initialImage` is a pre-resolved blob URI from the indexer.
 */
const getFileFromURL = async (url: string) => {
  const response = await fetch(url);
  const blob = await response.blob();
  const filetype = blob.type.split("/")[1];
  return new File([blob], `image.${filetype}`, { type: blob.type });
};

export const ImageEditorModal = ({
  title,
  description,
  /**
   * The initial image to display.
   *
   * - `File`   — a locally-selected file (e.g. during onboarding)
   * - `string` — a pre-resolved blob URI returned by the GraphQL API (indexer
   *              always resolves blobs to URIs, so this is safe to fetch)
   * - `undefined` — no initial image
   */
  initialImage,
  onImageChange,
}: {
  title: string;
  description: string;
  initialImage: File | string | undefined;
  onImageChange: (image: File | undefined) => void;
}) => {
  const t = useTranslations("modals.imageEditor");
  const { popModal, stack, hide } = useModal();

  const initialUri = typeof initialImage === "string" ? initialImage : null;
  const initialFile = initialImage instanceof File ? initialImage : undefined;

  const [isInitialUriLoading, setIsInitialUriLoading] = useState(Boolean(initialUri));
  const [image, setImage] = useState<File | undefined>(initialFile);

  useEffect(() => {
    if (!initialUri) return;

    let cancelled = false;
    setIsInitialUriLoading(true);

    getFileFromURL(initialUri)
      .then((data) => {
        if (cancelled) return;
        setImage(data ?? undefined);
        setIsInitialUriLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[ImageEditorModal] Failed to load initial image from URI:", error);
        setIsInitialUriLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialUri]);

  const handleDone = () => {
    onImageChange(image);
    if (stack.length === 1) {
      hide().then(() => popModal());
    } else {
      popModal();
    }
  };

  return (
    <ModalContent>
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>
      <div className="flex flex-col gap-4 mt-4">
        {isInitialUriLoading ? (
          <div className="w-full h-40 rounded-lg bg-muted flex flex-col gap-1 items-center justify-center">
            <Loader2Icon className="size-5 animate-spin" />
            <span className="text-sm text-muted-foreground">{t("loading")}</span>
          </div>
        ) : (
          <FileInput
            supportedFileTypes={[
              "image/jpg",
              "image/jpeg",
              "image/png",
              "image/webp",
            ]}
            maxSizeInMB={5}
            value={image}
            onFileChange={(file) => setImage(file ?? undefined)}
          />
        )}
      </div>
      <ModalFooter>
        <Button onClick={handleDone}>{t("done")}</Button>
      </ModalFooter>
    </ModalContent>
  );
};
