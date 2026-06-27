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
const PROFILE_IMAGE_MAX_BYTES = 950 * 1024;
const PROFILE_IMAGE_MAX_DIMENSION = 1600;
const PROFILE_IMAGE_QUALITY_STEPS = [0.86, 0.78, 0.68, 0.58, 0.48, 0.4];

function fileNameWithExtension(name: string, extension: string) {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${extension}`;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.decoding = "async";
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not prepare this image."));
    });
    image.src = url;
    return await loaded;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function renderCompressedImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const image = await loadImage(file);
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  if (!width || !height) return file;

  const firstScale = Math.min(1, PROFILE_IMAGE_MAX_DIMENSION / Math.max(width, height));
  width = Math.max(1, Math.round(width * firstScale));
  height = Math.max(1, Math.round(height * firstScale));

  if (file.size <= PROFILE_IMAGE_MAX_BYTES && firstScale === 1) return file;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return file;

  const outputTypes = file.type === "image/webp" ? ["image/webp"] : ["image/webp", "image/jpeg"];
  let bestBlob: Blob | null = null;
  let bestType = outputTypes[0];

  for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt++) {
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const outputType of outputTypes) {
      for (const quality of PROFILE_IMAGE_QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, outputType, quality);
        if (!blob) continue;
        if (!bestBlob || blob.size < bestBlob.size) {
          bestBlob = blob;
          bestType = outputType;
        }
        if (blob.size <= PROFILE_IMAGE_MAX_BYTES) {
          const extension = outputType === "image/webp" ? "webp" : "jpg";
          return new File([blob], fileNameWithExtension(file.name, extension), { type: outputType, lastModified: Date.now() });
        }
      }
    }

    width = Math.max(1, Math.round(width * 0.82));
    height = Math.max(1, Math.round(height * 0.82));
  }

  if (!bestBlob) return file;
  const extension = bestType === "image/webp" ? "webp" : "jpg";
  return new File([bestBlob], fileNameWithExtension(file.name, extension), { type: bestType, lastModified: Date.now() });
}

async function prepareProfileImage(file: File): Promise<File> {
  try {
    return await renderCompressedImage(file);
  } catch {
    return file;
  }
}

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
  const [isOptimizingImage, setIsOptimizingImage] = useState(false);
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

  const handleFileChange = async (selected: File | undefined) => {
    if (!selected) {
      setImage(undefined);
      return;
    }

    setIsOptimizingImage(true);
    try {
      setImage(await prepareProfileImage(selected));
    } finally {
      setIsOptimizingImage(false);
    }
  };

  const handleDone = async () => {
    setIsOptimizingImage(true);
    const preparedImage = image ? await prepareProfileImage(image) : undefined;
    setIsOptimizingImage(false);
    onImageChange(preparedImage);
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
        {isInitialUriLoading || isOptimizingImage ? (
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
            onFileChange={(file) => void handleFileChange(file ?? undefined)}
          />
        )}
      </div>
      <ModalFooter>
        <Button onClick={() => void handleDone()} disabled={isInitialUriLoading || isOptimizingImage}>{t("done")}</Button>
      </ModalFooter>
    </ModalContent>
  );
};
