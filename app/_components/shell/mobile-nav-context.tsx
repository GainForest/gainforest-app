"use client";

import { createContext, useContext } from "react";

/**
 * Lets full-bleed routes that render without the ShellHeader (the Globe) still
 * open the app's mobile navigation drawer. AppShell owns the drawer's open
 * state and publishes an `open()` handler here; a route's own header can call
 * it so smaller devices keep a way back into the rest of the app.
 */
const MobileNavContext = createContext<{ open: () => void } | null>(null);

export const MobileNavProvider = MobileNavContext.Provider;

export function useMobileNav() {
  return useContext(MobileNavContext);
}
