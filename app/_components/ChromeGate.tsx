"use client";

import { usePathname } from "next/navigation";
import type { AuthSession } from "../_lib/auth";
import { AppShell } from "./AppShell";
import { Footer } from "./Footer";

export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (pathname.startsWith("/auth")) {
    return <>{children}</>;
  }

  return (
    <AppShell authSession={null} manageAccountKind="user">
      {children}
      <Footer />
    </AppShell>
  );
}
