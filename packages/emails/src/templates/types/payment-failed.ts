export type PaymentFailedEmailProps = Readonly<{
  amount?: string | null;
  currency?: string | null;
  nextRetryAt?: string | null;
  organizationName?: string;
}>;

