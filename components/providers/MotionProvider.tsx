"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/** Applies the viewer's reduced-motion preference to every Framer Motion child. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
