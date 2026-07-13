import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_components/EmailLayout";
import type { AiAddonActivatedEmailProps } from "./types/ai-addon-activated";

export default function AiAddonActivatedEmail(
  props: AiAddonActivatedEmailProps,
) {
  const { amount, currency, organizationName, settingsUrl } = props;

  return (
    <EmailLayout
      preview="Your AI Assistant add-on is now active"
      title="AI Assistant add-on is now active"
      footerHint="Thanks for adding the AI Assistant."
    >
      <Text style={{ margin: "0 0 14px 0", color: "#374151" }}>
        Good news{organizationName ? `, ${organizationName}` : ""}. The AI
        Assistant add-on is now <strong>active</strong> on your subscription.
      </Text>

      {amount && currency ? (
        <Section
          style={{
            backgroundColor: "#f9fafb",
            borderRadius: "10px",
            padding: "14px 14px 6px",
            margin: "12px 0 18px",
          }}
        >
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>Price: </span>
            <span style={{ fontWeight: 700 }}>
              {amount} {currency.toUpperCase()}/month
            </span>
          </Text>
        </Section>
      ) : null}

      <Text style={{ margin: "0 0 8px 0", color: "#374151" }}>
        Next steps to get the most out of it:
      </Text>
      <ul style={{ margin: "0 0 18px 0", paddingLeft: "20px", color: "#374151" }}>
        <li style={{ marginBottom: "6px" }}>
          Configure the AI context for each application.
        </li>
        <li style={{ marginBottom: "6px" }}>
          Enable auto-respond so the AI answers visitors directly.
        </li>
        <li style={{ marginBottom: "6px" }}>
          Add data tools to ground answers in your own data.
        </li>
      </ul>

      <Section style={{ textAlign: "center", margin: "22px 0 18px" }}>
        <Button
          href={settingsUrl}
          style={{
            backgroundColor: "#111827",
            color: "#ffffff",
            borderRadius: "10px",
            padding: "12px 24px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Open admin settings
        </Button>
      </Section>
    </EmailLayout>
  );
}

AiAddonActivatedEmail.PreviewProps = {
  amount: "120.00",
  currency: "brl",
  organizationName: "Delivery Chat HQ",
  settingsUrl: "https://acme.deliverychat.online/settings/billing",
} satisfies AiAddonActivatedEmailProps;
