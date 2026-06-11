"use client";

import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ManageProjectsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[28rem] w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <TriangleAlertIcon className="mb-4 h-10 w-10 text-muted-foreground" />
      <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">Projects could not load</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Open this section again and try once more.</p>
      <Button type="button" variant="outline" size="sm" onClick={reset} className="mt-5">
        Try again
      </Button>
    </div>
  );
}
