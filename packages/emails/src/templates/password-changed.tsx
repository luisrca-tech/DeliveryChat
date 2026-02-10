import { Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { PasswordChangedEmailProps } from "./types/password-changed";

export default function PasswordChangedEmail(props: PasswordChangedEmailProps) {
  const { occurredAt } = props;

  return (
    <EmailLayout
      preview="Your password was changed"
      title="Password changed"
      footerHint="If this wasn’t you, reset your password immediately."
    >
      <Text style={{ margin: "0 0 14px 0", color: "#374151" }}>
        This is a security notification that your password was changed.
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
          <span style={{ color: "#6b7280" }}>Time: </span>
          <span style={{ fontWeight: 700 }}>{occurredAt}</span>
        </Text>
      </Section>

      <Text style={{ margin: 0, color: "#374151" }}>
        If you didn’t make this change, reset your password and review active
        sessions.
      </Text>
    </EmailLayout>
  );
}

PasswordChangedEmail.PreviewProps = {
  occurredAt: "2026-02-07 18:20 UTC",
} satisfies PasswordChangedEmailProps;

