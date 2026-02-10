import { Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { PaymentFailedEmailProps } from "./types/payment-failed";

export default function PaymentFailedEmail(props: PaymentFailedEmailProps) {
  const { amount, currency, nextRetryAt, organizationName } = props;

  return (
    <EmailLayout
      preview="Your payment didn’t go through"
      title="Payment failed"
      footerHint="To avoid interruption, update your payment method in Billing."
    >
      <Text style={{ margin: "0 0 14px 0", color: "#374151" }}>
        We couldn’t process your latest payment
        {organizationName ? ` for ${organizationName}` : ""}.
      </Text>

      <Section
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: "10px",
          padding: "14px 14px 6px",
          margin: "12px 0 18px",
        }}
      >
        {amount && currency ? (
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>Amount: </span>
            <span style={{ fontWeight: 700 }}>
              {amount} {currency.toUpperCase()}
            </span>
          </Text>
        ) : null}
        {nextRetryAt ? (
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>Next retry: </span>
            <span style={{ fontWeight: 700 }}>{nextRetryAt}</span>
          </Text>
        ) : null}
      </Section>

      <Text style={{ margin: 0, color: "#374151" }}>
        Update your payment method in Billing. We’ll automatically retry when
        possible.
      </Text>
    </EmailLayout>
  );
}

PaymentFailedEmail.PreviewProps = {
  amount: "99.00",
  currency: "usd",
  nextRetryAt: "2026-02-08",
  organizationName: "Delivery Chat HQ",
} satisfies PaymentFailedEmailProps;

