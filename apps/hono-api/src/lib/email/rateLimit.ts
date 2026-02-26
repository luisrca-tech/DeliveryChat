import * as React from "react";
import { RateLimitAlertEmail } from "@repo/emails";
import { sendEmail } from "./client.js";
import type { RateLimitWindow } from "../../features/rate-limiting/types.js";

export async function sendRateLimitAlertEmail(params: {
  to: string;
  organizationName: string;
  window: RateLimitWindow;
  currentCount: number;
  limit: number;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Rate limit exceeded - ${params.organizationName}`,
    template: React.createElement(RateLimitAlertEmail, {
      organizationName: params.organizationName,
      window: params.window,
      currentCount: params.currentCount,
      limit: params.limit,
    }),
  });
}
