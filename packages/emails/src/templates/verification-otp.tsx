import { CodeInline, Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { VerificationOtpEmailProps } from "./types/verification-otp";

export default function VerificationOtpEmail(props: VerificationOtpEmailProps) {
  const { otp } = props;

  return (
    <EmailLayout
      preview={`Your verification code is ${otp}`}
      title="Verify your email address"
      footerHint="This code expires in 5 minutes."
    >
      <Text style={{ margin: "0 0 16px 0", color: "#374151" }}>
        Thanks for signing up. Use the verification code below to complete your
        registration.
      </Text>

      <Section
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: "10px",
          padding: "18px 16px",
          textAlign: "center",
          margin: "16px 0 8px",
        }}
      >
        <Text
          style={{
            fontSize: "28px",
            lineHeight: "34px",
            fontWeight: 700,
            letterSpacing: "0.35em",
            margin: 0,
            color: "#111827",
          }}
        >
          <CodeInline>{otp}</CodeInline>
        </Text>
      </Section>

      <Text
        style={{ margin: "12px 0 0 0", fontSize: "13px", color: "#6b7280" }}
      >
        Didn’t request this? You can ignore this email.
      </Text>
    </EmailLayout>
  );
}

VerificationOtpEmail.PreviewProps = {
  otp: "482913",
} satisfies VerificationOtpEmailProps;
