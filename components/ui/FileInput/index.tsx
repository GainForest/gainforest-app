"use client";
import { ClipboardIcon, FolderUpIcon, FileIcon, Trash2Icon } from "lucide-react";
import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import useDragAndDrop from "./useDragAndDrop";
import QuickTooltip from "@/components/ui/quick-tooltip";
import { debug } from "@/lib/logger";

// Helper function to check if file is an image
const isImageFile = (file: File): boolean => {
  if (file.type === undefined) return false;
  return file.type.startsWith("image/");
};

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// MIME type to file extension mapping for fallback validation
const mimeTypeToExtensions: Record<string, string[]> = {
  "application/geo+json": [".geojson"],
  "application/geojson": [".geojson"],
};

// Extension to MIME type mapping (reverse of above)
const extensionToMimeType: Record<string, string> = {
  ".geojson": "application/geo+json",
};

// Helper function to get file extension
const getFileExtension = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot !== -1 ? fileName.substring(lastDot).toLowerCase() : "";
};

// Helper function to infer MIME type from file extension and supported types
const inferMimeType = (
  file: File,
  supportedFileTypes: string[]
): string | null => {
  const fileExtension = getFileExtension(file.name);

  // First, check if we have a direct mapping
  if (extensionToMimeType[fileExtension]) {
    const mimeType = extensionToMimeType[fileExtension];
    // Verify it's in the supported types
    if (supportedFileTypes.includes(mimeType)) {
      return mimeType;
    }
  }

  // Check if any supported type matches this extension via mimeTypeToExtensions
  for (const supportedType of supportedFileTypes) {
    if (supportedType.startsWith(".")) {
      // It's an extension-based type
      if (fileExtension === supportedType.toLowerCase()) {
        // Try to find a MIME type for this extension
        return extensionToMimeType[fileExtension] || null;
      }
    } else if (!supportedType.endsWith("/*")) {
      // It's a specific MIME type, check if extension matches
      const extensions = mimeTypeToExtensions[supportedType];
      if (extensions && extensions.includes(fileExtension)) {
        return supportedType;
      }
    }
  }

  return null;
};

// Helper function to validate the file
const validateFile = (
  file: File,
  maxSizeInMB: number,
  supportedFileTypes: string[],
  labels: FileInputLabels,
): true => {
  debug.log(file);

  if (file.size > maxSizeInMB * 1024 * 1024) {
    throw new Error(labels.fileTooLarge(maxSizeInMB));
  }

  const fileExtension = getFileExtension(file.name);
  const fileType = file.type || "";

  const isValidType = supportedFileTypes.some((type) => {
    if (type.endsWith("/*")) {
      const category = type.split("/")[0];
      return fileType.startsWith(category + "/");
    }
    if (type.startsWith(".")) {
      // Check file extension
      return fileExtension === type.toLowerCase();
    }

    // Check MIME type first
    if (fileType === type) {
      return true;
    }

    // Fallback: if MIME type is empty or doesn't match, check file extension
    // This handles Windows where file.type can be empty or incorrect
    const extensions = mimeTypeToExtensions[type];
    if (extensions) {
      return extensions.some((ext) => fileExtension === ext);
    }

    return false;
  });

  if (!isValidType) {
    throw new Error(labels.unsupportedFileType);
  }

  return true;
};

const DEFAULT_SUPPORTED_FILE_TYPES = ["image/*"];

type FileInputLabels = {
  pasteFromClipboard: string;
  uploadFromDevice: string;
  remove: string;
  dropToReplaceImage: string;
  dropToReplaceFile: string;
  noImageInClipboard: string;
  clipboardReadFailed: string;
  fileTooLarge: (maxSizeInMB: number) => string;
  unsupportedFileType: string;
};

const DEFAULT_LABELS: FileInputLabels = {
  pasteFromClipboard: "Paste from clipboard",
  uploadFromDevice: "Upload from device",
  remove: "Remove",
  dropToReplaceImage: "Drop to replace image",
  dropToReplaceFile: "Drop to replace file",
  noImageInClipboard: "No image found in clipboard",
  clipboardReadFailed: "Failed to read from clipboard",
  fileTooLarge: (maxSizeInMB) => `File size exceeds ${maxSizeInMB}MB.`,
  unsupportedFileType: "Unsupported file type.",
};

interface FileInputProps {
  placeholder?: string;
  supportedFileTypes?: string[];
  onFileChange?: (file: File | null) => void;
  value?: File | null;
  maxSizeInMB?: number;
  className?: string;
  labels?: FileInputLabels;
}

const FileInput = ({
  placeholder,
  supportedFileTypes = DEFAULT_SUPPORTED_FILE_TYPES,
  onFileChange,
  value,
  maxSizeInMB = 10,
  className,
  labels,
}: FileInputProps) => {
  const t = useTranslations("common.fileInput");
  const resolvedLabels: FileInputLabels = labels ?? {
    pasteFromClipboard: t("pasteFromClipboard"),
    uploadFromDevice: t("uploadFromDevice"),
    remove: t("remove"),
    dropToReplaceImage: t("dropToReplaceImage"),
    dropToReplaceFile: t("dropToReplaceFile"),
    noImageInClipboard: t("noImageInClipboard"),
    clipboardReadFailed: t("clipboardReadFailed"),
    fileTooLarge: (maxSizeInMB) => t("fileTooLarge", { maxSizeInMB }),
    unsupportedFileType: t("unsupportedFileType"),
  };
  const resolvedPlaceholder = placeholder ?? t("placeholder");
  const normalizedValue =
    value instanceof File && value.size === 0 ? null : value;

  const [error, setError] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRemoveFile = useCallback(() => {
    // Clean up preview URL to prevent memory leaks
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }

    onFileChange?.(null);
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [previewUrl, onFileChange]);

  // Master handler for all file selection events
  const handleFileSelect = useCallback(
    (file: File) => {
      // Check for validation errors
      setError("");
      let validationError: null | Error = null;
      try {
        validateFile(file, maxSizeInMB, supportedFileTypes, resolvedLabels);
      } catch (error) {
        validationError = error as Error;
      }
      if (validationError) {
        handleRemoveFile();
        setError(validationError.message);
        return;
      }

      // If file type is empty, try to infer it from the extension
      let fileToUse = file;
      if (!file.type || file.type === "") {
        const inferredType = inferMimeType(file, supportedFileTypes);
        if (inferredType) {
          // Create a new File object with the correct MIME type
          fileToUse = new File([file], file.name, {
            type: inferredType,
            lastModified: file.lastModified,
          });
        }
      }

      // Update the states
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      onFileChange?.(fileToUse);
      if (isImageFile(fileToUse)) {
        const url = URL.createObjectURL(fileToUse);
        setPreviewUrl(url);
      } else {
        setPreviewUrl("");
      }
    },
    [
      onFileChange,
      maxSizeInMB,
      supportedFileTypes,
      previewUrl,
      handleRemoveFile,
      resolvedLabels,
    ]
  );

  // Drag and drop handlers
  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop(handleFileSelect);

  // Paste from clipboard handler
  const handlePasteFromClipboard = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();

      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith("image/")) {
            const blob = await clipboardItem.getType(type);
            const file = new File([blob], "clipboard-image.png", { type });
            handleFileSelect(file);
            return;
          }
        }
      }

      setError(resolvedLabels.noImageInClipboard);
    } catch {
      setError(resolvedLabels.clipboardReadFailed);
    }
  };

  // Upload from device handler
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Effect to handle preview URL creation when value changes
  useEffect(() => {
    if (normalizedValue && isImageFile(normalizedValue)) {
      const url = URL.createObjectURL(normalizedValue);
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setPreviewUrl(url);
      }, 0);
      return () => URL.revokeObjectURL(url);
    } else {
      setTimeout(() => {
        setPreviewUrl("");
      }, 0);
    }
  }, [normalizedValue]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div
      className={cn("w-full", className)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div
        className={cn(
          "w-full h-full flex flex-col items-center justify-center min-h-40 border border-dashed border-border rounded-md transition-colors relative overflow-hidden",
          isDragOver ? "border-primary bg-primary/5" : "",
          error ? "border-destructive" : "",
          normalizedValue ? "bg-background" : "bg-foreground/1"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={supportedFileTypes.join(",")}
          onChange={(event) => {
            const file = event.target.files?.item(0);
            if (file) {
              handleFileSelect(file);
            }
          }}
          className="hidden"
        />

        {/* Remove button - always visible when file is selected */}
        {normalizedValue && (
          <button
            type="button"
            className="absolute top-2 right-2 px-1.5 z-10 h-5 flex items-center justify-center gap-1 bg-background/50 hover:bg-red-100 dark:hover:bg-red-900 backdrop-blur-lg transition-colors rounded-full shadow-lg cursor-pointer"
            onClick={handleRemoveFile}
          >
            <Trash2Icon className="size-3 text-foreground" />
            <span className="text-xs font-medium text-red-700 dark:text-red-300">
              {resolvedLabels.remove}
            </span>
          </button>
        )}

        {/* Image Preview */}
        {normalizedValue && isImageFile(normalizedValue) && previewUrl && (
          <div className="w-full h-full relative">
            <img
              src={previewUrl}
              alt={normalizedValue.name}
              className="w-full h-full object-cover"
            />
            {/* Overlay for drag and drop when image is shown */}
            {isDragOver && (
              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                <div className="text-primary font-medium">
                  {resolvedLabels.dropToReplaceImage}
                </div>
              </div>
            )}
          </div>
        )}

        {/* File Preview (non-image) */}
        {normalizedValue && !isImageFile(normalizedValue) && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
            <FileIcon className="size-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium text-sm truncate max-w-full">
                {normalizedValue.name.length > 20
                  ? normalizedValue.name.slice(0, 20) + "..."
                  : normalizedValue.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(normalizedValue.size)}
              </p>
            </div>
            {/* Overlay for drag and drop when file is shown */}
            {isDragOver && (
              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center rounded-md">
                <div className="text-primary font-medium">
                  {resolvedLabels.dropToReplaceFile}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Interface (when no file selected) */}
        {!normalizedValue && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <div className="flex items-center gap-1">
              <QuickTooltip content={resolvedLabels.pasteFromClipboard} asChild>
                <button
                  type="button"
                  aria-label={resolvedLabels.pasteFromClipboard}
                  className="h-7 w-7 flex items-center justify-center bg-foreground/10 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={handlePasteFromClipboard}
                >
                  <ClipboardIcon className="size-4" />
                </button>
              </QuickTooltip>
              <QuickTooltip content={resolvedLabels.uploadFromDevice} asChild>
                <button
                  type="button"
                  aria-label={resolvedLabels.uploadFromDevice}
                  className="h-7 w-7 flex items-center justify-center bg-foreground/10 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={handleUploadClick}
                >
                  <FolderUpIcon className="size-4" />
                </button>
              </QuickTooltip>
            </div>

            <span className="text-sm text-center px-2 text-muted-foreground origin-center">
              {resolvedPlaceholder}
            </span>
          </div>
        )}
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-destructive mt-2"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
};

export default FileInput;
