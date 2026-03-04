import { Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { RateLimitAlertEmailProps } from "./types/rate-limit-alert";

const WINDOW_LABELS: Record<string, string> = {
  second: "per second",
  minute: "per minute",
  hour: "per hour",
};

export default function RateLimitAlertEmail(props: RateLimitAlertEmailProps) {
  const { organizationName, window, currentCount, limit } = props;
  const windowLabel = WINDOW_LABELS[window] ?? window;

  return (
    <EmailLayout
      preview={`Rate limit exceeded for ${organizationName}`}
      title="Rate limit exceeded"
    >
      <Text style={{ margin: "0 0 16px 0", color: "#374151" }}>
        Your organization <strong>{organizationName}</strong> has exceeded its
        rate limit.
      </Text>

      <Section
        style={{
          backgroundColor: "#fef2f2",
          borderRadius: "10px",
          padding: "14px",
          margin: "14px 0 18px",
          border: "1px solid #fecaca",
        }}
      >
        <Text style={{ margin: "0 0 8px 0", color: "#991b1b" }}>
          <strong>Limit exceeded</strong>
        </Text>
        <Text style={{ margin: "0 0 4px 0", color: "#374151" }}>
          Window: {windowLabel}
        </Text>
        <Text style={{ margin: "0 0 4px 0", color: "#374151" }}>
          Current requests: {currentCount}
        </Text>
        <Text style={{ margin: "0", color: "#374151" }}>Limit: {limit}</Text>
      </Section>

      <Text style={{ margin: "0 0 16px 0", color: "#374151" }}>
        Consider upgrading your plan or reducing request volume. You can view
        and configure rate limits in your organization settings.
      </Text>
    </EmailLayout>
  );
}
