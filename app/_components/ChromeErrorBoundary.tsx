"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "../_lib/client-error-report";

/**
 * Error boundary for shell chrome widgets (sidebar, search, notifications,
 * header actions, promo banners…). A crash inside one widget degrades to that
 * widget disappearing (or a provided fallback) instead of taking down the
 * whole page with Next's generic "Application error" screen. Every caught
 * error is reported to /api/client-errors with the widget name.
 */
export class ChromeErrorBoundary extends Component<
  { name: string; fallback?: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportClientError(error, `chrome:${this.props.name}`, info.componentStack);
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
