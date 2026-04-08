import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_components/EmailLayout";
import type { OrganizationInvitationEmailProps } from "./types/organization-invitation";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  operator: "Operator",
};

export default function OrganizationInvitationEmail(
  props: OrganizationInvitationEmailProps,
) {
  const { inviteLink, inviterName, organizationName, role } = props;
  const roleLabel = roleLabels[role] ?? role;

  return (
    <EmailLayout
      preview={`You've been invited to join ${organizationName}`}
      title="You're invited!"
      footerHint="This invitation expires in 7 days."
    >
      <Text style={{ margin: "0 0 16px 0", color: "#374151" }}>
        Hi there,
      </Text>
      <Text style={{ margin: "0 0 18px 0", color: "#374151" }}>
        <strong>{inviterName}</strong> has invited you to join{" "}
        <strong>{organizationName}</strong> as {roleLabel === "Operator" ? "an" : "a"}{" "}
        <strong>{roleLabel}</strong> on Delivery Chat.
      </Text>

      <Section style={{ textAlign: "center", margin: "22px 0 18px" }}>
        <Button
          href={inviteLink}
          style={{
            backgroundColor: "#111827",
            color: "#ffffff",
            borderRadius: "10px",
            padding: "12px 24px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Accept Invitation
        </Button>
      </Section>

      <Text
        style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#6b7280" }}
      >
        If you don't want to join, you can simply ignore this email or click the
        link below to decline.
      </Text>
    </EmailLayout>
  );
}

OrganizationInvitationEmail.PreviewProps = {
  inviterName: "Luis Felipe",
  organizationName: "Acme Corp",
  role: "operator",
  inviteLink: "https://acme.deliverychat.online/accept-invitation/inv_abc123",
} satisfies OrganizationInvitationEmailProps;
