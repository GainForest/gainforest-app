"use client";

import { FolderTile } from "@/app/_components/FolderTile";
import { OVERVIEW_FOLDER_ART } from "./OverviewFolderArt";

export type OverviewFolderTile = {
  id: string;
  title: string;
  href: string;
  count: number | null | undefined;
};

function Folder({ tile, index }: { tile: OverviewFolderTile; index: number }) {
  return (
    <FolderTile
      title={tile.title}
      count={tile.count}
      art={OVERVIEW_FOLDER_ART[tile.id]}
      href={tile.href}
      index={index}
    />
  );
}

export function OverviewFolders({ tiles }: { tiles: OverviewFolderTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((tile, index) => (
        <Folder key={tile.id} tile={tile} index={index} />
      ))}
    </div>
  );
}
