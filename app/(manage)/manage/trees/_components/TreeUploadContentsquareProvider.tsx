"use client";

import { ContentsquareProvider } from "@/components/providers/ContentsquareProvider";
import { useTreesMode } from "../_hooks/useTreesMode";

type TreeUploadContentsquareProviderProps = {
  children: React.ReactNode;
};

export function TreeUploadContentsquareProvider({
  children,
}: TreeUploadContentsquareProviderProps) {
  const [mode] = useTreesMode();

  return (
    <ContentsquareProvider enabled={mode === "upload"}>
      {children}
    </ContentsquareProvider>
  );
}
