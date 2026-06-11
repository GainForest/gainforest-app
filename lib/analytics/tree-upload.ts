import { TREE_UPLOAD_STEP_NAMES, type TreeUploadStepName } from "./events";

const KILOBYTE = 1024;
const MEGABYTE = 1024 * KILOBYTE;

export function getFileSizeBucket(bytes: number): string {
  if (bytes < 100 * KILOBYTE) return "under_100kb";
  if (bytes < MEGABYTE) return "100kb_to_1mb";
  if (bytes < 10 * MEGABYTE) return "1mb_to_10mb";
  if (bytes < 100 * MEGABYTE) return "10mb_to_100mb";
  return "over_100mb";
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  const extension = parts.length > 1 ? parts.at(-1) : undefined;
  return extension ? `.${extension}` : "unknown";
}

export function getTreeUploadStepName(stepIndex: number): TreeUploadStepName {
  return TREE_UPLOAD_STEP_NAMES[stepIndex - 1] ?? "file";
}

export function isTreeUploadTrackingPath(pathname: string): boolean {
  return pathname === "/manage/trees" || pathname.startsWith("/manage/trees/");
}

export function isTreeUploadTrackingSurface(pathname: string, search: string): boolean {
  if (!isTreeUploadTrackingPath(pathname)) return false;

  const searchParams = new URLSearchParams(search);
  return searchParams.get("mode") === "upload";
}
