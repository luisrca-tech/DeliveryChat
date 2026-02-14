import { Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_components/EmailLayout";
import type { EnterprisePlanRequestEmailProps } from "./types/enterprise-plan-request";

function FieldRow(props: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
      <span style={{ color: "#6b7280" }}>{props.label}: </span>
      <span style={{ fontWeight: 600 }}>{props.value}</span>
    </Text>
  );
}

export default function EnterprisePlanRequestEmail(
  props: EnterprisePlanRequestEmailProps,
) {
  const { organizationName, adminEmail, memberCount, enterpriseDetails } =
    props;

  return (
    <EmailLayout
      preview={`Enterprise plan request from ${organizationName}`}
      title="Enterprise plan request"
      footerHint="This is an internal notification."
    >
      <Text style={{ margin: "0 0 16px 0", color: "#374151" }}>
        A new Enterprise plan request has been submitted.
      </Text>

      <Section
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: "10px",
          padding: "14px 14px 6px",
          margin: "14px 0 18px",
        }}
      >
        <FieldRow label="Organization" value={organizationName} />
        <FieldRow label="Admin email" value={adminEmail} />
        <FieldRow label="Member count" value={memberCount} />
      </Section>

      {enterpriseDetails ? (
        <>
          <Text style={{ margin: "0 0 12px 0", color: "#374151" }}>
            Contact details
          </Text>
          <Section
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #eaeaea",
              borderRadius: "10px",
              padding: "14px 14px 6px",
              margin: "0 0 6px",
            }}
          >
            <FieldRow label="Full name" value={enterpriseDetails.fullName} />
            <FieldRow label="Email" value={enterpriseDetails.email} />
            {enterpriseDetails.phone ? (
              <FieldRow label="Phone" value={enterpriseDetails.phone} />
            ) : null}
            {typeof enterpriseDetails.teamSize === "number" ? (
              <FieldRow label="Team size" value={enterpriseDetails.teamSize} />
            ) : null}
            {enterpriseDetails.notes ? (
              <Text
                style={{
                  margin: "10px 0 12px 0",
                  color: "#111827",
                  whiteSpace: "pre-wrap",
                }}
              >
                <span style={{ color: "#6b7280" }}>Notes: </span>
                <span style={{ fontWeight: 600 }}>
                  {enterpriseDetails.notes}
                </span>
              </Text>
            ) : null}
          </Section>
        </>
      ) : null}
    </EmailLayout>
  );
}

EnterprisePlanRequestEmail.PreviewProps = {
  organizationName: "Delivery Chat HQ",
  adminEmail: "admin@deliverychat.online",
  memberCount: 24,
  enterpriseDetails: {
    fullName: "Taylor Nguyen",
    email: "taylor@deliverychat.online",
    phone: "+1 (555) 010-2020",
    teamSize: 45,
    notes: "Looking for SSO + custom SLAs. Would like a demo next week.",
  },
} satisfies EnterprisePlanRequestEmailProps;
