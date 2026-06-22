export type TimelineDeleteControlState = {
  showButton: boolean;
  showDeniedMessage: boolean;
  disabledReason: string | null;
};

export function getTimelineDeleteControlState(args: {
  canManageEvidence: boolean;
  canDeleteEvidence: boolean;
  rkey: string | null | undefined;
  deleteDisabledReason?: string | null;
}): TimelineDeleteControlState {
  const hasRkey = Boolean(args.rkey?.trim());
  const disabledReason = args.deleteDisabledReason?.trim() || null;

  return {
    showButton: Boolean(args.canManageEvidence && args.canDeleteEvidence && hasRkey),
    showDeniedMessage: Boolean(args.canManageEvidence && hasRkey && !args.canDeleteEvidence && disabledReason),
    disabledReason,
  };
}
