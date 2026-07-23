export function canViewIdentificationsRoute(featureEnabled: boolean, isModerator: boolean): boolean {
  return featureEnabled && isModerator;
}
