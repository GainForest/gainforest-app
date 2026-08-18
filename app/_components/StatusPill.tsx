import { type StatusTone } from "../_lib/status";

export const TONE_DOT: Record<StatusTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  down: "text-down",
  neutral: "text-foreground/40",
};

export const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  down: "text-down",
  neutral: "text-foreground/55",
};
