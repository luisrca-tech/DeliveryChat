import { Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { NewSignInAlertEmailProps } from "./types/new-sign-in-alert";

export default function NewSignInAlertEmail(props: NewSignInAlertEmailProps) {
  const { occurredAt, ip, userAgent, location } = props;

  return (
    <EmailLayout
      preview="New sign-in to your account"
      title="New sign-in detected"
      footerHint="If this wasn’t you, secure your account immediately."
    >
      <Text style={{ margin: "0 0 14px 0", color: "#374151" }}>
        We noticed a new sign-in to your account.
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
        {ip ? (
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>IP: </span>
            <span style={{ fontWeight: 700 }}>{ip}</span>
          </Text>
        ) : null}
        {location ? (
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>Location: </span>
            <span style={{ fontWeight: 700 }}>{location}</span>
          </Text>
        ) : null}
        {userAgent ? (
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>Device: </span>
            <span style={{ fontWeight: 700 }}>{userAgent}</span>
          </Text>
        ) : null}
      </Section>

      <Text style={{ margin: 0, color: "#374151" }}>
        If you don’t recognize this activity, reset your password and revoke
        active sessions.
      </Text>
    </EmailLayout>
  );
}

NewSignInAlertEmail.PreviewProps = {
  occurredAt: "2026-02-07 18:20 UTC",
  ip: "203.0.113.42",
  location: "Sao Paulo, BR",
  userAgent: "Chrome on macOS",
} satisfies NewSignInAlertEmailProps;
