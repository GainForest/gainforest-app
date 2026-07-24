export type AssignmentFailure = { recipient: string; error: unknown };
export type AssignmentResults = { succeeded: string[]; failed: AssignmentFailure[] };

export async function assignRecipients(
  recipients: string[],
  assign: (recipient: string) => Promise<void>,
): Promise<AssignmentResults> {
  const results: AssignmentResults = { succeeded: [], failed: [] };
  for (const recipient of recipients) {
    try {
      await assign(recipient);
      results.succeeded.push(recipient);
    } catch (error) {
      results.failed.push({ recipient, error });
    }
  }
  return results;
}
