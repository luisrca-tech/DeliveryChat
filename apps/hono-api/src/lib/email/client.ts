import { Resend } from "resend";
import { render, toPlainText } from "@react-email/render";
import { env } from "../../env.js";
import * as React from "react";

const resend = new Resend(env.RESEND_API_KEY);

const getFromEmail = () =>
  env.EMAIL_FROM || "Delivery Chat <noreply@deliverychat.online>";

async function renderEmail(template: React.ReactElement): Promise<{
  html: string;
  text: string;
}> {
  const html = await render(template);
  return { html, text: toPlainText(html) };
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  template: React.ReactElement;
}): Promise<void> {
  if (process.env.VERCEL_ENV === "preview") {
    console.info("[Email] Suppressed in preview environment");
    return;
  }

  const { html, text } = await renderEmail(params.template);
  const result = await resend.emails.send({
    from: getFromEmail(),
    to: params.to,
    subject: params.subject,
    html,
    text,
  });

  if (result.error) {
    console.error("[Email] Resend API error:", result.error);
    throw new Error(result.error.message || "Failed to send email");
  }
}
