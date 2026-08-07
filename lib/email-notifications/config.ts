import "server-only";

export interface NotificationConfig {
  readonly emailDisabled: boolean;
}

type Environment = Readonly<Record<string, string | undefined>>;

function disabled(value: string | undefined): boolean {
  const parsed = value?.trim() || "false";
  if (parsed === "true") return true;
  if (parsed === "false") return false;
  throw new Error(
    `EMAIL_DISABLED must be exactly true or false; received ${JSON.stringify(parsed)}. Use true to stop all notification email or false to send through Resend.`,
  );
}

export function readNotificationConfig(environment: Environment = process.env): NotificationConfig {
  return { emailDisabled: disabled(environment.EMAIL_DISABLED) };
}
