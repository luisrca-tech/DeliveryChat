import { Button, Link, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_components/EmailLayout";
import type { ResetPasswordEmailProps } from "./types/reset-password";

export default function ResetPasswordEmail(props: ResetPasswordEmailProps) {
  const { url, userName } = props;

  return (
    <EmailLayout
      preview="Reset your password"
      title="Reset your password"
      footerHint="This link expires in 1 hour."
    >
      <Text style={{ margin: "0 0 16px 0", color: "#374151" }}>
        {userName ? `Hi ${userName},` : "Hi,"}
      </Text>
      <Text style={{ margin: "0 0 18px 0", color: "#374151" }}>
        We received a request to reset your password. If this was you, use the
        button below to create a new password.
      </Text>

      <Section style={{ textAlign: "center", margin: "22px 0 18px" }}>
        <Button
          href={url}
          style={{
            backgroundColor: "#111827",
            color: "#ffffff",
            borderRadius: "10px",
            padding: "12px 18px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Reset password
        </Button>
      </Section>

      <Text style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#6b7280" }}>
        If the button doesn’t work, copy and paste this link into your browser:
      </Text>
      <Text style={{ margin: 0, fontSize: "13px", wordBreak: "break-all" }}>
        <Link
          href={url}
          style={{ color: "#111827", textDecoration: "underline" }}
        >
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}

ResetPasswordEmail.PreviewProps = {
  userName: "Alex",
  url: "https://example.com/reset-password?token=abc123",
} satisfies ResetPasswordEmailProps;

