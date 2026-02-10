import { Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { EmailVerifiedWelcomeEmailProps } from "./types/email-verified-welcome";

export default function EmailVerifiedWelcomeEmail(
  props: EmailVerifiedWelcomeEmailProps,
) {
  const { userName, organizationName } = props;

  return (
    <EmailLayout
      preview="Your email is verified"
      title="You’re verified"
      footerHint="Welcome to Delivery Chat."
    >
      <Text style={{ margin: "0 0 14px 0", color: "#374151" }}>
        {userName ? `Hi ${userName},` : "Hi,"} your email is verified and your
        account is ready.
      </Text>

      <Section
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: "10px",
          padding: "14px 14px 6px",
          margin: "12px 0 18px",
        }}
      >
        {organizationName ? (
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>Organization: </span>
            <span style={{ fontWeight: 700 }}>{organizationName}</span>
          </Text>
        ) : null}
        <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
          <span style={{ color: "#6b7280" }}>Next steps: </span>
          <span style={{ fontWeight: 700 }}>
            connect your widget, review settings, and invite your team
          </span>
        </Text>
      </Section>

      <Text style={{ margin: 0, color: "#374151" }}>
        Tip: keep this email for your records. If you didn’t create this
        account, contact support.
      </Text>
    </EmailLayout>
  );
}

EmailVerifiedWelcomeEmail.PreviewProps = {
  userName: "Alex",
  organizationName: "Delivery Chat HQ",
} satisfies EmailVerifiedWelcomeEmailProps;

