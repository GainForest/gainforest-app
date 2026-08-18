// Lightweight client-side signal that the set of projects for some account has
// changed (a project was created or deleted). The sidebar listens for this so
// it can re-evaluate whether to show the "Create a project" card, no matter
// which surface performed the mutation.
export const PROJECTS_CHANGED_EVENT = "gainforest-projects-changed";

export function notifyProjectsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
}
