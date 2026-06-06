import type { Metadata } from "next";
import { LeafIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "New Bumicert — Manage",
  description: "Create a new Bumicert.",
  robots: { index: false, follow: false },
};

export default function NewBumicertPage() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6">
      <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-[1.6rem] border border-border/80 bg-card p-8 text-center shadow-sm">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background text-primary shadow-sm">
          <LeafIcon className="size-6" />
        </div>
        <h1 className="font-serif text-3xl font-medium tracking-[-0.02em] text-foreground">
          New Bumicert
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          The Bumicert creation flow is coming soon.
        </p>
      </div>
    </div>
  );
}
