import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  daysUntil,
  getBillingBannerDismissKey,
  getBillingAlertDismissStorageKey,
  BILLING_ALERT_DISMISS_STORAGE_PREFIX,
} from "./billing.utils";

describe("getBillingBannerDismissKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when planStatus is missing", () => {
    expect(getBillingBannerDismissKey({ planStatus: undefined, trialEndsAt: null })).toBeNull();
  });

  it("returns past_due for past_due status", () => {
    expect(
      getBillingBannerDismissKey({ planStatus: "past_due", trialEndsAt: null }),
    ).toBe("past_due");
  });

  it("returns trialing_no_end when trialing without trial end date", () => {
    expect(
      getBillingBannerDismissKey({ planStatus: "trialing", trialEndsAt: undefined }),
    ).toBe("trialing_no_end");
  });

  it("returns trial_ended when trialing but trial end is in the past", () => {
    expect(
      getBillingBannerDismissKey({
        planStatus: "trialing",
        trialEndsAt: "2026-04-09T00:00:00.000Z",
      }),
    ).toBe("trial_ended");
  });

  it("returns trialing_countdown when trial has days remaining", () => {
    expect(
      getBillingBannerDismissKey({
        planStatus: "trialing",
        trialEndsAt: "2026-04-25T00:00:00.000Z",
      }),
    ).toBe("trialing_countdown");
  });
});

describe("getBillingAlertDismissStorageKey", () => {
  it("builds a namespaced key from session and banner", () => {
    expect(getBillingAlertDismissStorageKey("sess_1", "trialing_countdown")).toBe(
      `${BILLING_ALERT_DISMISS_STORAGE_PREFIX}:sess_1:trialing_countdown`,
    );
  });
});

describe("daysUntil", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns positive days for a future date", () => {
    expect(daysUntil("2026-04-25T00:00:00.000Z")).toBeGreaterThan(0);
  });
});
