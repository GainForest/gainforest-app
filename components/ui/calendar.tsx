"use client";

import dynamic from "next/dynamic";

export const Calendar = dynamic(
  () => import("./calendar-inner").then((m) => ({ default: m.Calendar })),
  { ssr: false },
);
