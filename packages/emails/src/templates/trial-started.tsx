import { Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { TrialStartedEmailProps } from "./types/trial-started";

export default function TrialStartedEmail(props: TrialStartedEmailProps) {
  const { plan, trialEndsAt, organizationName } = props;

  return (
    <EmailLayout
      preview={`Your ${plan} trial has started`}
      title="Your trial has started"
      footerHint="You can upgrade anytime from Billing."
    >
      <Text style={{ margin: "0 0 14px 0", color: "#374151" }}>
        You’re on a <strong>{plan}</strong> trial
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
        <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
          <span style={{ color: "#6b7280" }}>Trial ends: </span>
          <span style={{ fontWeight: 700 }}>{trialEndsAt}</span>
        </Text>
      </Section>

      <Text style={{ margin: 0, color: "#374151" }}>
        What to do next: set up your widget, invite a teammate, and explore
        settings so you’re ready before the trial ends.
      </Text>
    </EmailLayout>
  );
}

TrialStartedEmail.PreviewProps = {
  plan: "BASIC",
  trialEndsAt: "2026-02-21",
  organizationName: "Delivery Chat HQ",
} satisfies TrialStartedEmailProps;
