"use client";

import { useEffect } from "react";
import { reportClientError } from "../_lib/client-error-report";

/**
 * Reports uncaught window errors and unhandled promise rejections to
 * /api/client-errors. Mounted once from the root layout so crashes that slip
 * past every boundary still leave a trace in the server logs.
 */
export function ClientErrorListener() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError(event.error ?? event.message, "window:error");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason, "window:unhandledrejection");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
