"use client";
import { useState } from "react";

const useDragAndDrop = (onDrop: (file: File) => void) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);

    // Set dropEffect to allow file drops
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    // Try to get file from files array first (file system drag)
    let file = event.dataTransfer.files.item(0);

    // If no file in files array, try to get from items (web page drag)
    if (
      !file &&
      event.dataTransfer.items &&
      event.dataTransfer.items.length > 0
    ) {
      for (let i = 0; i < event.dataTransfer.items.length; i++) {
        const item = event.dataTransfer.items[i];

        if (item.kind === "file") {
          try {
            file = item.getAsFile();
            if (file) break; // Found a file, stop looking
          } catch (error) {
            console.error("Error getting file from item:", error);
          }
        }
      }
    }

    // If still no file, try to convert URL to File (browser image drag)
    if (!file) {
      try {
        // Try different data types to find a URL
        const dataTypes = ["text/uri-list", "text/plain", "text/html"];
        let url = "";

        for (const dataType of dataTypes) {
          try {
            const data = event.dataTransfer.getData(dataType);
            if (data && data.startsWith("http")) {
              url = data;
              break;
            }
          } catch {
            // Continue to next data type
          }
        }

        // If we found a URL, convert it to a file
        if (url) {
          file = await urlToFile(url);
        }
      } catch (error) {
        console.log("Could not convert URL to file:", error);
      }
    }

    if (file) {
      onDrop(file);
    }
  };

  // Helper function to convert URL to File
  const urlToFile = async (url: string): Promise<File | null> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();

      // Extract filename from URL
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split("/").pop()?.split("?")[0] || "image.png";

      // Ensure filename has proper extension
      const hasExtension = filename.includes(".");
      const finalFilename = hasExtension ? filename : `${filename}.png`;

      // Create File from blob
      const file = new File([blob], finalFilename, { type: blob.type });
      return file;
    } catch (error) {
      console.error("Error converting URL to file:", error);
      return null;
    }
  };

  return { isDragOver, handleDragOver, handleDragLeave, handleDrop };
};

export default useDragAndDrop;
