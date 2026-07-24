/**
 * Header controls render as one compact peer set. Text pills and icon buttons
 * use the same 36px outer height so route actions never overpower adjacent
 * search, cart, notification, or account controls.
 */
export const shellHeaderControl = {
  pill: "h-9",
  icon: "size-9",
} as const;
