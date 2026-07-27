export function observationBatchGridLayout(thumbnailCount: number): string {
  if (thumbnailCount <= 1) return "grid-cols-1";
  if (thumbnailCount === 2) return "grid-cols-2";
  return "grid-cols-2 grid-rows-2";
}

export function observationBatchTileLayout(thumbnailCount: number, index: number): string | undefined {
  return thumbnailCount === 3 && index === 0 ? "row-span-2" : undefined;
}
