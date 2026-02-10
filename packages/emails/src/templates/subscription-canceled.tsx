import { Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { SubscriptionCanceledEmailProps } from "./types/subscription-canceled";

export default function SubscriptionCanceledEmail(
  props: SubscriptionCanceledEmailProps,
) {
  const { effectiveAt, cancelAtPeriodEnd, organizationName } = props;

  const effectiveLabel = cancelAtPeriodEnd
    ? "Cancellation scheduled"
    : "Subscription canceled";

  return (
    <EmailLayout
      preview={effectiveLabel}
      title={effectiveLabel}
      footerHint="You can re-activate anytime from Billing."
    >
      <Text style={{ margin: "0 0 14px 0", color: "#374151" }}>
        {cancelAtPeriodEnd
          ? "Your subscription will cancel at the end of the current billing period."
          : "Your subscription has been canceled."}
        {organizationName ? ` (${organizationName})` : ""}
      </Text>

      <Section
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: "10px",
          padding: "14px 14px 6px",
          margin: "12px 0 18px",
        }}
      >
        <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
          <span style={{ color: "#6b7280" }}>
            {cancelAtPeriodEnd ? "Effective on: " : "Canceled on: "}
          </span>
          <span style={{ fontWeight: 700 }}>{effectiveAt}</span>
        </Text>
      </Section>

      <Text style={{ margin: 0, color: "#374151" }}>
        If this wasn’t expected, check Billing to re-activate.
      </Text>
    </EmailLayout>
  );
}

SubscriptionCanceledEmail.PreviewProps = {
  effectiveAt: "2026-03-07",
  cancelAtPeriodEnd: true,
  organizationName: "Delivery Chat HQ",
} satisfies SubscriptionCanceledEmailProps;

