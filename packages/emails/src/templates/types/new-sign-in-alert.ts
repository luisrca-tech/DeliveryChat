export type NewSignInAlertEmailProps = Readonly<{
  occurredAt: string;
  ip?: string | null;
  userAgent?: string | null;
  location?: string | null;
}>;

