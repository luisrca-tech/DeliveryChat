import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

export type EmailLayoutProps = Readonly<{
  preview: string;
  title: string;
  children: React.ReactNode;
  footerHint?: string;
}>;

const styles = {
  body: {
    backgroundColor: "#ffffff",
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  container: {
    margin: "0 auto",
    padding: "24px 16px 40px",
    maxWidth: "600px",
  },
  card: {
    border: "1px solid #eaeaea",
    borderRadius: "12px",
    padding: "24px",
  },
  title: {
    margin: "0 0 16px 0",
    fontSize: "22px",
    lineHeight: "28px",
    color: "#111827",
  },
  hr: {
    borderColor: "#eaeaea",
    margin: "24px 0",
  },
  footer: {
    margin: "16px 0 0 0",
    fontSize: "12px",
    lineHeight: "18px",
    color: "#6b7280",
  },
} as const;

export function EmailLayout(props: EmailLayoutProps) {
  const { preview, title, children, footerHint } = props;

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Heading style={styles.title}>{title}</Heading>
            {children}
            <Hr style={styles.hr} />
            <Text style={styles.footer}>
              {footerHint ??
                "If you didn’t request this, you can safely ignore this email."}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
