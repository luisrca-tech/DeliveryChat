import { Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { TrialEndingSoonEmailProps } from "./types/trial-ending-soon";

export default function TrialEndingSoonEmail(props: TrialEndingSoonEmailProps) {
  const { plan, trialEndsAt, daysLeft, organizationName } = props;

  return (
    <EmailLayout
      preview={`Your trial ends in ${daysLeft} days`}
      title="Your trial is ending soon"
      footerHint="To keep access, choose a plan before your trial ends."
    >
      <Text style={{ margin: "0 0 14px 0", color: "#374151" }}>
        Heads up{organizationName ? `, ${organizationName}` : ""}: your{" "}
        <strong>{plan}</strong> trial ends in <strong>{daysLeft} days</strong>.
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
        Recommended: review Billing now so you don’t get interrupted.
      </Text>
    </EmailLayout>
  );
}

TrialEndingSoonEmail.PreviewProps = {
  plan: "PREMIUM",
  trialEndsAt: "2026-02-21",
  daysLeft: 3,
  organizationName: "Delivery Chat HQ",
} satisfies TrialEndingSoonEmailProps;

