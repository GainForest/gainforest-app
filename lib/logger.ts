/**
 * Debug logger that only outputs when DEBUG=true and NOT in production.
 *
 * Uses Vercel system env variables:
 * - VERCEL_ENV: "production" | "preview" | "development" (set automatically by Vercel)
 * - DEBUG: manually set env variable to enable verbose logging
 *
 * In local dev, VERCEL_ENV is undefined so we check NODE_ENV instead.
 * Uses process.env directly — safe on both server and client since Next.js
 * inlines NODE_ENV at build time and VERCEL_ENV/DEBUG are server-only reads.
 */

const isDebug = process.env.DEBUG;

export const debug = {
  log: (...args: unknown[]) => { if (isDebug) console.log(...args); },
  warn: (...args: unknown[]) => { if (isDebug) console.warn(...args); },
  error: (...args: unknown[]) => { if (isDebug) console.error(...args); },
};
