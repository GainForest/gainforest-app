export function logInlineInvitationProcessingDeferred(outboxId: string): void {
  console.warn("[invitation-notifications] Inline processing deferred", {
    outboxId,
    reason: "inline_processing_failed",
  });
}
