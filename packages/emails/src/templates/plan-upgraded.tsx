import { Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { PlanUpgradedEmailProps } from "./types/plan-upgraded";

export default function PlanUpgradedEmail(props: PlanUpgradedEmailProps) {
  const { plan, organizationName, nextBillingDate } = props;

  return (
    <EmailLayout
      preview={`You're now on ${plan}`}
      title={`Welcome to ${plan}`}
      footerHint="Thanks for upgrading."
    >
      <Text style={{ margin: "0 0 14px 0", color: "#374151" }}>
        Congrats{organizationName ? `, ${organizationName}` : ""}. Your
        subscription is now active on <strong>{plan}</strong>.
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
          <span style={{ color: "#6b7280" }}>Plan: </span>
          <span style={{ fontWeight: 700 }}>{plan}</span>
        </Text>
        {nextBillingDate ? (
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>Next billing date: </span>
            <span style={{ fontWeight: 700 }}>{nextBillingDate}</span>
          </Text>
        ) : null}
      </Section>

      <Text style={{ margin: 0, color: "#374151" }}>
        Next steps: explore Billing, set up your widget, and invite your team
        when you’re ready.
      </Text>
    </EmailLayout>
  );
}

PlanUpgradedEmail.PreviewProps = {
  plan: "PREMIUM",
  organizationName: "Delivery Chat HQ",
  nextBillingDate: "2026-03-07",
} satisfies PlanUpgradedEmailProps;

