function normalizeIsoInstant(input: string): string {
  const s = input.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00Z`;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    return `${s.replace(" ", "T")}Z`;
  }

  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(s);
  if (s.includes("T") && !hasTimezone) return `${s}Z`;

  return s;
}

export function daysUntil(iso: string): number {
  const normalized = normalizeIsoInstant(iso);
  const targetMs = new Date(normalized).getTime();
  if (!Number.isFinite(targetMs)) return 0;

  const ms = targetMs - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/**
 * Stable key for the current billing banner variant. Used with session id so
 * dismiss state resets when Better Auth issues a new session (e.g. after login).
 */
export function getBillingBannerDismissKey(input: {
  planStatus: string | undefined;
  trialEndsAt: string | null | undefined;
}): string | null {
  if (!input.planStatus) return null;

  if (input.planStatus === "past_due") return "past_due";

  if (input.planStatus === "trialing") {
    if (!input.trialEndsAt) return "trialing_no_end";
    const days = daysUntil(input.trialEndsAt);
    if (days <= 0) return "trial_ended";
    return "trialing_countdown";
  }

  return null;
}

export const BILLING_ALERT_DISMISS_STORAGE_PREFIX =
  "delivery_chat_billing_alert_dismissed";

export function getBillingAlertDismissStorageKey(
  sessionId: string,
  bannerKey: string,
): string {
  return `${BILLING_ALERT_DISMISS_STORAGE_PREFIX}:${sessionId}:${bannerKey}`;
}
