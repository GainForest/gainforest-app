"use client";

import { Button } from "@/components/ui/button";
import Container from "@/components/ui/container";

export default function ManageBumicertsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Container className="pt-4 pb-8">
      <div className="flex min-h-52 flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-muted/30 p-8 text-center">
        <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">Could not load Certs</h1>
        <p className="max-w-md text-sm text-muted-foreground">{error.message || "Refresh the page and try again."}</p>
        <Button onClick={reset} variant="outline" size="sm">Retry</Button>
      </div>
    </Container>
  );
}
