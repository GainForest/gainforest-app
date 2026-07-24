export function isFeedFilterVisible(
  filter: { authOnly?: boolean; adminOnly?: boolean },
  signedIn: boolean,
  isAdmin: boolean,
): boolean {
  if (filter.authOnly && !signedIn) return false;
  if (filter.adminOnly && !isAdmin) return false;
  return true;
}
