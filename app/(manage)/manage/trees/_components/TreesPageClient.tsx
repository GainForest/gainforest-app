"use client";

import { Suspense } from "react";
import { TreeUploadWizard } from "./TreeUploadWizard";
import { TreesClient } from "./TreesClient";
import { useTreesMode } from "../_hooks/useTreesMode";

function TreesPageInner({ did }: { did: string }) {
  const [mode, setMode] = useTreesMode();
  return mode === "upload" ? (
    <TreeUploadWizard did={did} onDone={() => setMode(null)} />
  ) : (
    <TreesClient did={did} onUpload={() => setMode("upload")} />
  );
}

export function TreesPageClient({ did }: { did: string }) {
  return (
    <Suspense fallback={null}>
      <TreesPageInner did={did} />
    </Suspense>
  );
}
