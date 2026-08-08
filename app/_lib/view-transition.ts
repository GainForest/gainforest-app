import type { CSSProperties } from "react";

// Cross-route View Transition naming for the "project card photo morphs into
// the project page hero" effect. The card assigns the name imperatively on
// click (so hundreds of grid cards never become individual snapshot groups
// during unrelated transitions like the theme ripple); the detail hero carries
// the name declaratively, but only activates while `html.vt-nav` is present —
// see globals.css.

/** `view-transition-class` shared by every morphing project photo, so the CSS
 * can style the pair (object-fit, duration) without knowing the unique name. */
export const PROJECT_MEDIA_TRANSITION_CLASS = "project-media";

/** Unique, CSS-custom-ident-safe `view-transition-name` for a project photo. */
export function projectMediaTransitionName(did: string, rkey: string): string {
  return `project-media-${`${did}-${rkey}`.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/** Inline style for the detail-page hero: exposes the name through a custom
 * property that globals.css only applies while a card→page navigation
 * transition is running (`html.vt-nav [data-vt-project-media]`). */
export function projectMediaTransitionStyle(did: string, rkey: string): CSSProperties {
  return { "--vt-project-media": projectMediaTransitionName(did, rkey) } as CSSProperties;
}
