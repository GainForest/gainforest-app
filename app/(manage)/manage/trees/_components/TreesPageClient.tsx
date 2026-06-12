"use client";

import { Suspense } from "react";
import { TreeUploadWizard } from "./TreeUploadWizard";
import { TreesClient } from "./TreesClient";
import { TreeUploadContentsquareProvider } from "./TreeUploadContentsquareProvider";
import { useTreesMode } from "../_hooks/useTreesMode";
import type { ManageTarget } from "@/lib/links";

function TreesPageInner({ did, target }: { did: string; target: ManageTarget }) {
  const [mode, setMode] = useTreesMode();
  return mode === "upload" ? (
    <TreeUploadWizard did={did} target={target} onDone={() => setMode(null)} />
  ) : (
    <TreesClient did={did} target={target} onUpload={() => setMode("upload")} />
  );
}

export function TreesPageClient({ did, target }: { did: string; target: ManageTarget }) {
  return (
    <Suspense fallback={null}>
      <TreeUploadContentsquareProvider>
        <TreesPageInner did={did} target={target} />
      </TreeUploadContentsquareProvider>
    </Suspense>
  );
}
