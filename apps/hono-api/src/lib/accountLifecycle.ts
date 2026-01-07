/**
 * Account Lifecycle Policy Module
 *
 * This is the ONLY module allowed to interpret account status.
 * All business rules for status-based decisions must be centralized here.
 *
 * Enforcement Rule: If any file outside this module contains status-based
 * conditionals (if/switch on status), that is considered a bug.
 */

import type { InferSelectModel } from "drizzle-orm";
import type { user } from "../db/schema/users.js";
import type { organization } from "../db/schema/organization.js";

type User = InferSelectModel<typeof user>;
type Organization = InferSelectModel<typeof organization>;

type UserStatus = User["status"];
type OrganizationStatus = Organization["status"];

export type SignupAction = "REJECT" | "RESEND_OTP" | "ALLOW_NEW";

export type LoginOutcome =
  | "ALLOW"
  | "REJECT_EMAIL_NOT_VERIFIED"
  | "REJECT_SIGNUP_EXPIRED"
  | "REJECT_INVALID_CREDENTIALS";

const SIGNUP_ACTION_MAP: Record<UserStatus, SignupAction> = {
  ACTIVE: "REJECT",
  PENDING_VERIFICATION: "RESEND_OTP",
  EXPIRED: "ALLOW_NEW",
  DELETED: "ALLOW_NEW",
} as const;

const LOGIN_OUTCOME_MAP: Record<UserStatus, LoginOutcome> = {
  ACTIVE: "ALLOW",
  PENDING_VERIFICATION: "REJECT_EMAIL_NOT_VERIFIED",
  EXPIRED: "REJECT_SIGNUP_EXPIRED",
  DELETED: "REJECT_INVALID_CREDENTIALS",
} as const;

const SLUG_REUSE_MAP: Record<OrganizationStatus, boolean> = {
  ACTIVE: false,
  PENDING_VERIFICATION: false,
  EXPIRED: true,
  DELETED: true,
} as const;

const ERROR_MESSAGE_MAP: Record<LoginOutcome, string> = {
  ALLOW: "",
  REJECT_EMAIL_NOT_VERIFIED:
    "Email not verified. Please check your email for the verification code.",
  REJECT_SIGNUP_EXPIRED: "Signup expired. Please register again.",
  REJECT_INVALID_CREDENTIALS: "Invalid credentials",
} as const;

export function resolveSignupAction(
  user: User | null,
  pendingExpiresAt: string | null,
): SignupAction {
  if (!user) {
    return "ALLOW_NEW";
  }

  const baseAction = SIGNUP_ACTION_MAP[user.status];

  if (baseAction === "RESEND_OTP") {
    if (!pendingExpiresAt) {
      return "ALLOW_NEW";
    }

    const expiresAt = new Date(pendingExpiresAt);
    const now = new Date();

    if (expiresAt <= now) {
      return "ALLOW_NEW";
    }

    return "RESEND_OTP";
  }

  return baseAction;
}

export function resolveLoginOutcome(user: User): LoginOutcome {
  return LOGIN_OUTCOME_MAP[user.status];
}

export function canReuseOrganizationSlug(org: Organization | null): boolean {
  if (!org) {
    return true;
  }

  return SLUG_REUSE_MAP[org.status];
}

export function shouldExpireUser(user: User): boolean {
  if (user.status !== "PENDING_VERIFICATION") {
    return false;
  }

  if (!user.pendingExpiresAt) {
    return false;
  }

  const expiresAt = new Date(user.pendingExpiresAt);
  const now = new Date();

  return expiresAt <= now;
}

export function getStatusSpecificErrorMessage(outcome: LoginOutcome): string {
  return ERROR_MESSAGE_MAP[outcome];
}
